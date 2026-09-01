import test from "node:test";
import assert from "node:assert/strict";
import {
  assessMarketData,
  buildDcaPlan,
  buildDcaPlans,
  calculateAtr,
  createValuationScales,
  normalizeCandles,
  projectValuationAtPrice,
} from "../src/lib/onchain/dcaEngine.js";
import { formatPercent, formatPrice, formatTokenAmount, formatUsd } from "../src/lib/onchain/formatters.js";

function makeCandles(count = 180) {
  const start = 1_750_000_000;
  return Array.from({ length: count }, (_, index) => {
    const trend = 1 + (index * 0.002);
    const cycle = Math.sin(index / 5) * 0.08;
    const close = trend + cycle;
    const open = close * (1 + (Math.sin(index) * 0.012));
    return {
      time: start + (index * 14_400),
      open,
      high: Math.max(open, close) * 1.035,
      low: Math.min(open, close) * 0.965,
      close,
      volume: 20_000 + ((index % 9) * 1_000),
    };
  });
}

function makeShortDailyCandles() {
  // The repeated troughs near 1.34 and 1.21 deliberately provide enough
  // structural-looking touches to prove that candle depth still caps the mode.
  const lows = [
    1.46, 1.44, 1.42, 1.38, 1.34, 1.40, 1.43, 1.39, 1.36, 1.34, 1.41, 1.44, 1.38,
    1.30, 1.22, 1.29, 1.35, 1.25, 1.20, 1.22, 1.31, 1.39, 1.43, 1.46, 1.48, 1.50,
  ];

  return lows.map((low, index) => {
    const close = Math.max(low + 0.04, 1.38 + (index * 0.005));
    const open = close * 0.995;
    return {
      time: 1_750_000_000 + (index * 86_400),
      open,
      high: Math.max(open, close) + 0.025,
      low,
      close,
      volume: 25_000 + ((index % 3) * 1_000),
    };
  });
}

function makeProfileCandles(count = 180) {
  return Array.from({ length: count }, (_, index) => {
    const close = 1 + (index * 0.002);
    return {
      time: 1_750_000_000 + (index * 14_400),
      open: close * 0.999,
      high: close * 1.006,
      low: close * 0.994,
      close,
      volume: 25_000 + ((index % 4) * 1_000),
    };
  });
}

function profileArgs(overrides = {}) {
  const candles = overrides.candles || makeProfileCandles();
  return {
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 750_000,
      volume24h: 400_000,
      ...overrides.market,
    },
    capital: overrides.capital ?? 500,
    durationDays: overrides.durationDays ?? 30,
    targetPct: Object.hasOwn(overrides, "targetPct") ? overrides.targetPct : null,
    expectedIntervalSeconds: overrides.expectedIntervalSeconds ?? 14_400,
    dataAsOf: overrides.dataAsOf || new Date(candles.at(-1).time * 1000).toISOString(),
  };
}

