const MIN_REFERENCE_CANDLES = 20;
const MIN_STRUCTURAL_CANDLES = 30;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const finiteNonNegative = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

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
  // Pool age shares the candle-staleness reference so identical inputs always
  // produce identical scores; the wall clock is only a fallback.
  const nowMilliseconds = Number.isFinite(asOfMilliseconds) ? asOfMilliseconds : Date.now();
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, (nowMilliseconds - createdAt) / 86_400_000) : null;
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
