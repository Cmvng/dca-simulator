import test from "node:test";
import assert from "node:assert/strict";
import { buildOnchainShareModel } from "./onchainShareModel.js";

const asset = {
  network: "solana",
  poolAddress: "Pool111111111111111111111111111111111111111",
  resolvedAt: "2026-08-30T12:00:00.000Z",
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
  schemaVersion: 1,
  canSimulate: true,
  quality: { canPlan: true, currentPrice: 2, score: 82 },
  inputs: { totalUsd: 1_000, frequencyId: "6h", durationDays: 30, targetPct: 50 },
  frequency: { id: "6h", label: "Every 6 hours" },
  schedule: {
    startsAt: 1_788_091_200,
    endsAt: 1_790_683_200,
    durationDays: 30,
    purchaseCount: 120,
    amountPerBuyUsd: 8.33,
    amountRangeUsd: { min: 8.33, max: 8.34 },
    scheduledBuys: [
      { id: "buy-1", time: 1_788_091_200, amountUsd: 8.34 },
      { id: "buy-2", time: 1_788_112_800, amountUsd: 8.34 },
    ],
  },
  volatility: {
    dailyPct: 7.2,
    typicalDailySwingPct: 8.4,
    score: 76,
    category: "High",
    sampleStart: "2026-07-30T12:05:00.000Z",
    sampleEnd: "2026-08-30T12:05:00.000Z",
  },
  executedBuys: [
    { id: "buy-1", amountUsd: 8.34, priceUsd: 1.2, averageEntryUsd: 1.2 },
    { id: "buy-2", amountUsd: 8.34, priceUsd: 1.3, averageEntryUsd: 1.25 },
  ],
  averageEntryUsd: 1.25,
  target: { id: "S", priceUsd: 1.875, targetPct: 50 },
  review: { id: "X", priceUsd: 0.8, bufferPct: 36 },
  terminalEvent: null,
  unusedBudgetUsd: 983.32,
  warnings: ["Thin liquidity can increase slippage."],
};

test("buildOnchainShareModel exposes the simple scheduled-plan facts", () => {
  const model = buildOnchainShareModel({
    asset,
    plan,
    valueMode: "marketCap",
    marketDataAsOf: "2026-08-30T12:00:00.000Z",
    candleDataAsOf: "2026-08-30T12:05:00.000Z",
    valuationWarnings: ["Reported market cap exceeds FDV."],
  });

  assert.equal(model.token.symbol, "EX");
  assert.equal(model.mode, "marketCap");
  assert.equal(model.totalAmountUsd, 1_000);
  assert.equal(model.durationDays, 30);
  assert.equal(model.frequencyId, "6h");
  assert.equal(model.buyFrequencyLabel, "Every 6 hours");
  assert.equal(model.plannedBuyCount, 120);
  assert.equal(model.amountPerBuyUsd, 8.33);
  assert.equal(model.executedSampleBuyCount, 2);
  assert.equal(model.averageEntry.price, 1.25);
  assert.equal(model.averageEntry.marketCap, 12_500_000);
  assert.equal(model.profitTarget.price, 1.875);
  assert.equal(model.profitTarget.marketCap, 18_750_000);
  assert.equal(model.profitTarget.fdv, 23_437_500);
  assert.equal(model.riskReview.marketCap, 8_000_000);
  assert.equal(model.profitTargetPct, 50);
  assert.equal(model.volatilityTier, "High");
  assert.equal(model.dailySwingPct, 8.4);
  assert.equal(model.volatilityScore, 76);
  assert.equal(model.unusedBudgetUsd, 983.32);
  assert.equal(model.source.poolAddress, asset.poolAddress);
  assert.equal(model.source.dex, "Meteora");
  assert.equal(model.source.counterSymbol, "SOL");
  assert.equal(model.source.provider, "GeckoTerminal");
  assert.equal(model.timestamps.marketDataAsOf, "2026-08-30T12:00:00.000Z");
  assert.equal(model.timestamps.candleDataAsOf, "2026-08-30T12:05:00.000Z");
  assert.equal(model.timestamps.planStartsAt, 1_788_091_200);
  assert.equal(model.timestamps.planEndsAt, 1_790_683_200);
  assert.equal(model.simulationOnly, true);
  assert.equal(model.notForecast, true);
  assert.deepEqual(model.warnings, [
    "Reported market cap exceeds FDV.",
    "Thin liquidity can increase slippage.",
  ]);
  assert.equal("legs" in model, false);
  assert.equal("profile" in model, false);
});

test("buildOnchainShareModel never substitutes FDV for missing MCAP", () => {
  const model = buildOnchainShareModel({
    asset: { ...asset, market: { priceUsd: 2, marketCapUsd: null, fdvUsd: 25_000_000 } },
    plan,
    valueMode: "marketCap",
  });

  assert.equal(model.mode, "marketCap");
  assert.equal(model.modeLabel, "MCAP");
  assert.equal(model.valuationAvailable, false);
  assert.equal(model.current.marketCap, null);
  assert.equal(model.averageEntry.marketCap, null);
  assert.equal(model.averageEntry.fdv, 15_625_000);
});

test("buildOnchainShareModel accepts hourly plans without capping the buy count", () => {
  const hourly = {
    ...plan,
    inputs: { ...plan.inputs, frequencyId: "1h", durationDays: 90 },
    frequency: { id: "1h", label: "Every hour" },
    schedule: {
      ...plan.schedule,
      durationDays: 90,
      purchaseCount: 2_160,
      amountPerBuyUsd: 0.46,
    },
  };
  const model = buildOnchainShareModel({ asset, plan: hourly, valueMode: "price" });

  assert.equal(model.plannedBuyCount, 2_160);
  assert.equal(model.buyFrequencyLabel, "Every hour");
  assert.equal(model.durationDays, 90);
});

test("buildOnchainShareModel rejects blocked or incomplete simulations", () => {
  assert.equal(buildOnchainShareModel({ asset, plan: { ...plan, canSimulate: false } }), null);
  assert.equal(buildOnchainShareModel({ asset, plan: { ...plan, blockingReasons: ["Not enough candles"] } }), null);
  assert.equal(buildOnchainShareModel({ asset, plan: { ...plan, schedule: { purchaseCount: 0 } } }), null);
  assert.equal(buildOnchainShareModel({ asset: null, plan }), null);
});