function assertNearlyEqual(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

test("normalizes, sorts, and deduplicates valid candles", () => {
  const candles = makeCandles(3);
  const result = normalizeCandles([candles[2], candles[0], candles[1], candles[1], { time: 1, close: 0 }]);
  assert.equal(result.length, 3);
  assert.ok(result[0].time < result[1].time);
  assert.ok(result[1].time < result[2].time);
});

test("calculates positive true-range ATR", () => {
  const atr = calculateAtr(makeCandles());
  assert.ok(atr > 0);
  assert.ok(Number.isFinite(atr));
});

test("blocks an adaptive plan when liquidity is critically low", () => {
  const candles = makeCandles();
  const market = { priceUsd: candles.at(-1).close, liquidityUsd: 5_000, volume24h: 50_000 };
  const quality = assessMarketData(market, candles);
  assert.equal(quality.canPlan, false);
  assert.match(quality.blockers.join(" "), /liquidity/i);
});

test("builds four descending zones with allocations and coherent totals", () => {
  const candles = makeCandles();
  const market = {
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 420_000,
    poolCreatedAt: "2025-01-01T00:00:00.000Z",
  };
  const plan = buildDcaPlan({ candles, market, capital: 1_000, targetPct: 50 });

  assert.equal(plan.quality.canPlan, true);
  assert.equal(plan.legs.length, 4);
  assert.equal(plan.legs.reduce((sum, leg) => sum + leg.allocationPct, 0), 100);
  assert.equal(plan.legs.reduce((sum, leg) => sum + leg.amountUsd, 0), 1_000);
  assert.ok(plan.legs.every((leg, index) => index === 0 || leg.midpoint < plan.legs[index - 1].midpoint));
  assert.ok(plan.legs.every((leg, index) => index === 0 || plan.legs[index - 1].lower > leg.upper));
  assert.ok(plan.weightedAverageEntry > plan.legs.at(-1).midpoint);
  assert.ok(plan.weightedAverageEntry < plan.legs[0].midpoint);
  assert.ok(Math.abs(plan.targetPrice - (plan.weightedAverageEntry * 1.5)) < 1e-12);
  assert.ok(plan.invalidationPrice < plan.legs.at(-1).lower);
});

test("allocates every budget cent across B1-B4", () => {
  const candles = makeCandles();
  const market = {
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 420_000,
  };

  for (const capital of [100.01, 999.99, 12_345.67]) {
    const plan = buildDcaPlan({ candles, market, capital, targetPct: 50 });
    const allocatedCents = plan.legs.reduce(
      (sum, leg) => sum + Math.round(leg.amountUsd * 100),
      0,
    );
    assert.equal(allocatedCents, Math.round(plan.budget * 100));
  }
});

test("labels ATR-only ladders as volatility references instead of structural support", () => {
  const candles = Array.from({ length: 120 }, (_, index) => {
    const close = 1 + (index * 0.01);
    return {
      time: 1_750_000_000 + (index * 14_400),
      open: close * 0.997,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 25_000,
    };
  });
  const plan = buildDcaPlan({
    candles,
    market: { priceUsd: candles.at(-1).close, liquidityUsd: 500_000, volume24h: 250_000 },
    capital: 500,
    targetPct: 25,
  });

  assert.equal(plan.mode, "volatility-reference");
  assert.equal(plan.structuralSupportCount, 0);
  assert.ok(plan.legs.every(leg => !/repeated/i.test(leg.rationale)));
  assert.ok(plan.legs.every(leg => !/support entry/i.test(leg.label)));
  assert.ok(plan.quality.warnings.some(warning => /volatility-reference/i.test(warning)));
});

test("confidence uses elapsed history instead of treating all candle counts equally", () => {
  const shortWindow = Array.from({ length: 500 }, (_, index) => {
    const close = 1 + Math.sin(index / 7) * 0.04;
    return {
      time: 1_750_000_000 + (index * 300),
      open: close * 0.998,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 25_000,
    };
  });
  const market = {
    priceUsd: shortWindow.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 400_000,
  };
  const quality = assessMarketData(market, shortWindow);
  const plan = buildDcaPlan({ candles: shortWindow, market, capital: 500, targetPct: 25 });

  assert.ok(quality.historyDays > 1 && quality.historyDays < 2);
  assert.equal(quality.confidence, "Moderate data confidence");
  assert.ok(quality.warnings.some(warning => /less than seven days/i.test(warning)));
  assert.equal(plan.mode, "volatility-reference");
});

test("blocks intervals that do not cover a full day", () => {
  const candles = makeCandles(40).map((candle, index) => ({
    ...candle,
    time: 1_750_000_000 + (index * 300),
  }));
  const quality = assessMarketData({
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 400_000,
  }, candles);

  assert.equal(quality.canPlan, false);
  assert.ok(quality.blockers.some(blocker => /at least 24 hours/i.test(blocker)));
});

test("builds a conservative four-leg reference plan from 26 daily candles", () => {
  const candles = makeShortDailyCandles();
  const plan = buildDcaPlan({
    candles,
    market: {
      priceUsd: 1.5,
      liquidityUsd: 750_000,
      volume24h: 400_000,
    },
    capital: 1_000,
    targetPct: 50,
  });

  assert.equal(plan.quality.canPlan, true);
  assert.equal(plan.quality.confidence, "Moderate data confidence");
  assert.equal(plan.mode, "volatility-reference");
  assert.equal(plan.legs.length, 4);
  assert.deepEqual(plan.legs.map(leg => leg.id), ["B1", "B2", "B3", "B4"]);
  assert.ok(plan.structuralSupportCount >= 2);
  assert.ok(plan.legs.every(leg => !/support/i.test(leg.label)));
  assert.ok(plan.legs.every(leg => !/support/i.test(leg.rationale)));
  assert.ok(plan.quality.warnings.some(warning => /fewer than 30 candles/i.test(warning)));
});

test("blocks a ladder when only 19 otherwise-valid daily candles exist", () => {
  const candles = makeShortDailyCandles().slice(0, 19);
  const quality = assessMarketData({
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 400_000,
  }, candles);

  assert.equal(quality.canPlan, false);
  assert.ok(quality.blockers.some(blocker => /at least 20 valid candles/i.test(blocker)));
});

test("blocks 20 five-minute candles because they span less than 24 hours", () => {
  const candles = makeCandles(20).map((candle, index) => ({
    ...candle,
    time: 1_750_000_000 + (index * 300),
  }));
  const quality = assessMarketData({
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 400_000,
  }, candles);

  assert.equal(quality.canPlan, false);
  assert.ok(quality.blockers.some(blocker => /at least 24 hours/i.test(blocker)));
});

test("blocks sparse and stale interval evidence when cadence metadata is available", () => {
  const sparse = makeCandles(20).map((candle, index) => ({
    ...candle,
    time: 1_750_000_000 + (index * 86_400),
  }));
  const market = {
    priceUsd: sparse.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 400_000,
  };
  const sparseQuality = assessMarketData(market, sparse, {
    expectedIntervalSeconds: 300,
    dataAsOf: new Date(sparse.at(-1).time * 1000).toISOString(),
  });
  const staleQuality = assessMarketData(market, makeShortDailyCandles(), {
    expectedIntervalSeconds: 86_400,
    dataAsOf: new Date((makeShortDailyCandles().at(-1).time + (5 * 86_400)) * 1000).toISOString(),
  });

  assert.equal(sparseQuality.canPlan, false);
  assert.ok(sparseQuality.blockers.some(blocker => /too sparse/i.test(blocker)));
  assert.equal(staleQuality.canPlan, false);
  assert.ok(staleQuality.blockers.some(blocker => /stale/i.test(blocker)));
});

test("distinguishes unavailable volume from observed zero volume", () => {
  const candles = makeCandles();
  const baseMarket = {
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
  };
  const unavailable = assessMarketData({ ...baseMarket, volume24h: null }, candles);
  const observedZero = assessMarketData({ ...baseMarket, volume24h: 0 }, candles);

  assert.equal(unavailable.volume24h, null);
  assert.equal(observedZero.volume24h, 0);
  assert.ok(unavailable.warnings.some(warning => /volume is unavailable/i.test(warning)));
  assert.ok(!unavailable.warnings.some(warning => /very low 24-hour volume/i.test(warning)));
  assert.ok(observedZero.warnings.some(warning => /very low 24-hour volume/i.test(warning)));
  assert.ok(unavailable.score > observedZero.score);
});

test("builds three distinct selectable DCA profiles from one evidence set", () => {
  const result = buildDcaPlans(profileArgs());

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.selectedProfileId, "balanced");
  assert.deepEqual(result.profiles.map(profile => profile.profileId), [
    "cautious",
    "balanced",
    "aggressive",
  ]);
  assert.ok(result.profiles.every(profile => profile.quality.canPlan));
  assert.ok(result.profiles.every(profile => profile.legs.length === 4));
  assert.deepEqual(result.profiles.map(profile => profile.legs.map(leg => leg.allocationPct)), [
    [10, 15, 25, 50],
    [15, 20, 25, 40],
    [35, 30, 20, 15],
  ]);

  const [cautious, balanced, aggressive] = result.profiles;
  assert.ok(cautious.legs[0].midpoint < balanced.legs[0].midpoint);
  assert.ok(balanced.legs[0].midpoint < aggressive.legs[0].midpoint);
  assert.ok(result.profiles.every(profile => profile.legs.every(
    (leg, index) => index === 0 || leg.midpoint < profile.legs[index - 1].midpoint,
  )));
});

