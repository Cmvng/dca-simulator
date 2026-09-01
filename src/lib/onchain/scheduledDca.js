import { allocateCents, toCents } from "../simulation/dca.js";
import {
  assessMarketData,
  createValuationScales,
  normalizeCandles,
  projectValuationAtPrice,
} from "./dcaEngine.js";

const DAY_SECONDS = 86_400;
const YEAR_DAYS = 365;
const MIN_DURATION_DAYS = 7;
const MAX_DURATION_DAYS = 90;
// Matches the product form's declared min/max (OnchainAnalyzer target input),
// so the engine's validation message never advertises an unreachable range.
const MIN_TARGET_PCT = 5;
const MAX_TARGET_PCT = 500;
const MAX_TOTAL_USD = 10_000_000;
const MIN_REVIEW_LOG_MOVE = -Math.log(0.97);
const MAX_REVIEW_LOG_MOVE = -Math.log(0.10);
const MAX_SAFE_LOG_MOVE = Math.log(1_000);
const MAX_CUMULATIVE_LOG_MOVE = Math.log(1_000_000_000_000);
const MIN_SIMULATED_PRICE = 1e-300;
const MAX_SIMULATED_PRICE = 1e300;
const MIN_SIMULATED_LOG_PRICE = Math.log(MIN_SIMULATED_PRICE);
const MAX_SIMULATED_LOG_PRICE = Math.log(MAX_SIMULATED_PRICE);

export const SCHEDULED_DCA_FREQUENCIES = Object.freeze([
  Object.freeze({ id: "1h", label: "Every hour", seconds: 3_600 }),
  Object.freeze({ id: "6h", label: "Every 6 hours", seconds: 21_600 }),
  Object.freeze({ id: "12h", label: "Every 12 hours", seconds: 43_200 }),
  Object.freeze({ id: "daily", label: "Every day", seconds: DAY_SECONDS }),
  Object.freeze({ id: "weekly", label: "Every week", seconds: 7 * DAY_SECONDS }),
]);

export const DEFAULT_SCHEDULED_DCA_FREQUENCY_ID = "daily";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;
const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

function asEpochSeconds(value, fallbackSeconds = null) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Math.floor(value.getTime() / 1_000);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value > 100_000_000_000 ? value / 1_000 : value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return asEpochSeconds(numeric, fallbackSeconds);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1_000);
  }
  return fallbackSeconds;
}

function frequencyById(frequencyId) {
  return SCHEDULED_DCA_FREQUENCIES.find(item => item.id === frequencyId) || null;
}

function isoFromSeconds(seconds) {
  return Number.isFinite(seconds) ? new Date(seconds * 1_000).toISOString() : null;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squared = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0);
  return Math.sqrt(squared / (values.length - 1));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizedReturnSample(candles, expectedIntervalSeconds) {
  const intervals = [];
  for (let index = 1; index < candles.length; index += 1) {
    const interval = candles[index].time - candles[index - 1].time;
    if (interval > 0) intervals.push(interval);
  }

  const suppliedInterval = finitePositive(expectedIntervalSeconds)
    ? Number(expectedIntervalSeconds)
    : null;
  const inferredIntervalSeconds = median(intervals);
  const sourceIntervalSeconds = suppliedInterval || inferredIntervalSeconds || DAY_SECONDS;
  const observations = [];

  for (let index = 1; index < candles.length; index += 1) {
    const intervalSeconds = candles[index].time - candles[index - 1].time;
    if (!(intervalSeconds > 0)) continue;
    const rawLogReturn = Math.log(candles[index].close / candles[index - 1].close);
    if (!Number.isFinite(rawLogReturn)) continue;
    const normalizedLogReturn = rawLogReturn * Math.sqrt(sourceIntervalSeconds / intervalSeconds);
    if (!Number.isFinite(normalizedLogReturn)) continue;
    observations.push({
      candleIndex: index,
      intervalSeconds,
      rawLogReturn,
      normalizedLogReturn,
    });
  }

  return {
    suppliedInterval,
    inferredIntervalSeconds,
    sourceIntervalSeconds,
    observations,
  };
}

