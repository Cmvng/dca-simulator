import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCHEDULED_DCA_FREQUENCY_ID,
  SCHEDULED_DCA_FREQUENCIES,
  buildScheduledDcaPlan,
  buildScheduledDcaSchedule,
  calculateScheduledVolatility,
} from "../src/lib/onchain/scheduledDca.js";

const START = 1_750_000_000;

function makeCandles(count = 120, intervalSeconds = 14_400) {
  return Array.from({ length: count }, (_, index) => {
    const close = 1 + (index * 0.0015) + (Math.sin(index / 4) * 0.055);
    const open = index === 0
      ? close * 0.995
      : 1 + ((index - 1) * 0.0015) + (Math.sin((index - 1) / 4) * 0.055);
    return {
      time: START + (index * intervalSeconds),
      open,
      high: Math.max(open, close) * 1.018,
      low: Math.min(open, close) * 0.982,
      close,
      volume: 25_000 + ((index % 5) * 1_000),
    };
  });
}

function makeVolatileDailyCandles(count = 100) {
  const factors = [1.5, 0.65, 1.35, 0.7, 1.25, 0.8];
  const candles = [];
  let close = 100;
  for (let index = 0; index < count; index += 1) {
    if (index) close *= factors[(index - 1) % factors.length];
    const open = index ? candles[index - 1].close : close;
    candles.push({
      time: START + (index * 86_400),
      open,
      high: Math.max(open, close) * 1.05,
      low: Math.min(open, close) * 0.95,
      close,
      volume: 50_000,
    });
  }
  return candles;
}

function planArgs(overrides = {}) {
  const candles = overrides.candles || makeCandles();
  return {
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 750_000,
      volume24h: 350_000,
      marketCapUsd: candles.at(-1).close * 1_000_000,
      fdvUsd: candles.at(-1).close * 2_500_000,
      ...overrides.market,
    },
    totalUsd: overrides.totalUsd ?? 500,
    frequencyId: overrides.frequencyId || "daily",
    durationDays: overrides.durationDays ?? 30,
    targetPct: overrides.targetPct ?? 50,
    expectedIntervalSeconds: overrides.expectedIntervalSeconds ?? 14_400,
    dataAsOf: overrides.dataAsOf || new Date(candles.at(-1).time * 1_000).toISOString(),
    seed: overrides.seed ?? 42,
  };
}

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance),
    `${actual} should be close to ${expected}`,
  );
}

test("exposes the five requested buy frequencies and a daily default", () => {
  assert.equal(DEFAULT_SCHEDULED_DCA_FREQUENCY_ID, "daily");
  assert.deepEqual(
    SCHEDULED_DCA_FREQUENCIES.map(item => [item.id, item.seconds]),
    [
      ["1h", 3_600],
      ["6h", 21_600],
      ["12h", 43_200],
      ["daily", 86_400],
      ["weekly", 604_800],
    ],
  );
});

test("purchase count follows the exact end-exclusive schedule without a hidden 180 cap", () => {
  const expectedSevenDayCounts = {
    "1h": 168,
    "6h": 28,
    "12h": 14,
    daily: 7,
    weekly: 1,
  };
  for (const [frequencyId, count] of Object.entries(expectedSevenDayCounts)) {
    const schedule = buildScheduledDcaSchedule({
      totalUsd: 1_000,
      frequencyId,
      durationDays: 7,
      startsAt: START,
    });
    assert.equal(schedule.ok, true);
    assert.equal(schedule.purchaseCount, count);
    assert.equal(schedule.scheduledBuys[0].time, START);
    assert.ok(schedule.scheduledBuys.at(-1).time < START + (7 * 86_400));
  }

  const hourlyNinetyDays = buildScheduledDcaSchedule({
    totalUsd: 100,
    frequencyId: "1h",
    durationDays: 90,
    startsAt: START,
  });
  assert.equal(hourlyNinetyDays.ok, true);
  assert.equal(hourlyNinetyDays.purchaseCount, 2_160);
  assert.equal(hourlyNinetyDays.scheduledBuys.length, 2_160);

  const weeklyThirtyDays = buildScheduledDcaSchedule({
    totalUsd: 500,
    frequencyId: "weekly",
    durationDays: 30,
    startsAt: START,
  });
  assert.equal(weeklyThirtyDays.purchaseCount, 5);
  assert.deepEqual(
    weeklyThirtyDays.scheduledBuys.map(buy => buy.time - START),
    [0, 7, 14, 21, 28].map(days => days * 86_400),
  );
});