test("every DCA profile allocates the user's budget to the cent", () => {
  for (const capital of [100.01, 500.03, 12_345.67]) {
    const result = buildDcaPlans(profileArgs({ capital }));
    for (const profile of result.profiles) {
      const allocatedCents = profile.legs.reduce(
        (sum, leg) => sum + Math.round(leg.amountUsd * 100),
        0,
      );
      assert.equal(allocatedCents, Math.round(capital * 100));
    }
  }
});

test("automatic targets vary by profile while a user target overrides all three", () => {
  const automatic = buildDcaPlans(profileArgs({ targetPct: null }));
  const automaticTargets = automatic.profiles.map(profile => profile.targetPct);

  assert.ok(automaticTargets[0] <= automaticTargets[1]);
  assert.ok(automaticTargets[1] <= automaticTargets[2]);
  assert.ok(automaticTargets.every(target => target % 5 === 0));
  assert.ok(automatic.profiles.every(profile => profile.targetSource === "volatility"));

  const overridden = buildDcaPlans(profileArgs({ targetPct: 37 }));
  assert.deepEqual(overridden.profiles.map(profile => profile.targetPct), [37, 37, 37]);
  assert.ok(overridden.profiles.every(profile => profile.targetSource === "user"));
  assert.ok(overridden.profiles.every(profile => (
    Math.abs(profile.targetPrice - (profile.weightedAverageEntry * 1.37)) < 1e-12
  )));
});