function volatilityCategory(typicalDailySwingPct) {
  if (typicalDailySwingPct < 2) return "Stable-like";
  if (typicalDailySwingPct < 5) return "Moderate";
  if (typicalDailySwingPct < 10) return "High";
  if (typicalDailySwingPct < 20) return "Very high";
  return "Extreme";
}

function hashSeed(value) {
  let hash = 0x811c9dc5;
  const string = String(value);
  for (let index = 0; index < string.length; index += 1) {
    hash ^= string.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizeSeed(seed, fallbackMaterial) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === "string" && seed.length) return hashSeed(seed);
  return hashSeed(fallbackMaterial);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function plainQualityBlocker(blocker) {
  if (/At least 20 valid candles/i.test(blocker)) {
    return "At least 20 valid candles are needed to measure this token's recent volatility.";
  }
  if (/cover at least 24 hours/i.test(blocker)) {
    return "The available candles must cover at least 24 hours before a schedule can be simulated.";
  }
  if (/too sparse/i.test(blocker)) {
    return "Too many candles are missing to build a reliable volatility simulation.";
  }
  if (/latest candle is stale/i.test(blocker)) {
    return "The latest candle is too old for the selected market data.";
  }
  if (/DCA reference ladder/i.test(blocker)) {
    return blocker.replace(/DCA reference ladder/gi, "DCA simulation");
  }
  return blocker;
}

/**
 * Build the exact calendar of intended purchases. The first purchase is at
 * startsAt and every later purchase is exactly frequency.seconds later. The
 * end timestamp is exclusive, so a 30-day daily plan contains 30 purchases.
 * No hidden minimum or maximum purchase-count clamp is applied.
 */
export function buildScheduledDcaSchedule({
  totalUsd,
  frequencyId = DEFAULT_SCHEDULED_DCA_FREQUENCY_ID,
  durationDays,
  startsAt,
} = {}) {
  const errors = [];
  const frequency = frequencyById(frequencyId);
  const normalizedTotal = Number(totalUsd);
  const normalizedDuration = Number(durationDays);
  const startSeconds = asEpochSeconds(startsAt, Math.floor(Date.now() / 1_000));

  if (!frequency) errors.push("Choose a supported buy frequency.");
  if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
    errors.push("Enter a total DCA amount greater than $0.");
  } else if (normalizedTotal > MAX_TOTAL_USD) {
    errors.push(`The maximum supported DCA amount is $${MAX_TOTAL_USD.toLocaleString("en-US")}.`);
  }
  if (!Number.isFinite(normalizedDuration)
    || !Number.isInteger(normalizedDuration)
    || normalizedDuration < MIN_DURATION_DAYS
    || normalizedDuration > MAX_DURATION_DAYS) {
    errors.push(`Duration must be a whole number from ${MIN_DURATION_DAYS} to ${MAX_DURATION_DAYS} days.`);
  }
  if (!Number.isFinite(startSeconds)) errors.push("A valid schedule start time is required.");

  if (errors.length || !frequency) {
    return {
      ok: false,
      errors,
      frequency,
      purchaseCount: 0,
      scheduledBuys: [],
    };
  }

  const durationSeconds = normalizedDuration * DAY_SECONDS;
  const endSeconds = startSeconds + durationSeconds;
  const purchaseCount = Math.ceil(durationSeconds / frequency.seconds);
  const totalCents = toCents(normalizedTotal);

  if (totalCents < purchaseCount) {
    errors.push(
      `${purchaseCount.toLocaleString("en-US")} buys cannot be split into whole cents from this budget. Increase the amount or buy less often.`,
    );
    return {
      ok: false,
      errors,
      frequency,
      startsAt: isoFromSeconds(startSeconds),
      endsAt: isoFromSeconds(endSeconds),
      durationDays: normalizedDuration,
      purchaseCount,
      amountPerBuyUsd: normalizedTotal / purchaseCount,
      scheduledBuys: [],
    };
  }

  const amountsCents = allocateCents(totalCents, purchaseCount);
  const scheduledBuys = amountsCents.map((amountCents, index) => ({
    id: `B${index + 1}`,
    time: startSeconds + (index * frequency.seconds),
    amountUsd: amountCents / 100,
  }));
  const amountsUsd = scheduledBuys.map(buy => buy.amountUsd);

  return {
    ok: true,
    errors: [],
    frequency,
    startsAt: isoFromSeconds(startSeconds),
    endsAt: isoFromSeconds(endSeconds),
    durationDays: normalizedDuration,
    purchaseCount,
    amountPerBuyUsd: totalCents / purchaseCount / 100,
    amountRangeUsd: {
      min: Math.min(...amountsUsd),
      max: Math.max(...amountsUsd),
    },
    scheduledBuys,
  };
}

