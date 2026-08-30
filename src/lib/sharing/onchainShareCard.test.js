import test from "node:test";
import assert from "node:assert/strict";
import { buildOnchainShareModel } from "./onchainShareModel.js";

const asset = {
  network: "solana",
  poolAddress: "Pool111111111111111111111111111111111111111",
  dex: { id: "meteora", name: "Meteora" },
  counterToken: { symbol: "SOL" },
  token: {
    address: "So11111111111111111111111111111111111111112",
    name: "Example Coin",
    symbol: "ex",
    image: null,
  },
  market: {
    priceUsd: 2,
    marketCapUsd: 20_000_000,
    fdvUsd: 25_000_000,
  },
};

const plan = {
  mode: "adaptive",
  budget: 1_000,
  targetPct: 50,
  weightedAverageEntry: 1,
  targetPrice: 1.5,
  targetValue: 1_500,
  invalidationPrice: 0.5,
  invalidationValue: 500,
  reassessment: {
    condition: "selected-interval-close-below",
    automaticOrder: false,
  },
  targetAlreadyMet: true,
  quality: { canPlan: true, currentPrice: 2, score: 82 },
  legs: [
    { id: "B1", allocationPct: 15, amountUsd: 150, lower: 1.7, upper: 1.8, drawdownPct: -12.5 },
    { id: "B2", allocationPct: 20, amountUsd: 200, lower: 1.4, upper: 1.5, drawdownPct: -27.5 },
    { id: "B3", allocationPct: 25, amountUsd: 250, lower: 1.1, upper: 1.2, drawdownPct: -42.5 },
    { id: "B4", allocationPct: 40, amountUsd: 400, lower: 0.8, upper: 0.9, drawdownPct: -57.5 },
  ],
};

test("buildOnchainShareModel converts every plan price to market cap and FDV", () => {
  const model = buildOnchainShareModel({
    asset,
    plan,
    profile: { id: "balanced", name: "Balanced" },
    reviewDays: 30,
    timeframeLabel: "4H",
    valueMode: "marketCap",
    marketDataAsOf: "2026-08-30T12:00:00.000Z",
    candleDataAsOf: "2026-08-30T12:05:00.000Z",
    valuationWarnings: ["Reported market cap exceeds FDV."],
  });

  assert.equal(model.token.symbol, "EX");
  assert.equal(model.profile.label, "Balanced");
  assert.equal(model.mode, "marketCap");
  assert.equal(model.legs.length, 4);
  assert.equal(model.legs[0].valuationLower.marketCap, 17_000_000);
  assert.equal(model.legs[0].valuationUpper.fdv, 22_500_000);
  assert.equal(model.targetValuation.marketCap, 15_000_000);
  assert.equal(model.targetValuation.fdv, 18_750_000);
  assert.equal(model.targetAlreadyMet, true);
  assert.equal(model.invalidationValuation.marketCap, 5_000_000);
  assert.equal(model.downsideFromAveragePct, -50);
  assert.equal(model.reviewDays, 30);
  assert.equal(model.timeframeLabel, "4H");
  assert.equal(model.source.poolAddress, asset.poolAddress);
  assert.equal(model.source.dex, "Meteora");
  assert.equal(model.source.counterSymbol, "SOL");
  assert.equal(model.source.provider, "GeckoTerminal");
  assert.equal(model.marketDataAsOf, "2026-08-30T12:00:00.000Z");
  assert.equal(model.candleDataAsOf, "2026-08-30T12:05:00.000Z");
  assert.equal(model.reassessmentCondition, "selected-interval-close-below");
  assert.equal(model.reassessmentAutomaticOrder, false);
  assert.equal(model.impliedValuation, true);
  assert.deepEqual(model.valuationWarnings, ["Reported market cap exceeds FDV."]);
});

test("buildOnchainShareModel never silently substitutes FDV for missing market cap", () => {
  const model = buildOnchainShareModel({
    asset: { ...asset, market: { priceUsd: 2, marketCapUsd: null, fdvUsd: 25_000_000 } },
    plan,
    profile: "Fast",
    valueMode: "marketCap",
  });

  assert.equal(model.mode, "marketCap");
  assert.equal(model.modeLabel, "Market cap");
  assert.equal(model.profile.label, "Fast");
  assert.equal(model.legs[3].valuationLower.marketCap, null);
  assert.equal(model.legs[3].valuationLower.fdv, 10_000_000);
});

test("buildOnchainShareModel rejects blocked or incomplete plans", () => {
  assert.equal(buildOnchainShareModel({ asset, plan: { ...plan, quality: { canPlan: false } } }), null);
  assert.equal(buildOnchainShareModel({ asset, plan: { ...plan, legs: [] } }), null);
  assert.equal(buildOnchainShareModel({ asset: null, plan }), null);
});