test("duration controls the monitoring window and volatility outlook without moving buy zones", () => {
  const sevenDays = buildDcaPlans(profileArgs({ durationDays: 7 }));
  const ninetyDays = buildDcaPlans(profileArgs({ durationDays: 90 }));

  assert.ok(ninetyDays.volatilityOutlook.horizonRangePct > sevenDays.volatilityOutlook.horizonRangePct);
  assert.deepEqual(
    sevenDays.profiles.map(profile => profile.legs.map(leg => leg.midpoint)),
    ninetyDays.profiles.map(profile => profile.legs.map(leg => leg.midpoint)),
  );
  assert.equal(sevenDays.monitoringWindow.predictsBuyDates, false);
  assert.equal(sevenDays.monitoringWindow.triggerType, "price-zone");
  assert.equal(
    Date.parse(sevenDays.monitoringWindow.reviewAt) - Date.parse(sevenDays.monitoringWindow.startsAt),
    7 * 86_400_000,
  );
  assert.equal(buildDcaPlans(profileArgs({ durationDays: 1 })).durationDays, 7);
  assert.equal(buildDcaPlans(profileArgs({ durationDays: 999 })).durationDays, 90);
});

test("projects every buy, target, and reassessment into verified market cap and FDV", () => {
  const candles = makeProfileCandles();
  const currentPrice = candles.at(-1).close;
  const marketCapMultiplier = 500_000;
  const fdvMultiplier = 1_200_000;
  const result = buildDcaPlans(profileArgs({
    candles,
    market: {
      priceUsd: currentPrice,
      marketCapUsd: currentPrice * marketCapMultiplier,
      fdvUsd: currentPrice * fdvMultiplier,
    },
  }));
  const plan = result.profiles[1];
  const leg = plan.legs[0];

  assert.equal(result.valuationScales.marketCap.available, true);
  assert.equal(result.valuationScales.fdv.available, true);
  assertNearlyEqual(leg.valuation.lower.marketCapUsd, leg.lower * marketCapMultiplier);
  assertNearlyEqual(leg.valuation.upper.fdvUsd, leg.upper * fdvMultiplier);
  assertNearlyEqual(plan.target.valuation.marketCapUsd, plan.targetPrice * marketCapMultiplier);
  assertNearlyEqual(plan.reassessment.valuation.fdvUsd, plan.invalidationPrice * fdvMultiplier);

  const projected = projectValuationAtPrice(
    currentPrice / 2,
    createValuationScales({
      marketCapUsd: currentPrice * marketCapMultiplier,
      fdvUsd: currentPrice * fdvMultiplier,
    }, currentPrice),
  );
  assertNearlyEqual(projected.marketCapUsd, (currentPrice * marketCapMultiplier) / 2);
  assertNearlyEqual(projected.fdvUsd, (currentPrice * fdvMultiplier) / 2);
});