test("the full 90-day hourly simulation also keeps all 2,160 intended buys", () => {
  const candles = Array.from({ length: 500 }, (_, index) => ({
    time: START + (index * 3_600),
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 25_000,
  }));
  const plan = buildScheduledDcaPlan(planArgs({
    candles,
    market: { priceUsd: 1, liquidityUsd: 750_000, volume24h: 350_000 },
    totalUsd: 100,
    frequencyId: "1h",
    durationDays: 90,
    targetPct: 50,
    expectedIntervalSeconds: 3_600,
    seed: 1,
  }));

  assert.equal(plan.canSimulate, true);
  assert.equal(plan.schedule.purchaseCount, 2_160);
  assert.equal(plan.scenario.candles.length, 2_160);
  assert.equal(plan.executedBuys.length, 2_160);
  assert.equal(plan.totalInvestedUsd, 100);
  assert.equal(plan.unusedBudgetUsd, 0);
});

test("whole-cent allocation conserves the exact budget and exposes the real amount range", () => {
  const schedule = buildScheduledDcaSchedule({
    totalUsd: 100.01,
    frequencyId: "daily",
    durationDays: 7,
    startsAt: START,
  });
  const cents = schedule.scheduledBuys.map(buy => Math.round(buy.amountUsd * 100));

  assert.equal(cents.reduce((sum, value) => sum + value, 0), 10_001);
  assert.ok(Math.max(...cents) - Math.min(...cents) <= 1);
  assert.equal(schedule.amountRangeUsd.min, 14.28);
  assert.equal(schedule.amountRangeUsd.max, 14.29);
  closeTo(schedule.amountPerBuyUsd, 100.01 / 7);
});