/**
 * Close-to-close realized volatility. The primary user-facing number is a
 * measurable one-standard-deviation daily swing. The 0-100 score is only a
 * readability index (20% daily log volatility maps to 100); it is not a
 * probability and is never labelled as one.
 */
export function calculateScheduledVolatility(rawCandles = [], expectedIntervalSeconds) {
  const candles = normalizeCandles(rawCandles);
  const sample = normalizedReturnSample(candles, expectedIntervalSeconds);
  const returns = sample.observations.map(item => item.normalizedLogReturn);

  if (returns.length < 2) {
    return {
      ok: false,
      reason: "At least three valid closes are needed to measure volatility.",
      method: "Close-to-close realized log-return volatility",
      forecast: false,
      returns: [],
    };
  }

  const { suppliedInterval, inferredIntervalSeconds, sourceIntervalSeconds } = sample;
  const sourceSigma = sampleStandardDeviation(returns);
  const dailySigma = sourceSigma * Math.sqrt(DAY_SECONDS / sourceIntervalSeconds);
  const safeDailySigma = Number.isFinite(dailySigma) ? Math.max(0, dailySigma) : 0;
  const typicalDailySwingPct = Math.expm1(Math.min(safeDailySigma, MAX_SAFE_LOG_MOVE)) * 100;
  const dailyPct = safeDailySigma * 100;
  const annualizedPct = safeDailySigma * Math.sqrt(YEAR_DAYS) * 100;
  const score = Math.round(clamp((safeDailySigma / 0.20) * 100, 0, 100));

  return {
    ok: true,
    method: "Close-to-close realized log-return volatility with square-root-of-time scaling",
    forecast: false,
    sourceIntervalSeconds,
    inferredIntervalSeconds,
    expectedIntervalSeconds: suppliedInterval,
    intervalNormalization: "Each log return is square-root-of-time normalized to sourceIntervalSeconds before volatility is measured",
    irregularIntervalCount: sample.observations.filter(
      item => Math.abs(item.intervalSeconds - sourceIntervalSeconds) > sourceIntervalSeconds * 0.01,
    ).length,
    sourcePct: sourceSigma * 100,
    dailyPct,
    typicalDailySwingPct,
    annualizedPct,
    score,
    category: volatilityCategory(typicalDailySwingPct),
    sampleCandles: candles.length,
    sampleReturns: returns.length,
    sampleStart: isoFromSeconds(candles[0].time),
    sampleEnd: isoFromSeconds(candles.at(-1).time),
    returns,
  };
}

function buildEmpiricalSamples(candles, returns) {
  const mean = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : 0;
  const sigma = sampleStandardDeviation(returns);

  return returns.map((logReturn, index) => {
    const candle = candles[index + 1];
    const upperBody = Math.max(candle.open, candle.close);
    const lowerBody = Math.min(candle.open, candle.close);
    return {
      z: sigma > 0 ? (logReturn - mean) / sigma : 0,
      upperWickLog: candle.high > upperBody ? Math.log(candle.high / upperBody) : 0,
      lowerWickLog: candle.low < lowerBody ? Math.log(lowerBody / candle.low) : 0,
    };
  });
}