test("never fabricates market cap or FDV projections when provider values are unavailable", () => {
  const missing = buildDcaPlans(profileArgs({
    market: { marketCapUsd: null, fdvUsd: 0 },
  }));
  const leg = missing.profiles[1].legs[0];

  assert.equal(missing.valuationScales.marketCap.available, false);
  assert.equal(missing.valuationScales.fdv.available, false);
  assert.equal(leg.valuation.lower.marketCapUsd, null);
  assert.equal(leg.valuation.lower.fdvUsd, null);
  assert.equal(missing.profiles[1].target.valuation.marketCapUsd, null);
  assert.equal(missing.profiles[1].reassessment.valuation.fdvUsd, null);
});

test("reassessment and fill-scenario math reconcile to the full DCA plan", () => {
  const result = buildDcaPlans(profileArgs({ capital: 500.03, targetPct: 50 }));

  for (const profile of result.profiles) {
    assert.ok(profile.invalidationPrice < profile.legs.at(-1).lower);
    assert.equal(profile.reassessment.automaticOrder, false);
    assert.equal(profile.reassessment.action, "reassess-or-exit");
    assertNearlyEqual(profile.reassessment.valueUsd, profile.totalTokens * profile.invalidationPrice);
    assertNearlyEqual(profile.reassessment.pnlUsd, profile.reassessment.valueUsd - profile.budget);
    assertNearlyEqual(
      profile.reassessment.pnlPct,
      ((profile.reassessment.valueUsd / profile.budget) - 1) * 100,
    );
    assertNearlyEqual(
      profile.reassessment.capitalAtRiskUsd,
      Math.max(0, profile.budget - profile.reassessment.valueUsd),
    );

    assert.equal(profile.fillScenarios.length, 4);
    profile.fillScenarios.forEach((scenario, index) => {
      const expectedCents = profile.legs.slice(0, index + 1).reduce(
        (sum, leg) => sum + Math.round(leg.amountUsd * 100),
        0,
      );
      assert.equal(Math.round(scenario.investedUsd * 100), expectedCents);
      assert.equal(
        Math.round((scenario.investedUsd + scenario.unusedBudgetUsd) * 100),
        Math.round(profile.budget * 100),
      );
      assertNearlyEqual(scenario.averageEntry, scenario.investedUsd / scenario.tokenAmount);
    });
    const fullFill = profile.fillScenarios.at(-1);
    assertNearlyEqual(fullFill.tokenAmount, profile.totalTokens);
    assertNearlyEqual(fullFill.averageEntry, profile.weightedAverageEntry);
    assertNearlyEqual(fullFill.targetPrice, profile.targetPrice);
  }
});

test("blocked evidence keeps all three profile choices visible but disabled", () => {
  const candles = makeShortDailyCandles().slice(0, 19);
  const result = buildDcaPlans({
    candles,
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd: 750_000,
      volume24h: 400_000,
    },
    expectedIntervalSeconds: 86_400,
    dataAsOf: new Date(candles.at(-1).time * 1000).toISOString(),
  });

  assert.equal(result.quality.canPlan, false);
  assert.equal(result.profiles.length, 3);
  assert.ok(result.profiles.every(profile => profile.mode === "blocked"));
  assert.ok(result.profiles.every(profile => profile.legs.length === 0));
  assert.ok(result.profiles.every(profile => profile.target === null));
});

test("extreme volatility outlook stays finite and above zero", () => {
  const candles = makeProfileCandles().map(candle => ({
    ...candle,
    high: candle.close * 1.8,
    low: candle.close * 0.2,
  }));
  const result = buildDcaPlans(profileArgs({ candles, durationDays: 90 }));

  assert.equal(result.volatilityOutlook.horizonRangePct, 300);
  assert.ok(result.volatilityOutlook.lower.priceUsd > 0);
  assert.ok(result.volatilityOutlook.lower.priceUsd < result.volatilityOutlook.current.priceUsd);
  assert.ok(result.volatilityOutlook.upper.priceUsd > result.volatilityOutlook.current.priceUsd);
  assert.ok(result.profiles.every(profile => Number.isFinite(profile.reassessment.price)));
});

test("formatters keep unavailable provider values distinct from zero", () => {
  assert.equal(formatUsd(null), "—");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatTokenAmount(null), "—");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatPercent(0), "0.00%");
  assert.equal(formatPrice(1e-19), "$1.0000e-19");
});