test("schedule validation rejects bad duration/frequency and zero-cent purchases instead of clamping", () => {
  for (const durationDays of [6, 7.5, 91]) {
    const result = buildScheduledDcaSchedule({
      totalUsd: 500,
      frequencyId: "daily",
      durationDays,
      startsAt: START,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /7 to 90 days/i);
  }
  assert.equal(buildScheduledDcaSchedule({
    totalUsd: 500,
    frequencyId: "every-minute",
    durationDays: 30,
    startsAt: START,
  }).ok, false);

  const tooManyBuysForCents = buildScheduledDcaSchedule({
    totalUsd: 10,
    frequencyId: "1h",
    durationDays: 90,
    startsAt: START,
  });
  assert.equal(tooManyBuysForCents.ok, false);
  assert.equal(tooManyBuysForCents.purchaseCount, 2_160);
  assert.match(tooManyBuysForCents.errors.join(" "), /whole cents/i);
});

test("realized volatility is measurable, interval-normalized, categorized, and never a forecast", () => {
  const closes = [100, 110, 99, 108.9, 98.01];
  const candles = closes.map((close, index) => ({
    time: START + (index * 86_400),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
  const logReturns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const mean = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
  const expectedSigma = Math.sqrt(
    logReturns.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
      / (logReturns.length - 1),
  );
  const result = calculateScheduledVolatility(candles, 86_400);

  assert.equal(result.ok, true);
  assert.equal(result.forecast, false);
  closeTo(result.dailyPct, expectedSigma * 100);
  closeTo(result.annualizedPct, expectedSigma * Math.sqrt(365) * 100);
  closeTo(result.typicalDailySwingPct, Math.expm1(expectedSigma) * 100);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(["Stable-like", "Moderate", "High", "Very high", "Extreme"].includes(result.category));
});

test("irregularly spaced returns are normalized to the evidence interval before volatility", () => {
  const normalizedDailyReturns = [0.10, -0.06, 0.14, -0.11, 0.04];
  const gapDays = [1, 4, 0.25, 9, 2];
  const candles = [{
    time: START,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  }];
  let time = START;
  let previousClose = 100;
  normalizedDailyReturns.forEach((normalizedReturn, index) => {
    time += gapDays[index] * 86_400;
    const close = previousClose * Math.exp(normalizedReturn * Math.sqrt(gapDays[index]));
    candles.push({
      time,
      open: previousClose,
      high: Math.max(previousClose, close),
      low: Math.min(previousClose, close),
      close,
      volume: 1,
    });
    previousClose = close;
  });

  const result = calculateScheduledVolatility(candles, 86_400);
  const mean = normalizedDailyReturns.reduce((sum, value) => sum + value, 0)
    / normalizedDailyReturns.length;
  const expectedDailySigma = Math.sqrt(
    normalizedDailyReturns.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
      / (normalizedDailyReturns.length - 1),
  );

  assert.equal(result.ok, true);
  assert.equal(result.sourceIntervalSeconds, 86_400);
  assert.equal(result.irregularIntervalCount, 4);
  result.returns.forEach((value, index) => closeTo(value, normalizedDailyReturns[index]));
  closeTo(result.dailyPct, expectedDailySigma * 100);
  assert.match(result.intervalNormalization, /Each log return/i);
});

test("one seeded scenario is reproducible, positive, and explicitly illustrative", () => {
  const first = buildScheduledDcaPlan(planArgs({ seed: "same-seed" }));
  const second = buildScheduledDcaPlan(planArgs({ seed: "same-seed" }));
  const different = buildScheduledDcaPlan(planArgs({ seed: "different-seed" }));

  assert.equal(first.canSimulate, true);
  assert.equal(first.scenario.forecast, false);
  assert.equal(first.scenario.illustrative, true);
  assert.deepEqual(first.scenario.candles, second.scenario.candles);
  assert.notDeepEqual(
    first.scenario.candles.map(candle => candle.close),
    different.scenario.candles.map(candle => candle.close),
  );
  assert.equal(first.scenario.candles[0].open, first.quality.currentPrice);
  for (const candle of first.scenario.candles) {
    assert.equal(candle.simulated, true);
    assert.ok(candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0);
    assert.ok(candle.high >= Math.max(candle.open, candle.close));
    assert.ok(candle.low <= Math.min(candle.open, candle.close));
  }
  assert.ok(first.assumptions.some(item => /not a prediction/i.test(item)));
  assert.ok(first.assumptions.some(item => /does not preserve historical trends, autocorrelation, or volatility clustering/i.test(item)));
  assert.strictEqual(first.simulatedBuys, first.executedBuys);
  assert.ok(first.volatility.horizonDownsidePct <= 0);
  assert.ok(first.volatility.horizonUpsidePct >= 0);
  closeTo(
    first.volatility.range.lower.priceUsd / first.volatility.range.current.priceUsd - 1,
    first.volatility.horizonDownsidePct / 100,
  );
  closeTo(
    first.volatility.range.upper.priceUsd / first.volatility.range.current.priceUsd - 1,
    first.volatility.horizonUpsidePct / 100,
  );
});

test("extreme alternating prices stay finite over the exact 90-day hourly seed-6 regression", () => {
  const candles = Array.from({ length: 500 }, (_, index) => {
    const close = index % 2 === 0 ? 1e-12 : 1e3;
    const open = index === 0 ? close : (index % 2 === 0 ? 1e3 : 1e-12);
    return {
      time: START + (index * 3_600),
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: 25_000,
    };
  });
  const plan = buildScheduledDcaPlan(planArgs({
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 750_000,
      volume24h: 350_000,
    },
    totalUsd: 100,
    frequencyId: "1h",
    durationDays: 90,
    targetPct: 50,
    expectedIntervalSeconds: 3_600,
    seed: 6,
  }));

  assert.equal(plan.canSimulate, true);
  assert.equal(plan.schedule.purchaseCount, 2_160);
  assert.equal(plan.scenario.candles.length, 2_160);
  for (const candle of plan.scenario.candles) {
    for (const value of [candle.open, candle.high, candle.low, candle.close]) {
      assert.ok(Number.isFinite(value) && value > 0);
    }
    assert.ok(candle.high >= Math.max(candle.open, candle.close));
    assert.ok(candle.low <= Math.min(candle.open, candle.close));
  }
  for (const buy of plan.simulatedBuys) {
    for (const value of [
      buy.priceUsd,
      buy.tokenAmount,
      buy.cumulativeInvestedUsd,
      buy.cumulativeTokenAmount,
      buy.averageEntryUsd,
      buy.targetPriceUsd,
      buy.reviewPriceUsd,
    ]) {
      assert.ok(Number.isFinite(value));
    }
  }
  assert.ok(Number.isFinite(plan.volatility.dailyPct));
  assert.ok(Number.isFinite(plan.volatility.horizonDownsidePct));
  assert.ok(Number.isFinite(plan.volatility.horizonUpsidePct));
  assert.ok(plan.warnings.some(item => /bounded to keep the illustration finite/i.test(item)));
});

test("every executed purchase preserves cents and the running weighted average", () => {
  const plan = buildScheduledDcaPlan(planArgs({
    totalUsd: 500.03,
    frequencyId: "daily",
    durationDays: 30,
    targetPct: 75,
    seed: 42,
  }));

  assert.equal(plan.canSimulate, true);
  let cumulativeCents = 0;
  let cumulativeTokens = 0;
  for (const buy of plan.executedBuys) {
    cumulativeCents += Math.round(buy.amountUsd * 100);
    cumulativeTokens += buy.tokenAmount;
    assert.equal(Math.round(buy.cumulativeInvestedUsd * 100), cumulativeCents);
    closeTo(buy.cumulativeTokenAmount, cumulativeTokens);
    closeTo(buy.averageEntryUsd, (cumulativeCents / 100) / cumulativeTokens);
    closeTo(buy.targetPriceUsd, buy.averageEntryUsd * 1.75);
  }
  assert.equal(
    Math.round((plan.totalInvestedUsd + plan.unusedBudgetUsd) * 100),
    50_003,
  );
  closeTo(plan.averageEntryUsd, plan.totalInvestedUsd / plan.totalTokenAmount);
  closeTo(plan.target.priceUsd, plan.averageEntryUsd * 1.75);
  closeTo(plan.target.valueUsd, plan.totalTokenAmount * plan.target.priceUsd);
  closeTo(plan.target.profitUsd, plan.target.valueUsd - plan.totalInvestedUsd);
});

test("the first target close stops later buys and leaves the unspent cents unused", () => {
  const candles = makeVolatileDailyCandles();
  const plan = buildScheduledDcaPlan(planArgs({
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 750_000,
      volume24h: 350_000,
    },
    totalUsd: 700,
    frequencyId: "daily",
    durationDays: 7,
    targetPct: 1,
    expectedIntervalSeconds: 86_400,
    seed: 0,
  }));

  assert.equal(plan.terminalEvent.kind, "target-close");
  assert.equal(plan.terminalEvent.markerId, "S");
  assert.equal(plan.terminalEvent.time, plan.terminalEvent.closeTime);
  assert.ok(plan.terminalEvent.triggerCandleTime < plan.terminalEvent.closeTime);
  assert.equal(plan.terminalEvent.automaticSale, false);
  assert.equal(plan.executedBuys.length, 1);
  assert.equal(plan.schedule.purchaseCount, 7);
  assert.equal(plan.totalInvestedUsd, 100);
  assert.equal(plan.unusedBudgetUsd, 600);
  assert.equal(plan.terminalEvent.executedPurchaseCount, plan.executedBuys.length);
});

test("the first volatility review close also stops later buys without modeling a sale", () => {
  const candles = makeVolatileDailyCandles();
  const plan = buildScheduledDcaPlan(planArgs({
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 750_000,
      volume24h: 350_000,
    },
    totalUsd: 700,
    frequencyId: "daily",
    durationDays: 7,
    targetPct: 1,
    expectedIntervalSeconds: 86_400,
    seed: 3,
  }));

  assert.equal(plan.terminalEvent.kind, "review-close");
  assert.equal(plan.terminalEvent.markerId, "X");
  assert.equal(plan.terminalEvent.time, plan.terminalEvent.closeTime);
  assert.ok(plan.terminalEvent.triggerCandleTime < plan.terminalEvent.closeTime);
  assert.equal(plan.terminalEvent.automaticSale, false);
  assert.equal(plan.executedBuys.length, 5);
  assert.equal(plan.totalInvestedUsd, 500);
  assert.equal(plan.unusedBudgetUsd, 200);
  assert.equal(plan.review.automaticOrder, false);
  assert.ok(plan.review.priceUsd < plan.review.basisAverageEntryUsd);
});

test("Price, market-cap, and FDV projections use the existing constant-ratio helpers", () => {
  const plan = buildScheduledDcaPlan(planArgs({ seed: 7 }));
  const currentPrice = plan.quality.currentPrice;
  const marketCapMultiplier = plan.inputs.totalUsd === 500 ? 1_000_000 : NaN;
  const fdvMultiplier = 2_500_000;

  closeTo(plan.valuationScales.marketCap.multiplier, marketCapMultiplier);
  closeTo(plan.valuationScales.fdv.multiplier, fdvMultiplier);
  closeTo(plan.target.valuation.marketCapUsd, plan.target.priceUsd * marketCapMultiplier);
  closeTo(plan.review.valuation.fdvUsd, plan.review.priceUsd * fdvMultiplier);
  closeTo(
    plan.volatility.range.current.marketCapUsd,
    currentPrice * marketCapMultiplier,
  );
  closeTo(
    plan.scenario.candles[0].valuation.open.fdvUsd,
    plan.scenario.candles[0].open * fdvMultiplier,
  );
});

test("missing valuation inputs remain unavailable instead of being fabricated", () => {
  const plan = buildScheduledDcaPlan(planArgs({
    market: { marketCapUsd: null, fdvUsd: 0 },
  }));

  assert.equal(plan.valuationScales.marketCap.available, false);
  assert.equal(plan.valuationScales.fdv.available, false);
  assert.equal(plan.target.valuation.marketCapUsd, null);
  assert.equal(plan.review.valuation.fdvUsd, null);
  assert.equal(plan.scenario.candles[0].valuation.close.marketCapUsd, null);
});

test("a flat sample stays flat, is only called stable-like, and keeps a disclosed review floor", () => {
  const candles = Array.from({ length: 30 }, (_, index) => ({
    time: START + (index * 86_400),
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 25_000,
  }));
  const plan = buildScheduledDcaPlan(planArgs({
    candles,
    market: { priceUsd: 1, liquidityUsd: 750_000, volume24h: 350_000 },
    expectedIntervalSeconds: 86_400,
    durationDays: 7,
    seed: 9,
  }));

  assert.equal(plan.canSimulate, true);
  assert.equal(plan.volatility.dailyPct, 0);
  assert.equal(plan.volatility.category, "Stable-like");
  assert.ok(plan.scenario.candles.every(candle => candle.close === 1));
  closeTo(plan.review.bufferPct, 3);
  assert.ok(plan.warnings.some(item => /does not prove a peg/i.test(item)));
});

test("existing market-data gates still block weak pools, with schedule-first wording", () => {
  const candles = makeCandles(19, 86_400);
  const plan = buildScheduledDcaPlan(planArgs({
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 5_000,
      volume24h: 100,
    },
    expectedIntervalSeconds: 86_400,
  }));

  assert.equal(plan.canSimulate, false);
  assert.equal(plan.scenario, null);
  assert.equal(plan.executedBuys.length, 0);
  assert.strictEqual(plan.simulatedBuys, plan.executedBuys);
  assert.ok(plan.blockingReasons.some(reason => /20 valid candles/i.test(reason)));
  assert.ok(plan.blockingReasons.some(reason => /liquidity/i.test(reason)));
  assert.ok(plan.quality.blockers.length >= 2);
});

test("target and duration inputs are rejected plainly instead of silently changed", () => {
  for (const targetPct of [0, 1_001, NaN]) {
    const plan = buildScheduledDcaPlan(planArgs({ targetPct }));
    assert.equal(plan.canSimulate, false);
    assert.ok(plan.blockingReasons.some(reason => /Target must be/i.test(reason)));
  }
  const duration = buildScheduledDcaPlan(planArgs({ durationDays: 91 }));
  assert.equal(duration.canSimulate, false);
  assert.ok(duration.blockingReasons.some(reason => /7 to 90 days/i.test(reason)));
});