function projectCandle(candle, valuationScales) {
  return {
    open: projectFiniteValuation(candle.open, valuationScales),
    high: projectFiniteValuation(candle.high, valuationScales),
    low: projectFiniteValuation(candle.low, valuationScales),
    close: projectFiniteValuation(candle.close, valuationScales),
  };
}

function projectFiniteValuation(price, valuationScales) {
  const projection = projectValuationAtPrice(price, valuationScales);
  return {
    priceUsd: Number.isFinite(projection.priceUsd) ? projection.priceUsd : null,
    marketCapUsd: Number.isFinite(projection.marketCapUsd) ? projection.marketCapUsd : null,
    fdvUsd: Number.isFinite(projection.fdvUsd) ? projection.fdvUsd : null,
  };
}

function buildScenarioCandles({
  candles,
  startPrice,
  startsAtSeconds,
  endsAtSeconds,
  stepSeconds,
  dailySigma,
  sourceIntervalSeconds,
  normalizedReturns,
  seed,
  valuationScales,
}) {
  const samples = buildEmpiricalSamples(candles, normalizedReturns);
  const random = mulberry32(seed);
  const result = [];
  const rawStartLog = Math.log(startPrice);
  const startLog = clamp(rawStartLog, MIN_SIMULATED_LOG_PRICE, MAX_SIMULATED_LOG_PRICE);
  const lowerLogBound = Math.max(
    MIN_SIMULATED_LOG_PRICE,
    startLog - MAX_CUMULATIVE_LOG_MOVE,
  );
  const upperLogBound = Math.min(
    MAX_SIMULATED_LOG_PRICE,
    startLog + MAX_CUMULATIVE_LOG_MOVE,
  );
  let openLog = startLog;
  let capped = false;
  if (startLog !== rawStartLog) capped = true;

  for (let time = startsAtSeconds; time < endsAtSeconds; time += stepSeconds) {
    const closeTime = Math.min(endsAtSeconds, time + stepSeconds);
    const actualStepSeconds = closeTime - time;
    const sigmaStep = dailySigma * Math.sqrt(actualStepSeconds / DAY_SECONDS);
    const sample = samples.length
      ? samples[Math.min(samples.length - 1, Math.floor(random() * samples.length))]
      : { z: 0, upperWickLog: 0, lowerWickLog: 0 };
    const rawMove = sample.z * sigmaStep;
    const move = clamp(rawMove, -MAX_SAFE_LOG_MOVE, MAX_SAFE_LOG_MOVE);
    if (move !== rawMove) capped = true;
    const rawCloseLog = openLog + move;
    const closeLog = clamp(rawCloseLog, lowerLogBound, upperLogBound);
    if (closeLog !== rawCloseLog) capped = true;
    const wickScale = Math.sqrt(actualStepSeconds / Math.max(1, sourceIntervalSeconds));
    const rawUpperWick = sample.upperWickLog * wickScale;
    const rawLowerWick = sample.lowerWickLog * wickScale;
    const upperWick = clamp(rawUpperWick, 0, MAX_SAFE_LOG_MOVE);
    const lowerWick = clamp(rawLowerWick, 0, MAX_SAFE_LOG_MOVE);
    if (upperWick !== rawUpperWick || lowerWick !== rawLowerWick) capped = true;
    const rawHighLog = Math.max(openLog, closeLog) + upperWick;
    const rawLowLog = Math.min(openLog, closeLog) - lowerWick;
    const highLog = clamp(rawHighLog, lowerLogBound, upperLogBound);
    const lowLog = clamp(rawLowLog, lowerLogBound, upperLogBound);
    if (highLog !== rawHighLog || lowLog !== rawLowLog) capped = true;
    const scenarioCandle = {
      time,
      closeTime,
      open: Math.exp(openLog),
      high: Math.exp(highLog),
      low: Math.exp(lowLog),
      close: Math.exp(closeLog),
      simulated: true,
    };
    result.push({
      ...scenarioCandle,
      valuation: projectCandle(scenarioCandle, valuationScales),
    });
    openLog = closeLog;
  }

  return { candles: result, capped };
}

