const DEFAULT_ALLOCATIONS = [15, 20, 25, 40];

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

export function assessMarketData(market = {}, rawCandles = []) {
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
  const createdAt = market.poolCreatedAt ? Date.parse(market.poolCreatedAt) : NaN;
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : null;
  const blockers = [];
  const warnings = [];

  if (!finitePositive(currentPrice)) blockers.push("No usable USD price was returned for the selected pool.");
  if (candles.length < 30) blockers.push("At least 30 valid candles are required before plotting DCA zones.");
  if (candles.length >= 30 && historyHours < 24) blockers.push("The selected interval must cover at least 24 hours before plotting DCA zones.");
  if (liquidity === null) blockers.push("No usable pool-liquidity value was returned.");
  else if (liquidity < 10_000) blockers.push("Pool liquidity is below the $10,000 minimum for this simulator.");
  if (divergence > 0.35) blockers.push("The live quote and latest candle differ too much to produce reliable levels.");

  if (candles.length >= 30 && candles.length < 80) warnings.push("Limited candle history lowers confidence in support zones.");
  if (historyHours >= 24 && historyDays < 7) warnings.push("The selected interval covers less than seven days, so levels are short-window volatility references.");
  else if (historyDays >= 7 && historyDays < 30) warnings.push("The selected interval covers less than 30 days of market history.");
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

export function buildDcaPlan({ rawCandles, candles: suppliedCandles, market = {}, capital = 500, targetPct = 50 }) {
  const candles = normalizeCandles(suppliedCandles || rawCandles || []);
  const budget = clamp(Number(capital) || 500, 1, 10_000_000);
  const gainTarget = clamp(Number(targetPct) || 50, 5, 500);
  const quality = assessMarketData(market, candles);

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
  const hasStructuralHistory = quality.historyDays >= 7;
  const mode = structuralCount >= 2 && hasStructuralHistory ? "adaptive" : "volatility-reference";
  const planQuality = mode === "adaptive"
    ? quality
    : {
        ...quality,
        warnings: [
          ...quality.warnings,
          structuralCount < 2
            ? "Fewer than two repeated support zones were found. Treat this as a volatility-reference ladder, not a structural setup."
            : "The selected interval covers less than seven days. Treat its repeated levels as short-window volatility references, not structural support.",
        ],
      };
  const legs = levels.map((level, index) => {
    const allocationPct = DEFAULT_ALLOCATIONS[index];
    const amountUsd = budget * (allocationPct / 100);
    const zoneWidth = Math.min(level.price * 0.06, Math.max(level.price * 0.012, quality.atr * 0.18));
    const midpoint = level.price;

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
      rationale: level.source,
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
