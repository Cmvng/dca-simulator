const DEFAULT_ALLOCATIONS = [15, 20, 25, 40];
const MIN_REFERENCE_CANDLES = 20;
const MIN_STRUCTURAL_CANDLES = 30;

export const DCA_PROFILES = Object.freeze([
  Object.freeze({
    id: "cautious",
    name: "Deep pullback",
    description: "Waits for larger pullbacks and reserves most of the budget for the deepest zones.",
    recommendedDurationDays: 60,
    allocations: Object.freeze([10, 15, 25, 50]),
    minDrops: Object.freeze([0.08, 0.17, 0.29, 0.44]),
    atrMultipliers: Object.freeze([0.9, 1.8, 2.9, 4.2]),
    maxDrop: 0.72,
    supportBlend: 0.65,
    targetFactor: 0.35,
    minTargetPct: 15,
    maxTargetPct: 60,
    minRiskBuffer: 0.06,
    maxRiskBuffer: 0.18,
    atrRiskFactor: 1,
    dailyRiskFactor: 0.35,
  }),
  Object.freeze({
    id: "balanced",
    name: "Balanced",
    description: "Spreads the budget across near, middle, and deep pullback zones.",
    recommendedDurationDays: 30,
    allocations: Object.freeze([...DEFAULT_ALLOCATIONS]),
    minDrops: Object.freeze([0.04, 0.10, 0.19, 0.31]),
    atrMultipliers: Object.freeze([0.55, 1.25, 2.15, 3.25]),
    maxDrop: 0.62,
    supportBlend: 1,
    targetFactor: 0.5,
    minTargetPct: 25,
    maxTargetPct: 100,
    minRiskBuffer: 0.08,
    maxRiskBuffer: 0.28,
    atrRiskFactor: 1.25,
    dailyRiskFactor: 0.45,
  }),
  Object.freeze({
    id: "aggressive",
    name: "Early entry",
    description: "Commits more budget to shallower pullbacks and keeps less for deep zones.",
    recommendedDurationDays: 14,
    allocations: Object.freeze([35, 30, 20, 15]),
    minDrops: Object.freeze([0.025, 0.065, 0.13, 0.22]),
    atrMultipliers: Object.freeze([0.35, 0.8, 1.45, 2.3]),
    maxDrop: 0.48,
    supportBlend: 0.4,
    targetFactor: 0.7,
    minTargetPct: 40,
    maxTargetPct: 200,
    minRiskBuffer: 0.10,
    maxRiskBuffer: 0.32,
    atrRiskFactor: 1.5,
    dailyRiskFactor: 0.55,
  }),
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const finiteNonNegative = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

function allocateBudgetByPercent(budget, percentages) {
  const totalCents = Math.round(budget * 100);
  const cents = percentages.map(percent => Math.floor((totalCents * percent) / 100));
  let remainder = totalCents - cents.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % cents.length) {
    cents[index] += 1;
    remainder -= 1;
  }
  return cents.map(amount => amount / 100);
}

export function normalizeCandles(candles = []) {
  const byTime = new Map();

  for (const candle of candles) {
    const normalized = {
      time: Number(candle?.time),
      open: Number(candle?.open),
      high: Number(candle?.high),
      low: Number(candle?.low),
      close: Number(candle?.close),
      volume: Math.max(0, Number(candle?.volume) || 0),
    };

    if (
      Number.isInteger(normalized.time) &&
      finitePositive(normalized.open) &&
      finitePositive(normalized.high) &&
      finitePositive(normalized.low) &&
      finitePositive(normalized.close) &&
      normalized.high >= Math.max(normalized.open, normalized.close, normalized.low) &&
      normalized.low <= Math.min(normalized.open, normalized.close, normalized.high)
    ) {
      byTime.set(normalized.time, normalized);
    }
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function calculateAtr(rawCandles, period = 14) {
  const candles = normalizeCandles(rawCandles);
  if (candles.length < 2) return 0;

  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  const sample = ranges.slice(-Math.max(2, Math.min(period, ranges.length)));
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

function findSupportClusters(candles, currentPrice, atr) {
  const recent = candles.slice(-Math.min(320, candles.length));
  const averageVolume = recent.reduce((sum, candle) => sum + candle.volume, 0) / Math.max(1, recent.length);
  const pivots = [];

  for (let index = 2; index < recent.length - 2; index += 1) {
    const candle = recent[index];
    const isSwingLow = [recent[index - 2], recent[index - 1], recent[index + 1], recent[index + 2]]
      .every(neighbour => candle.low <= neighbour.low);

    if (!isSwingLow || candle.low >= currentPrice * 0.99 || candle.low < currentPrice * 0.18) continue;

    const relativeVolume = averageVolume > 0 ? clamp(candle.volume / averageVolume, 0, 3) : 1;
    const recency = 0.5 + (index / recent.length);
    pivots.push({ price: candle.low, weight: 1 + relativeVolume + recency });
  }

  const tolerance = Math.max(atr * 0.7, currentPrice * 0.018);
  const clusters = [];

  for (const pivot of pivots.sort((a, b) => b.weight - a.weight)) {
    const cluster = clusters.find(item => Math.abs(item.price - pivot.price) <= tolerance);
    if (cluster) {
      const combinedWeight = cluster.weight + pivot.weight;
      cluster.price = ((cluster.price * cluster.weight) + (pivot.price * pivot.weight)) / combinedWeight;
      cluster.weight = combinedWeight;
      cluster.touches += 1;
    } else {
      clusters.push({ ...pivot, touches: 1 });
    }
  }

  return clusters
    .filter(cluster => cluster.price < currentPrice * 0.99)
    .sort((a, b) => b.price - a.price);
}

export function assessMarketData(market = {}, rawCandles = [], options = {}) {
  const candles = normalizeCandles(rawCandles);
  const lastClose = candles.at(-1)?.close || 0;
  const currentPrice = finitePositive(market.priceUsd) ? Number(market.priceUsd) : lastClose;
  const liquidity = finiteNonNegative(market.liquidityUsd);
  const volume24h = finiteNonNegative(market.volume24h);
  const atr = calculateAtr(candles);
  const atrPct = currentPrice > 0 ? atr / currentPrice : 0;
  const divergence = currentPrice > 0 && lastClose > 0 ? Math.abs(currentPrice - lastClose) / currentPrice : 0;
  const historyHours = candles.length > 1
    ? Math.max(0, (candles.at(-1).time - candles[0].time) / 3_600)
    : 0;
  const historyDays = historyHours / 24;
  const expectedIntervalSeconds = finitePositive(options.expectedIntervalSeconds)
    ? Number(options.expectedIntervalSeconds)
    : null;
  const expectedBarCount = expectedIntervalSeconds && candles.length > 1
    ? Math.floor((candles.at(-1).time - candles[0].time) / expectedIntervalSeconds) + 1
    : null;
  const coverageRatio = expectedBarCount
    ? Math.min(1, candles.length / expectedBarCount)
    : null;
  const asOfMilliseconds = options.dataAsOf ? Date.parse(options.dataAsOf) : NaN;
  const latestCandleAgeHours = Number.isFinite(asOfMilliseconds) && candles.length
    ? Math.max(0, ((asOfMilliseconds / 1000) - candles.at(-1).time) / 3_600)
    : null;
  const staleThresholdHours = expectedIntervalSeconds
    ? Math.max(1, (expectedIntervalSeconds * 3) / 3_600)
    : 24;
  const createdAt = market.poolCreatedAt ? Date.parse(market.poolCreatedAt) : NaN;
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : null;
  const blockers = [];
  const warnings = [];

  if (!finitePositive(currentPrice)) blockers.push("No usable USD price was returned for the selected pool.");
  if (candles.length < MIN_REFERENCE_CANDLES) blockers.push(`At least ${MIN_REFERENCE_CANDLES} valid candles are required before plotting DCA references.`);
  if (historyHours < 24) blockers.push("The selected interval must cover at least 24 hours before plotting DCA references.");
  if (coverageRatio !== null && expectedBarCount >= MIN_REFERENCE_CANDLES && coverageRatio < 0.2) blockers.push("The selected interval is too sparse to support a DCA reference ladder.");
  if (
    latestCandleAgeHours !== null
    && latestCandleAgeHours > staleThresholdHours
  ) blockers.push("The latest candle is stale for the selected interval.");
  if (liquidity === null) blockers.push("No usable pool-liquidity value was returned.");
  else if (liquidity < 10_000) blockers.push("Pool liquidity is below the $10,000 minimum for this simulator.");
  if (divergence > 0.35) blockers.push("The live quote and latest candle differ too much to produce reliable levels.");

  if (candles.length >= MIN_REFERENCE_CANDLES && candles.length < MIN_STRUCTURAL_CANDLES) warnings.push("Fewer than 30 candles are available, so this ladder is limited to volatility references and cannot claim structural support.");
  else if (candles.length >= MIN_STRUCTURAL_CANDLES && candles.length < 80) warnings.push("Limited candle history lowers confidence in support zones.");
  if (historyHours >= 24 && historyDays < 7) warnings.push("The selected interval covers less than seven days, so levels are short-window volatility references.");
  else if (historyDays >= 7 && historyDays < 30) warnings.push("The selected interval covers less than 30 days of market history.");
  if (coverageRatio !== null && coverageRatio >= 0.2 && coverageRatio < 0.5) warnings.push("Many expected candle intervals are empty, which lowers evidence quality.");
  if (liquidity !== null && liquidity >= 10_000 && liquidity < 50_000) warnings.push("Thin liquidity can cause severe slippage and unstable prices.");
  if (volume24h === null) warnings.push("24-hour volume is unavailable, which lowers confidence in pool activity.");
  else if (volume24h < 1_000) warnings.push("Very low 24-hour volume can make candles sparse or easy to manipulate.");
  if (ageDays !== null && ageDays < 2) warnings.push("This pool is less than two days old.");
  if (atrPct > 0.25) warnings.push("Recent candle ranges show extreme volatility.");
  if (divergence > 0.12 && divergence <= 0.35) warnings.push("The latest candle is behind the current pool quote.");

  let score = 100;
  if (liquidity === null || liquidity < 25_000) score -= 35;
  else if (liquidity < 100_000) score -= 22;
  else if (liquidity < 500_000) score -= 10;
  if (volume24h === null) score -= 15;
  else if (volume24h < 1_000) score -= 20;
  else if (volume24h < 10_000) score -= 10;
  if (candles.length < 80) score -= 18;
  else if (candles.length < 160) score -= 8;
  if (historyHours < 24) score -= 30;
  else if (historyDays < 7) score -= 25;
  else if (historyDays < 30) score -= 10;
  if (coverageRatio !== null && coverageRatio < 0.2) score -= 25;
  else if (coverageRatio !== null && coverageRatio < 0.5) score -= 12;
  if (latestCandleAgeHours !== null && latestCandleAgeHours > staleThresholdHours) score -= 25;
  if (ageDays !== null && ageDays < 2) score -= 15;
  else if (ageDays !== null && ageDays < 7) score -= 7;
  if (atrPct > 0.25) score -= 18;
  else if (atrPct > 0.14) score -= 9;
  if (divergence > 0.12) score -= 12;
  score = clamp(Math.round(score), 0, 100);

  const confidence = blockers.length
    ? "Unavailable"
    : score >= 78
      ? "Higher data confidence"
      : score >= 55
        ? "Moderate data confidence"
        : "Limited data confidence";

  return {
    canPlan: blockers.length === 0,
    blockers,
    warnings,
    score,
    confidence,
    candleCount: candles.length,
    currentPrice,
    atr,
    atrPct,
    historyHours,
    historyDays,
    expectedBarCount,
    coverageRatio,
    latestCandleAgeHours,
    staleThresholdHours,
    ageDays,
    liquidity,
    volume24h,
    divergence,
  };
}

function chooseLevels(candles, currentPrice, atr) {
  const atrPct = clamp(atr / currentPrice, 0.025, 0.2);
  const desiredDrops = [
    Math.max(0.04, atrPct * 0.55),
    Math.max(0.10, atrPct * 1.25),
    Math.max(0.19, atrPct * 2.15),
    Math.max(0.31, atrPct * 3.25),
  ].map(value => clamp(value, 0.04, 0.62));
  const supports = findSupportClusters(candles, currentPrice, atr);
  const used = new Set();
  const levels = [];
  let previous = currentPrice;

  desiredDrops.forEach((drop, index) => {
    const fallback = currentPrice * (1 - drop);
    const tolerance = Math.max(currentPrice * 0.045, atr * 0.9);
    const eligible = supports
      .map((support, supportIndex) => ({ ...support, supportIndex }))
      .filter(support => !used.has(support.supportIndex) && support.price < previous * 0.965)
      .sort((a, b) => {
        const distanceA = Math.abs(a.price - fallback) / tolerance;
        const distanceB = Math.abs(b.price - fallback) / tolerance;
        return (distanceA - distanceB) || (b.weight - a.weight);
      });

    const nearest = eligible[0];
    const useSupport = nearest && Math.abs(nearest.price - fallback) <= tolerance * (index < 2 ? 1 : 1.5);
    let price = useSupport ? nearest.price : fallback;
    if (price >= previous * 0.965) price = previous * (1 - Math.max(0.045, atrPct * 0.55));
    price = Math.max(currentPrice * 0.15, price);

    if (useSupport) used.add(nearest.supportIndex);
    const repeatedSupport = useSupport && nearest.touches >= 2;
    levels.push({
      price,
      source: repeatedSupport
        ? "Repeated swing-low support"
        : useSupport
          ? "Single swing-low reference"
          : "ATR volatility spacing",
      touches: useSupport ? nearest.touches : 0,
      structural: repeatedSupport,
    });
    previous = price;
  });

  return {
    levels,
    structuralCount: levels.filter(level => level.structural).length,
  };
}

export function buildDcaPlan({
  rawCandles,
  candles: suppliedCandles,
  market = {},
  capital = 500,
  targetPct = 50,
  expectedIntervalSeconds,
  dataAsOf,
}) {
  const candles = normalizeCandles(suppliedCandles || rawCandles || []);
  const budget = Math.round(clamp(Number(capital) || 500, 1, 10_000_000) * 100) / 100;
  const gainTarget = clamp(Number(targetPct) || 50, 5, 500);
  const quality = assessMarketData(market, candles, { expectedIntervalSeconds, dataAsOf });

  if (!quality.canPlan) {
    return {
      quality,
      mode: "blocked",
      structuralSupportCount: 0,
      legs: [],
      budget,
      targetPct: gainTarget,
      targetAlreadyMet: false,
      generatedAt: new Date().toISOString(),
    };
  }

  const { levels, structuralCount } = chooseLevels(candles, quality.currentPrice, quality.atr);
  const hasStructuralHistory = quality.candleCount >= MIN_STRUCTURAL_CANDLES && quality.historyDays >= 7;
  const mode = structuralCount >= 2 && hasStructuralHistory ? "adaptive" : "volatility-reference";
  const referenceWarning = structuralCount < 2
    ? "Fewer than two repeated support zones were found. Treat this as a volatility-reference ladder, not a structural setup."
    : quality.candleCount < MIN_STRUCTURAL_CANDLES
      ? "Fewer than 30 candles are available. Treat repeated levels as sample-limited volatility references, not structural support."
      : "The selected interval covers less than seven days. Treat its repeated levels as short-window volatility references, not structural support.";
  const planQuality = mode === "adaptive"
    ? quality
    : {
        ...quality,
        warnings: quality.candleCount < MIN_STRUCTURAL_CANDLES
          ? quality.warnings
          : [...new Set([...quality.warnings, referenceWarning])],
      };
  const allocatedAmounts = allocateBudgetByPercent(budget, DEFAULT_ALLOCATIONS);
  const legs = levels.map((level, index) => {
    const allocationPct = DEFAULT_ALLOCATIONS[index];
    const amountUsd = allocatedAmounts[index];
    const midpoint = level.price;
    const adjacentGaps = [
      index > 0 ? levels[index - 1].price - midpoint : null,
      index < levels.length - 1 ? midpoint - levels[index + 1].price : null,
    ].filter(gap => Number.isFinite(gap) && gap > 0);
    const nominalWidth = Math.min(midpoint * 0.06, Math.max(midpoint * 0.012, quality.atr * 0.18));
    const separationWidth = adjacentGaps.length ? Math.min(...adjacentGaps) * 0.38 : nominalWidth;
    const zoneWidth = Math.min(nominalWidth, separationWidth);

    return {
      id: `B${index + 1}`,
      label: mode === "volatility-reference"
        ? index === 0
          ? "First volatility reference"
          : index === levels.length - 1
            ? "Deep-risk reference"
            : `Reference band ${index + 1}`
        : index === 0
          ? "First pullback"
          : index === levels.length - 1
            ? "Deep-risk entry"
            : `Support entry ${index + 1}`,
      midpoint,
      upper: Math.min(quality.currentPrice * 0.995, midpoint + zoneWidth),
      lower: Math.max(midpoint * 0.5, midpoint - zoneWidth),
      allocationPct,
      amountUsd,
      tokenAmount: amountUsd / midpoint,
      drawdownPct: ((midpoint / quality.currentPrice) - 1) * 100,
      rationale: mode === "volatility-reference" && level.structural
        ? "Sample-limited repeated-low reference"
        : level.source,
      supportTouches: level.touches,
    };
  });

  const totalTokens = legs.reduce((sum, leg) => sum + leg.tokenAmount, 0);
  const weightedAverageEntry = budget / totalTokens;
  const targetPrice = weightedAverageEntry * (1 + gainTarget / 100);
  const deepest = legs.at(-1);
  const invalidationBuffer = clamp(Math.max(0.08, quality.atrPct * 1.25), 0.08, 0.28);
  const invalidationPrice = deepest.lower * (1 - invalidationBuffer);

  return {
    quality: planQuality,
    mode,
    structuralSupportCount: structuralCount,
    budget,
    targetPct: gainTarget,
    legs,
    totalTokens,
    weightedAverageEntry,
    targetPrice,
    targetValue: totalTokens * targetPrice,
    targetProfit: (totalTokens * targetPrice) - budget,
    targetAlreadyMet: quality.currentPrice >= targetPrice,
    currentValue: totalTokens * quality.currentPrice,
    currentPnl: (totalTokens * quality.currentPrice) - budget,
    invalidationPrice,
    invalidationValue: totalTokens * invalidationPrice,
    generatedAt: new Date().toISOString(),
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundToFive(value) {
  return Math.round(value / 5) * 5;
}

function medianIntervalSeconds(candles) {
  const intervals = [];
  for (let index = 1; index < candles.length; index += 1) {
    const interval = candles[index].time - candles[index - 1].time;
    if (finitePositive(interval)) intervals.push(interval);
  }
  if (!intervals.length) return null;
  intervals.sort((left, right) => left - right);
  const middle = Math.floor(intervals.length / 2);
  return intervals.length % 2
    ? intervals[middle]
    : (intervals[middle - 1] + intervals[middle]) / 2;
}

export function createValuationScales(market = {}, currentPrice) {
  const price = finitePositive(currentPrice) ? Number(currentPrice) : null;
  const marketCap = finitePositive(market.marketCapUsd) ? Number(market.marketCapUsd) : null;
  const fdv = finitePositive(market.fdvUsd) ? Number(market.fdvUsd) : null;

  return {
    price: { id: "price", label: "Price", available: price !== null, multiplier: price !== null ? 1 : null },
    marketCap: {
      id: "marketCap",
      label: "Market cap",
      available: price !== null && marketCap !== null,
      multiplier: price !== null && marketCap !== null ? marketCap / price : null,
    },
    fdv: {
      id: "fdv",
      label: "FDV",
      available: price !== null && fdv !== null,
      multiplier: price !== null && fdv !== null ? fdv / price : null,
    },
    method: "current-valuation-to-price ratio",
    assumesConstantSupply: true,
  };
}

export function projectValuationAtPrice(price, valuationScales) {
  const normalizedPrice = finitePositive(price) ? Number(price) : null;
  const project = scale => normalizedPrice !== null && scale?.available && finitePositive(scale.multiplier)
    ? normalizedPrice * scale.multiplier
    : null;

  return {
    priceUsd: normalizedPrice,
    marketCapUsd: project(valuationScales?.marketCap),
    fdvUsd: project(valuationScales?.fdv),
  };
}

function buildVolatilityOutlook({
  quality,
  candles,
  durationDays,
  expectedIntervalSeconds,
  valuationScales,
}) {
  const inferredInterval = medianIntervalSeconds(candles);
  const barSeconds = finitePositive(expectedIntervalSeconds)
    ? Number(expectedIntervalSeconds)
    : inferredInterval || 86_400;
  const dailyRangeFraction = clamp(
    quality.atrPct * Math.sqrt(86_400 / barSeconds),
    0,
    1.5,
  );
  const horizonMoveFraction = clamp(dailyRangeFraction * Math.sqrt(durationDays), 0, 3);
  const downsideFraction = Math.min(horizonMoveFraction, 0.9);
  const upsideFraction = Math.min(horizonMoveFraction, 3);
  const lowerPrice = quality.currentPrice > 0 ? quality.currentPrice * (1 - downsideFraction) : null;
  const upperPrice = quality.currentPrice > 0 ? quality.currentPrice * (1 + upsideFraction) : null;

  return {
    method: "ATR square-root-of-time scenario envelope",
    forecast: false,
    durationDays,
    barSeconds,
    atrPct: quality.atrPct * 100,
    dailyRangePct: dailyRangeFraction * 100,
    horizonRangePct: horizonMoveFraction * 100,
    lower: projectValuationAtPrice(lowerPrice, valuationScales),
    current: projectValuationAtPrice(quality.currentPrice, valuationScales),
    upper: projectValuationAtPrice(upperPrice, valuationScales),
    caveat: "A volatility-scaled scenario range, not a probability interval or price forecast.",
  };
}

function chooseProfileLevels(candles, currentPrice, atr, profile) {
  const atrPct = clamp(atr / currentPrice, 0.025, 0.2);
  const desiredDrops = profile.minDrops.map((minimum, index) => clamp(
    Math.max(minimum, atrPct * profile.atrMultipliers[index]),
    minimum,
    profile.maxDrop,
  ));
  const supports = findSupportClusters(candles, currentPrice, atr);
  const used = new Set();
  const levels = [];
  let previous = currentPrice;

  desiredDrops.forEach((drop, index) => {
    const fallback = currentPrice * (1 - drop);
    const tolerance = Math.max(currentPrice * 0.045, atr * 0.9);
    const eligible = supports
      .map((support, supportIndex) => ({ ...support, supportIndex }))
      .filter(support => !used.has(support.supportIndex) && support.price < previous * 0.965)
      .sort((left, right) => {
        const leftDistance = Math.abs(left.price - fallback) / tolerance;
        const rightDistance = Math.abs(right.price - fallback) / tolerance;
        return (leftDistance - rightDistance) || (right.weight - left.weight);
      });
    const nearest = eligible[0];
    const useSupport = nearest
      && Math.abs(nearest.price - fallback) <= tolerance * (index < 2 ? 1 : 1.5);
    let price = useSupport
      ? (fallback * (1 - profile.supportBlend)) + (nearest.price * profile.supportBlend)
      : fallback;

    const minimumStep = profile.id === "balanced"
      ? Math.max(0.045, atrPct * 0.55)
      : index === 0
        ? Math.max(0.02, atrPct * 0.25)
        : Math.max(0.035, atrPct * 0.55);
    if (price >= previous * (1 - minimumStep)) {
      price = previous * (1 - minimumStep);
    }
    price = Math.max(currentPrice * 0.15, price);

    if (useSupport) used.add(nearest.supportIndex);
    const repeatedSupport = useSupport && nearest.touches >= 2;
    levels.push({
      price,
      source: repeatedSupport
        ? "Repeated swing-low support"
        : useSupport
          ? "Single swing-low reference"
          : "ATR volatility spacing",
      touches: useSupport ? nearest.touches : 0,
      structural: repeatedSupport,
    });
    previous = price;
  });

  return {
    levels,
    structuralCount: levels.filter(level => level.structural).length,
  };
}

function qualityForProfileMode(quality, mode, structuralCount) {
  if (mode === "adaptive") return quality;
  const referenceWarning = structuralCount < 2
    ? "Fewer than two repeated support zones were found. Treat this as a volatility-reference ladder, not a structural setup."
    : quality.candleCount < MIN_STRUCTURAL_CANDLES
      ? "Fewer than 30 candles are available. Treat repeated levels as sample-limited volatility references, not structural support."
      : "The selected interval covers less than seven days. Treat its repeated levels as short-window volatility references, not structural support.";
  return {
    ...quality,
    warnings: quality.candleCount < MIN_STRUCTURAL_CANDLES
      ? quality.warnings
      : [...new Set([...quality.warnings, referenceWarning])],
  };
}

function buildProfileLegs({ levels, mode, profile, budget, quality, valuationScales }) {
  const allocatedAmounts = allocateBudgetByPercent(budget, profile.allocations);
  return levels.map((level, index) => {
    const amountUsd = allocatedAmounts[index];
    const midpoint = level.price;
    const adjacentGaps = [
      index > 0 ? levels[index - 1].price - midpoint : null,
      index < levels.length - 1 ? midpoint - levels[index + 1].price : null,
    ].filter(gap => Number.isFinite(gap) && gap > 0);
    const nominalWidth = Math.min(midpoint * 0.06, Math.max(midpoint * 0.012, quality.atr * 0.18));
    const separationWidth = adjacentGaps.length ? Math.min(...adjacentGaps) * 0.38 : nominalWidth;
    const zoneWidth = Math.min(nominalWidth, separationWidth);
    const upper = Math.min(quality.currentPrice * 0.995, midpoint + zoneWidth);
    const lower = Math.max(midpoint * 0.5, midpoint - zoneWidth);

    return {
      id: `B${index + 1}`,
      label: mode === "volatility-reference"
        ? index === 0
          ? "First volatility reference"
          : index === levels.length - 1
            ? "Deep-risk reference"
            : `Reference band ${index + 1}`
        : index === 0
          ? "First pullback"
          : index === levels.length - 1
            ? "Deep-risk entry"
            : `Support entry ${index + 1}`,
      midpoint,
      upper,
      lower,
      allocationPct: profile.allocations[index],
      amountUsd,
      tokenAmount: amountUsd / midpoint,
      drawdownPct: ((midpoint / quality.currentPrice) - 1) * 100,
      rationale: mode === "volatility-reference" && level.structural
        ? "Sample-limited repeated-low reference"
        : level.source,
      supportTouches: level.touches,
      valuation: {
        lower: projectValuationAtPrice(lower, valuationScales),
        midpoint: projectValuationAtPrice(midpoint, valuationScales),
        upper: projectValuationAtPrice(upper, valuationScales),
      },
    };
  });
}

function buildFillScenarios({ legs, budget, currentPrice, targetPct, valuationScales }) {
  let investedUsd = 0;
  let tokenAmount = 0;
  return legs.map(leg => {
    investedUsd = roundMoney(investedUsd + leg.amountUsd);
    tokenAmount += leg.tokenAmount;
    const averageEntry = investedUsd / tokenAmount;
    const currentValueUsd = tokenAmount * currentPrice;
    const targetPrice = averageEntry * (1 + targetPct / 100);
    return {
      id: `through-${leg.id}`,
      filledLegIds: legs.slice(0, Number(leg.id.slice(1))).map(item => item.id),
      investedUsd,
      unusedBudgetUsd: roundMoney(budget - investedUsd),
      tokenAmount,
      averageEntry,
      currentValueUsd,
      currentPnlUsd: currentValueUsd - investedUsd,
      currentPnlPct: ((currentValueUsd / investedUsd) - 1) * 100,
      targetPrice,
      targetValuation: projectValuationAtPrice(targetPrice, valuationScales),
      targetValueUsd: tokenAmount * targetPrice,
    };
  });
}

function buildProfilePlan({
  profile,
  candles,
  quality,
  budget,
  durationDays,
  explicitTargetPct,
  volatilityOutlook,
  valuationScales,
  generatedAt,
  expectedIntervalSeconds,
}) {
  const suggestedTargetPct = clamp(
    roundToFive(clamp(
      volatilityOutlook.horizonRangePct * profile.targetFactor,
      profile.minTargetPct,
      profile.maxTargetPct,
    )),
    profile.minTargetPct,
    profile.maxTargetPct,
  );
  const targetPct = explicitTargetPct ?? suggestedTargetPct;
  const common = {
    profileId: profile.id,
    profileName: profile.name,
    profileDescription: profile.description,
    recommendedDurationDays: profile.recommendedDurationDays,
    budget,
    durationDays,
    targetPct,
    suggestedTargetPct,
    targetSource: explicitTargetPct === null ? "volatility" : "user",
    valuationScales,
    volatilityOutlook,
    generatedAt,
  };

  if (!quality.canPlan) {
    return {
      ...common,
      quality,
      mode: "blocked",
      structuralSupportCount: 0,
      legs: [],
      fillScenarios: [],
      totalTokens: 0,
      weightedAverageEntry: null,
      targetPrice: null,
      targetValue: null,
      targetProfit: null,
      targetAlreadyMet: false,
      invalidationPrice: null,
      invalidationValue: null,
      target: null,
      reassessment: null,
      rewardRiskRatio: null,
    };
  }

  const { levels, structuralCount } = chooseProfileLevels(
    candles,
    quality.currentPrice,
    quality.atr,
    profile,
  );
  const hasStructuralHistory = quality.candleCount >= MIN_STRUCTURAL_CANDLES
    && quality.historyDays >= 7;
  const mode = structuralCount >= 2 && hasStructuralHistory
    ? "adaptive"
    : "volatility-reference";
  const planQuality = qualityForProfileMode(quality, mode, structuralCount);
  const legs = buildProfileLegs({
    levels,
    mode,
    profile,
    budget,
    quality,
    valuationScales,
  });
  const totalTokens = legs.reduce((sum, leg) => sum + leg.tokenAmount, 0);
  const weightedAverageEntry = budget / totalTokens;
  const targetPrice = weightedAverageEntry * (1 + targetPct / 100);
  const targetValue = totalTokens * targetPrice;
  const targetProfit = targetValue - budget;
  const dailyRangeFraction = volatilityOutlook.dailyRangePct / 100;
  const invalidationBuffer = clamp(
    Math.max(
      profile.minRiskBuffer,
      quality.atrPct * profile.atrRiskFactor,
      dailyRangeFraction * profile.dailyRiskFactor,
    ),
    profile.minRiskBuffer,
    profile.maxRiskBuffer,
  );
  const invalidationPrice = legs.at(-1).lower * (1 - invalidationBuffer);
  const invalidationValue = totalTokens * invalidationPrice;
  const invalidationPnl = invalidationValue - budget;
  const capitalAtRiskUsd = Math.max(0, budget - invalidationValue);
  const currentValue = totalTokens * quality.currentPrice;
  const fillScenarios = buildFillScenarios({
    legs,
    budget,
    currentPrice: quality.currentPrice,
    targetPct,
    valuationScales,
  });

  return {
    ...common,
    quality: planQuality,
    mode,
    structuralSupportCount: structuralCount,
    legs,
    fillScenarios,
    totalTokens,
    weightedAverageEntry,
    targetPrice,
    targetValue,
    targetProfit,
    targetAlreadyMet: quality.currentPrice >= targetPrice,
    currentValue,
    currentPnl: currentValue - budget,
    invalidationPrice,
    invalidationValue,
    invalidationPnl,
    invalidationBufferPct: invalidationBuffer * 100,
    target: {
      id: "S1",
      price: targetPrice,
      valuation: projectValuationAtPrice(targetPrice, valuationScales),
      gainFromAveragePct: targetPct,
      valueUsd: targetValue,
      profitUsd: targetProfit,
      conditionalOn: "all-planned-buys-filled",
      forecast: false,
    },
    reassessment: {
      id: "X1",
      price: invalidationPrice,
      valuation: projectValuationAtPrice(invalidationPrice, valuationScales),
      condition: "selected-interval-close-below",
      confirmationIntervalSeconds: finitePositive(expectedIntervalSeconds)
        ? Number(expectedIntervalSeconds)
        : volatilityOutlook.barSeconds,
      action: "reassess-or-exit",
      automaticOrder: false,
      bufferBelowDeepestPct: invalidationBuffer * 100,
      drawdownFromLivePct: ((invalidationPrice / quality.currentPrice) - 1) * 100,
      valueUsd: invalidationValue,
      pnlUsd: invalidationPnl,
      pnlPct: ((invalidationValue / budget) - 1) * 100,
      capitalAtRiskUsd,
    },
    rewardRiskRatio: capitalAtRiskUsd > 0 ? targetProfit / capitalAtRiskUsd : null,
  };
}

export function buildDcaPlans({
  rawCandles,
  candles: suppliedCandles,
  market = {},
  capital = 500,
  durationDays = 30,
  targetPct = null,
  expectedIntervalSeconds,
  dataAsOf,
} = {}) {
  const candles = normalizeCandles(suppliedCandles || rawCandles || []);
  const budget = roundMoney(clamp(Number(capital) || 500, 1, 10_000_000));
  const normalizedDurationDays = Math.round(clamp(Number(durationDays) || 30, 7, 90));
  const hasExplicitTarget = targetPct !== null
    && targetPct !== undefined
    && targetPct !== ""
    && Number.isFinite(Number(targetPct));
  const explicitTargetPct = hasExplicitTarget
    ? clamp(Number(targetPct), 5, 500)
    : null;
  const quality = assessMarketData(market, candles, { expectedIntervalSeconds, dataAsOf });
  const valuationScales = createValuationScales(market, quality.currentPrice);
  const volatilityOutlook = buildVolatilityOutlook({
    quality,
    candles,
    durationDays: normalizedDurationDays,
    expectedIntervalSeconds,
    valuationScales,
  });
  const parsedAsOf = dataAsOf ? Date.parse(dataAsOf) : NaN;
  const observedAt = Number.isFinite(parsedAsOf)
    ? parsedAsOf
    : candles.length
      ? candles.at(-1).time * 1000
      : Date.now();
  const generatedAt = new Date().toISOString();
  const monitoringWindow = {
    days: normalizedDurationDays,
    startsAt: new Date(observedAt).toISOString(),
    reviewAt: new Date(observedAt + (normalizedDurationDays * 86_400_000)).toISOString(),
    triggerType: "price-zone",
    predictsBuyDates: false,
  };
  const valuationWarnings = finitePositive(market.marketCapUsd)
    && finitePositive(market.fdvUsd)
    && Number(market.marketCapUsd) > Number(market.fdvUsd) * 1.05
    ? ["Reported market cap exceeds FDV. Verify the provider values before using valuation projections."]
    : [];
  const profiles = DCA_PROFILES.map(profile => buildProfilePlan({
    profile,
    candles,
    quality,
    budget,
    durationDays: normalizedDurationDays,
    explicitTargetPct,
    volatilityOutlook,
    valuationScales,
    generatedAt,
    expectedIntervalSeconds,
  }));

  return {
    schemaVersion: 2,
    selectedProfileId: "balanced",
    quality,
    budget,
    durationDays: normalizedDurationDays,
    monitoringWindow,
    valuationScales,
    valuationWarnings,
    volatilityOutlook,
    profiles,
    generatedAt,
  };
}
