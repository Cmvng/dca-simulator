import test from "node:test";
import assert from "node:assert/strict";
import {
  assessMarketData,
  buildDcaPlan,
  calculateAtr,
  normalizeCandles,
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
  assert.ok(plan.weightedAverageEntry > plan.legs.at(-1).midpoint);
  assert.ok(plan.weightedAverageEntry < plan.legs[0].midpoint);
  assert.ok(Math.abs(plan.targetPrice - (plan.weightedAverageEntry * 1.5)) < 1e-12);
  assert.ok(plan.invalidationPrice < plan.legs.at(-1).lower);
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

test("formatters keep unavailable provider values distinct from zero", () => {
  assert.equal(formatUsd(null), "—");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatTokenAmount(null), "—");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatPercent(0), "0.00%");
  assert.equal(formatPrice(1e-19), "$1.0000e-19");
});
