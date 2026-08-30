export const ONCHAIN_CARD_FORMATS = [
  { id: "x", label: "X post", width: 1200, height: 675 },
  { id: "square", label: "Square", width: 1080, height: 1080 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
];

export const ONCHAIN_VALUE_MODES = [
  { id: "price", label: "Price" },
  { id: "marketCap", label: "Market cap" },
  { id: "fdv", label: "FDV" },
];

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

function valuationAtPrice(price, currentPrice, currentValuation) {
  if (!finitePositive(price) || !finitePositive(currentPrice) || !finitePositive(currentValuation)) return null;
  return Number(currentValuation) * (Number(price) / Number(currentPrice));
}

function normalizeProfile(profile) {
  if (typeof profile === "string") return { id: profile.toLowerCase(), label: profile };
  return {
    id: profile?.id || "balanced",
    label: profile?.label || profile?.name || "Balanced",
    description: profile?.description || "Balanced entries across four volatility zones",
  };
}

export function buildOnchainShareModel({
  asset,
  plan,
  profile,
  reviewDays = 30,
  timeframeLabel = "4H",
  valueMode = "marketCap",
  dataAsOf,
  marketDataAsOf,
  candleDataAsOf,
  valuationWarnings = [],
}) {
  if (!asset?.token || !plan?.quality?.canPlan || !plan?.legs?.length) return null;

  const market = asset.market || {};
  const currentPrice = finitePositive(market.priceUsd)
    ? Number(market.priceUsd)
    : Number(plan.quality.currentPrice);
  const marketCap = finitePositive(market.marketCapUsd) ? Number(market.marketCapUsd) : null;
  const fdv = finitePositive(market.fdvUsd) ? Number(market.fdvUsd) : null;
  const requestedMode = valueMode === "fdv" || valueMode === "marketCap" ? valueMode : "price";
  const mode = requestedMode;
  const primaryValuation = mode === "marketCap" ? marketCap : mode === "fdv" ? fdv : currentPrice;

  const convert = price => ({
    marketCap: valuationAtPrice(price, currentPrice, marketCap),
    fdv: valuationAtPrice(price, currentPrice, fdv),
  });

  const legs = plan.legs.map(leg => ({
    id: leg.id,
    allocationPct: Number(leg.allocationPct),
    amountUsd: Number(leg.amountUsd),
    priceLower: Number(leg.lower),
    priceUpper: Number(leg.upper),
    drawdownPct: Number(leg.drawdownPct),
    valuationLower: convert(leg.lower),
    valuationUpper: convert(leg.upper),
  }));

  const targetValuation = convert(plan.targetPrice);
  const invalidationValuation = convert(plan.invalidationPrice);
  const downsideFromAveragePct = finitePositive(plan.weightedAverageEntry)
    ? ((Number(plan.invalidationPrice) / Number(plan.weightedAverageEntry)) - 1) * 100
    : null;

  return {
    token: {
      name: asset.token.name || asset.token.symbol || "Token",
      symbol: String(asset.token.symbol || "TOKEN").toUpperCase(),
      address: asset.token.address || "",
      image: asset.token.image || null,
      network: asset.network || "onchain",
    },
    profile: normalizeProfile(profile),
    source: {
      poolAddress: asset.poolAddress || "",
      dex: typeof asset.dex === "string"
        ? asset.dex
        : asset.dex?.name || asset.dex?.id || "Unknown DEX",
      counterSymbol: asset.counterToken?.symbol || "?",
      provider: "GeckoTerminal",
    },
    timeframeLabel,
    marketDataAsOf: marketDataAsOf || asset.resolvedAt || null,
    candleDataAsOf: candleDataAsOf || dataAsOf || plan.generatedAt || null,
    dataAsOf: candleDataAsOf || dataAsOf || plan.generatedAt || null,
    reviewDays: Math.max(1, Math.round(Number(reviewDays) || 30)),
    mode,
    modeLabel: mode === "marketCap" ? "Market cap" : mode === "fdv" ? "FDV" : "Price",
    impliedValuation: mode !== "price",
    valuationWarnings: Array.isArray(valuationWarnings)
      ? valuationWarnings.filter(item => typeof item === "string" && item.trim()).map(item => item.trim())
      : [],
    currentPrice,
    currentMarketCap: marketCap,
    currentFdv: fdv,
    currentPrimaryValuation: primaryValuation,
    budget: Number(plan.budget),
    targetPct: Number(plan.targetPct),
    targetPrice: Number(plan.targetPrice),
    targetValue: Number(plan.targetValue),
    targetValuation,
    targetAlreadyMet: Boolean(plan.targetAlreadyMet),
    invalidationPrice: Number(plan.invalidationPrice),
    invalidationValue: Number(plan.invalidationValue),
    invalidationValuation,
    reassessmentCondition: plan.reassessment?.condition || "selected-interval-close-below",
    reassessmentAutomaticOrder: Boolean(plan.reassessment?.automaticOrder),
    downsideFromAveragePct,
    averageEntry: Number(plan.weightedAverageEntry),
    qualityScore: Number(plan.quality.score),
    planMode: plan.mode,
    legs,
  };
}