function invalidInputResult({
  schedule,
  quality,
  volatility,
  blockers,
  warnings,
  valuationScales,
  inputs,
}) {
  const simulatedBuys = [];
  return {
    schemaVersion: 1,
    mode: "scheduled-dca-simulation",
    canSimulate: false,
    quality,
    blockingReasons: blockers,
    warnings,
    assumptions: [],
    valuationScales,
    inputs,
    frequency: schedule.frequency || null,
    schedule,
    volatility,
    scenario: null,
    executedBuys: simulatedBuys,
    simulatedBuys,
    target: null,
    review: null,
    terminalEvent: null,
    totalInvestedUsd: 0,
    unusedBudgetUsd: finitePositive(inputs.totalUsd) ? roundMoney(inputs.totalUsd) : null,
    totalTokenAmount: 0,
    averageEntryUsd: null,
  };
}

/**
 * Build one schedule-first DCA illustration for an exact token/pool.
 *
 * The simulated candles are a seeded bootstrap of centered historical return
 * shapes, scaled to the measured volatility and anchored to the current pool
 * quote. They are deliberately marked simulated/illustrative/forecast:false.
 * A close through S or X stops later simulated buys; it never represents an
 * exchange order or a completed sale.
 */
export function buildScheduledDcaPlan({
  rawCandles,
  candles: suppliedCandles,
  market = {},
  totalUsd = 500,
  frequencyId = DEFAULT_SCHEDULED_DCA_FREQUENCY_ID,
  durationDays = 30,
  targetPct = 50,
  expectedIntervalSeconds,
  dataAsOf,
  seed,
} = {}) {
  const candles = normalizeCandles(suppliedCandles || rawCandles || []);
  const fallbackStart = candles.at(-1)?.time ?? null;
  const startsAtSeconds = asEpochSeconds(dataAsOf, fallbackStart);
  const schedule = buildScheduledDcaSchedule({
    totalUsd,
    frequencyId,
    durationDays,
    startsAt: startsAtSeconds,
  });
  const quality = assessMarketData(market, candles, {
    expectedIntervalSeconds,
    dataAsOf: isoFromSeconds(startsAtSeconds),
  });
  const volatility = calculateScheduledVolatility(candles, expectedIntervalSeconds);
  const valuationScales = createValuationScales(market, quality.currentPrice);
  const normalizedTargetPct = Number(targetPct);
  const inputBlockers = [...schedule.errors];

  if (!Number.isFinite(normalizedTargetPct)
    || normalizedTargetPct < MIN_TARGET_PCT
    || normalizedTargetPct > MAX_TARGET_PCT) {
    inputBlockers.push(`Target must be from +${MIN_TARGET_PCT}% to +${MAX_TARGET_PCT.toLocaleString("en-US")}%.`);
  }
  if (!volatility.ok) inputBlockers.push(volatility.reason);

  const qualityBlockers = quality.blockers.map(plainQualityBlocker);
  const blockingReasons = [...new Set([...inputBlockers, ...qualityBlockers])];
  const inputs = {
    totalUsd: Number(totalUsd),
    frequencyId,
    durationDays: Number(durationDays),
    targetPct: normalizedTargetPct,
  };
  const baseWarnings = [...quality.warnings];

  if (blockingReasons.length) {
    return invalidInputResult({
      schedule,
      quality,
      volatility,
      blockers: blockingReasons,
      warnings: baseWarnings,
      valuationScales,
      inputs,
    });
  }

  const currentPrice = quality.currentPrice;
  const durationSeconds = schedule.durationDays * DAY_SECONDS;
  const stepSeconds = Math.min(schedule.frequency.seconds, DAY_SECONDS);
  const normalizedSeed = normalizeSeed(seed, [
    currentPrice,
    schedule.frequency.id,
    schedule.durationDays,
    normalizedTargetPct,
    candles.length,
    candles[0]?.time,
    candles.at(-1)?.time,
    candles.at(-1)?.close,
  ].join("|"));
  const horizonSigma = (volatility.dailyPct / 100) * Math.sqrt(schedule.durationDays);
  const boundedHorizonSigma = Math.min(horizonSigma, MAX_SAFE_LOG_MOVE);
  const horizonDownsidePct = Math.expm1(-boundedHorizonSigma) * 100;
  const horizonUpsidePct = Math.expm1(boundedHorizonSigma) * 100;
  const scenarioRange = {
    lower: projectFiniteValuation(currentPrice * Math.exp(-boundedHorizonSigma), valuationScales),
    current: projectFiniteValuation(currentPrice, valuationScales),
    upper: projectFiniteValuation(currentPrice * Math.exp(boundedHorizonSigma), valuationScales),
  };
  const fullVolatility = {
    ...volatility,
    planRangePct: horizonUpsidePct,
    horizonSigmaPct: horizonSigma * 100,
    horizonDownsidePct,
    horizonUpsidePct,
    range: scenarioRange,
    rangeCapped: horizonSigma > MAX_SAFE_LOG_MOVE,
    caveat: "This is a volatility-scaled reference range, not a confidence interval or price forecast.",
  };
  const scenarioResult = buildScenarioCandles({
    candles,
    startPrice: currentPrice,
    startsAtSeconds,
    endsAtSeconds: startsAtSeconds + durationSeconds,
    stepSeconds,
    dailySigma: volatility.dailyPct / 100,
    sourceIntervalSeconds: volatility.sourceIntervalSeconds,
    normalizedReturns: volatility.returns,
    seed: normalizedSeed,
    valuationScales,
  });
  const plannedByTime = new Map(schedule.scheduledBuys.map(buy => [buy.time, buy]));
  const executedBuys = [];
  const reviewLogMove = clamp(
    Math.max(MIN_REVIEW_LOG_MOVE, horizonSigma),
    MIN_REVIEW_LOG_MOVE,
    MAX_REVIEW_LOG_MOVE,
  );
  const reviewBufferPct = (1 - Math.exp(-reviewLogMove)) * 100;
  let cumulativeInvestedCents = 0;
  let cumulativeTokenAmount = 0;
  let averageEntryUsd = null;
  let targetPriceUsd = null;
  let reviewPriceUsd = null;
  let terminalEvent = null;

  for (const candle of scenarioResult.candles) {
    const plannedBuy = plannedByTime.get(candle.time);
    if (!terminalEvent && plannedBuy) {
      const amountCents = toCents(plannedBuy.amountUsd);
      const amountUsd = amountCents / 100;
      const tokenAmount = amountUsd / candle.open;
      cumulativeInvestedCents += amountCents;
      cumulativeTokenAmount += tokenAmount;
      averageEntryUsd = (cumulativeInvestedCents / 100) / cumulativeTokenAmount;
      targetPriceUsd = averageEntryUsd * (1 + (normalizedTargetPct / 100));
      reviewPriceUsd = averageEntryUsd * Math.exp(-reviewLogMove);
      executedBuys.push({
        ...plannedBuy,
        priceUsd: candle.open,
        tokenAmount,
        cumulativeInvestedUsd: cumulativeInvestedCents / 100,
        cumulativeTokenAmount,
        averageEntryUsd,
        targetPriceUsd,
        reviewPriceUsd,
        valuation: projectFiniteValuation(candle.open, valuationScales),
      });
    }

    if (!terminalEvent && cumulativeTokenAmount > 0) {
      const reachedTarget = candle.close >= targetPriceUsd;
      const reachedReview = candle.close <= reviewPriceUsd;
      if (reachedTarget || reachedReview) {
        terminalEvent = {
          kind: reachedTarget ? "target-close" : "review-close",
          markerId: reachedTarget ? "S" : "X",
          time: candle.closeTime,
          closeTime: candle.closeTime,
          triggerCandleTime: candle.time,
          priceUsd: candle.close,
          valuation: projectFiniteValuation(candle.close, valuationScales),
          executedPurchaseCount: executedBuys.length,
          action: "stop-future-buys-and-review",
          automaticSale: false,
        };
      }
    }
  }

  const totalInvestedUsd = cumulativeInvestedCents / 100;
  const budgetCents = toCents(totalUsd);
  const unusedBudgetUsd = (budgetCents - cumulativeInvestedCents) / 100;
  const targetValueUsd = targetPriceUsd === null ? null : cumulativeTokenAmount * targetPriceUsd;
  const targetProfitUsd = targetValueUsd === null ? null : targetValueUsd - totalInvestedUsd;
  const target = targetPriceUsd === null ? null : {
    id: "S",
    priceUsd: targetPriceUsd,
    targetPct: normalizedTargetPct,
    basisAverageEntryUsd: averageEntryUsd,
    valueUsd: targetValueUsd,
    profitUsd: targetProfitUsd,
    valuation: projectFiniteValuation(targetPriceUsd, valuationScales),
    condition: "scenario-candle-close-at-or-above",
    activeAfterPurchase: true,
    automaticOrder: false,
  };
  const review = reviewPriceUsd === null ? null : {
    id: "X",
    priceUsd: reviewPriceUsd,
    bufferPct: reviewBufferPct,
    basisAverageEntryUsd: averageEntryUsd,
    valuation: projectFiniteValuation(reviewPriceUsd, valuationScales),
    condition: "scenario-candle-close-at-or-below",
    method: "One chosen-duration realized-volatility move below running average, with a 3% minimum and 90% maximum buffer",
    action: "pause-future-buys-and-reassess",
    automaticOrder: false,
  };
  const warnings = [...baseWarnings];
  if (schedule.amountPerBuyUsd < 5) {
    warnings.push("The average buy is below $5. Gas, fees, token taxes, minimum order sizes, and price impact could make this schedule impractical.");
  }
  if (scenarioResult.capped || fullVolatility.rangeCapped) {
    warnings.push("Extreme modeled moves were bounded to keep the illustration finite; real token prices can still move outside the displayed range.");
  }
  if (fullVolatility.category === "Stable-like") {
    warnings.push("Stable-looking historical movement does not prove a peg will hold or remove depeg, liquidity, contract, or counterparty risk.");
  }

  return {
    schemaVersion: 1,
    mode: "scheduled-dca-simulation",
    canSimulate: true,
    quality,
    blockingReasons: [],
    warnings: [...new Set(warnings)],
    assumptions: [
      "Every B marker is a simulated scheduled purchase, not an order or transaction.",
      "The path is a seeded replay of centered historical return shapes, scaled to recent realized volatility and anchored to the current pool quote.",
      "The bootstrap samples returns independently, so it does not preserve historical trends, autocorrelation, or volatility clustering.",
      "The path is one illustration, not a prediction, expected price, probability, or trading signal.",
      "S and X react to simulated candle closes and stop future simulated buys; neither executes or models a token sale.",
      "Fees, gas, token taxes, slippage, price impact, failed transactions, and changing liquidity are excluded.",
      "Market-cap and FDV projections keep the provider's current price-to-valuation ratios constant; future supply changes are not modeled.",
    ],
    valuationScales,
    inputs,
    frequency: schedule.frequency,
    schedule,
    volatility: fullVolatility,
    scenario: {
      method: "Seeded centered historical-return bootstrap scaled to measured volatility",
      seed: normalizedSeed,
      forecast: false,
      illustrative: true,
      stepSeconds,
      candles: scenarioResult.candles,
    },
    executedBuys,
    simulatedBuys: executedBuys,
    target,
    review,
    terminalEvent,
    totalInvestedUsd,
    unusedBudgetUsd,
    totalTokenAmount: cumulativeTokenAmount,
    averageEntryUsd,
  };
}
