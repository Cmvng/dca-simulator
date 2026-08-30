export const ONCHAIN_CARD_FORMATS = [
  { id: "square", label: "Square", width: 1080, height: 1080 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
];

export const ONCHAIN_VALUE_MODES = [
  { id: "price", label: "Price" },
  { id: "marketCap", label: "MCAP" },
  { id: "fdv", label: "FDV" },
];

const FREQUENCY_LABELS = Object.freeze({
  "1h": "Every hour",
  hourly: "Every hour",
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
  "1d": "Every day",
  daily: "Every day",
  "1w": "Every week",
  weekly: "Every week",
});

const finite = value => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value));
const positive = value => finite(value) && Number(value) > 0;

function firstFinite(...values) {
  const found = values.find(finite);
  return found === undefined ? null : Number(found);
}

function firstPositive(...values) {
  const found = values.find(positive);
  return found === undefined ? null : Number(found);
}

function firstText(...values) {
  const found = values.find(value => typeof value === "string" && value.trim());
  return found ? found.trim() : "";
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.buys)) return value.buys;
  if (Array.isArray(value?.scheduledBuys)) return value.scheduledBuys;
  if (Array.isArray(value?.schedule)) return value.schedule;
  return [];
}

function frequencyLabel(id, explicitLabel) {
  if (firstText(explicitLabel)) return firstText(explicitLabel);
  const normalized = firstText(id).toLowerCase();
  return FREQUENCY_LABELS[normalized] || (normalized ? `Every ${normalized}` : "Scheduled buys");
}

function valuationAtPrice(price, currentPrice, currentValuation) {
  if (!positive(price) || !positive(currentPrice) || !positive(currentValuation)) return null;
  return Number(currentValuation) * (Number(price) / Number(currentPrice));
}

function valuationSet(price, currentPrice, marketCap, fdv) {
  return {
    price: positive(price) ? Number(price) : null,
    marketCap: valuationAtPrice(price, currentPrice, marketCap),
    fdv: valuationAtPrice(price, currentPrice, fdv),
  };
}

function valuationSetFromPoint(point, price, currentPrice, marketCap, fdv) {
  const projected = valuationSet(price, currentPrice, marketCap, fdv);
  if (!point || typeof point !== "object") return projected;
  return {
    price: projected.price,
    marketCap: firstPositive(point.valuation?.marketCapUsd, projected.marketCap),
    fdv: firstPositive(point.valuation?.fdvUsd, projected.fdv),
  };
}

function pointPrice(point) {
  if (finite(point)) return Number(point);
  return firstPositive(
    point?.price,
    point?.priceUsd,
    point?.targetPrice,
    point?.reviewPrice,
    point?.level,
    point?.value,
  );
}

function normalizeWarnings(...sources) {
  return sources
    .flatMap(source => Array.isArray(source) ? source : [])
    .filter(item => typeof item === "string" && item.trim())
    .map(item => item.trim())
    .filter((item, index, items) => items.indexOf(item) === index);
}

function isBlocked(plan) {
  return plan?.quality?.canPlan === false
    || plan?.canPlan === false
    || plan?.canSimulate === false
    || plan?.blocked === true
    || (Array.isArray(plan?.blockers) && plan.blockers.length > 0)
    || (Array.isArray(plan?.blockingReasons) && plan.blockingReasons.length > 0);
}

export function buildOnchainShareModel({
  asset,
  plan,
  valueMode = "marketCap",
  dataAsOf,
  marketDataAsOf,
  candleDataAsOf,
  valuationWarnings = [],
  warnings = [],
}) {
  if (!asset?.token || !plan || isBlocked(plan)) return null;

  const market = asset.market || plan.market || {};
  const currentPrice = firstPositive(
    market.priceUsd,
    plan.currentPrice,
    plan.quality?.currentPrice,
    plan.market?.priceUsd,
  );
  if (!currentPrice) return null;

  const marketCap = firstPositive(market.marketCapUsd, plan.market?.marketCapUsd);
  const fdv = firstPositive(market.fdvUsd, plan.market?.fdvUsd);
  const requestedMode = valueMode === "fdv" || valueMode === "marketCap" ? valueMode : "price";

  const scheduledBuys = listFrom(plan.schedule);
  const executedBuys = listFrom(plan.executedBuys || plan.scenario?.executedBuys || plan.execution?.buys);
  const totalAmountUsd = firstPositive(
    plan.totalUsd,
    plan.totalAmountUsd,
    plan.budget,
    plan.schedule?.totalUsd,
    plan.schedule?.totalAmountUsd,
    plan.inputs?.totalUsd,
  );
  const plannedBuyCount = Math.max(0, Math.round(firstFinite(
    plan.schedule?.count,
    plan.schedule?.buyCount,
    plan.schedule?.purchaseCount,
    plan.plannedBuyCount,
    scheduledBuys.length,
  ) || 0));
  const amountPerBuyUsd = firstPositive(
    plan.schedule?.amountPerBuyUsd,
    plan.schedule?.perBuyUsd,
    plan.amountPerBuyUsd,
    scheduledBuys[0]?.amountUsd,
    totalAmountUsd && plannedBuyCount ? totalAmountUsd / plannedBuyCount : null,
  );
  const durationDays = Math.max(1, Math.round(firstFinite(
    plan.durationDays,
    plan.schedule?.durationDays,
    plan.inputs?.durationDays,
  ) || 1));
  const frequencyId = firstText(
    plan.frequencyId,
    plan.schedule?.frequencyId,
    plan.schedule?.frequency?.id,
    plan.frequency?.id,
    plan.inputs?.frequencyId,
  ).toLowerCase();
  const buyFrequencyLabel = frequencyLabel(
    frequencyId,
    firstText(plan.frequencyLabel, plan.schedule?.frequencyLabel, plan.schedule?.frequency?.label, plan.frequency?.label),
  );

  if (!totalAmountUsd || !plannedBuyCount || !amountPerBuyUsd) return null;

  const averageEntryPrice = firstPositive(
    plan.averageEntry,
    plan.averageEntryUsd,
    plan.modeledAverageEntry,
    plan.weightedAverageEntry,
    plan.scenario?.averageEntry,
    plan.scenario?.weightedAverageEntry,
    executedBuys.at(-1)?.averageEntry,
    executedBuys.at(-1)?.weightedAverageEntry,
  );
  const targetPoint = plan.target || plan.profitTarget || {};
  const reviewPoint = plan.review || plan.riskReview || plan.downsideReview || {};
  const profitTargetPct = firstFinite(
    plan.targetPct,
    targetPoint.pct,
    targetPoint.targetPct,
    plan.inputs?.targetPct,
  );
  const profitTargetPrice = pointPrice(targetPoint) || firstPositive(plan.targetPrice);
  const riskReviewPrice = pointPrice(reviewPoint) || firstPositive(plan.reviewPrice, plan.invalidationPrice);
  const volatility = plan.volatility || {};
  const dailySwingPct = firstFinite(
    volatility.dailySwingPct,
    volatility.typicalDailySwingPct,
    volatility.expectedDailySwingPct,
    volatility.dailyPct,
    volatility.annualizedPct,
    plan.dailySwingPct,
  );
  const volatilityTier = firstText(
    volatility.tier,
    volatility.label,
    volatility.band,
    volatility.category,
    plan.volatilityTier,
  ) || "Measured";
  const volatilityScore = firstFinite(volatility.score, plan.volatilityScore);
  const unusedBudgetUsd = Math.max(0, firstFinite(
    plan.unusedBudgetUsd,
    plan.scenario?.unusedBudgetUsd,
    totalAmountUsd - executedBuys.reduce((sum, buy) => sum + (firstFinite(buy?.amountUsd) || 0), 0),
  ) || 0);
  const terminalType = firstText(
    plan.terminalEvent?.kind,
    plan.terminalEvent?.type,
    plan.scenario?.terminalEvent?.type,
    plan.status,
  ).toLowerCase();

  const quoteAsOf = marketDataAsOf || asset.resolvedAt || plan.marketDataAsOf || null;
  const candlesAsOf = candleDataAsOf || dataAsOf || plan.dataAsOf || volatility.sampleEnd || plan.generatedAt || null;
  const generatedAt = plan.generatedAt || dataAsOf || candlesAsOf || null;
  const allWarnings = normalizeWarnings(valuationWarnings, warnings, plan.warnings);

  return {
    token: {
      name: asset.token.name || asset.token.symbol || "Token",
      symbol: String(asset.token.symbol || "TOKEN").toUpperCase(),
      address: asset.token.address || "",
      image: asset.token.image || null,
      network: asset.network || "onchain",
    },
    source: {
      poolAddress: asset.poolAddress || plan.source?.poolAddress || "",
      dex: typeof asset.dex === "string"
        ? asset.dex
        : asset.dex?.name || asset.dex?.id || plan.source?.dex || "Unknown DEX",
      counterSymbol: asset.counterToken?.symbol || plan.source?.counterSymbol || "?",
      provider: plan.source?.provider || "GeckoTerminal",
    },
    timestamps: {
      marketDataAsOf: quoteAsOf,
      candleDataAsOf: candlesAsOf,
      generatedAt,
      planStartsAt: plan.schedule?.startsAt || null,
      planEndsAt: plan.schedule?.endsAt || null,
    },
    mode: requestedMode,
    modeLabel: requestedMode === "marketCap" ? "MCAP" : requestedMode === "fdv" ? "FDV" : "Price",
    impliedValuation: requestedMode !== "price",
    valuationAvailable: requestedMode === "price"
      || (requestedMode === "marketCap" ? Boolean(marketCap) : Boolean(fdv)),
    warnings: allWarnings,
    current: valuationSet(currentPrice, currentPrice, marketCap, fdv),
    totalAmountUsd,
    durationDays,
    frequencyId,
    buyFrequencyLabel,
    plannedBuyCount,
    amountPerBuyUsd,
    executedSampleBuyCount: executedBuys.length,
    averageEntry: valuationSet(averageEntryPrice, currentPrice, marketCap, fdv),
    profitTargetPct,
    profitTarget: valuationSetFromPoint(targetPoint, profitTargetPrice, currentPrice, marketCap, fdv),
    riskReview: valuationSetFromPoint(reviewPoint, riskReviewPrice, currentPrice, marketCap, fdv),
    volatilityTier,
    dailySwingPct,
    volatilityScore,
    unusedBudgetUsd,
    terminalType,
    simulationOnly: true,
    notForecast: true,
  };
}
