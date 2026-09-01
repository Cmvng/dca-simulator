import test from "node:test";
import assert from "node:assert/strict";
import {
  assessMarketData,
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

test("blocks planning when liquidity is critically low", () => {
  const candles = makeCandles();
  const market = { priceUsd: candles.at(-1).close, liquidityUsd: 5_000, volume24h: 50_000 };
  const quality = assessMarketData(market, candles);
  assert.equal(quality.canPlan, false);
  assert.match(quality.blockers.join(" "), /liquidity/i);
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

  assert.ok(quality.historyDays > 1 && quality.historyDays < 2);
  assert.equal(quality.confidence, "Moderate data confidence");
  assert.ok(quality.warnings.some(warning => /less than seven days/i.test(warning)));
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

test("pool age uses the dataAsOf reference so identical inputs give identical scores", () => {
  const candles = makeCandles();
  const dataAsOf = new Date(candles.at(-1).time * 1000).toISOString();
  const market = {
    priceUsd: candles.at(-1).close,
    liquidityUsd: 750_000,
    volume24h: 400_000,
    // 1.9 days before the pinned evidence capture, but years before "now".
    poolCreatedAt: new Date((candles.at(-1).time * 1000) - (1.9 * 86_400_000)).toISOString(),
  };
  const first = assessMarketData(market, candles, { expectedIntervalSeconds: 14_400, dataAsOf });
  const second = assessMarketData(market, candles, { expectedIntervalSeconds: 14_400, dataAsOf });

  assert.ok(first.ageDays > 1.8 && first.ageDays < 2);
  assert.ok(first.warnings.some(warning => /less than two days old/i.test(warning)));
  assert.equal(first.score, second.score);
  assert.deepEqual(first.warnings, second.warnings);

  const mature = assessMarketData({
    ...market,
    poolCreatedAt: new Date((candles.at(-1).time * 1000) - (30 * 86_400_000)).toISOString(),
  }, candles, { expectedIntervalSeconds: 14_400, dataAsOf });
  assert.ok(mature.ageDays > 29);
  assert.ok(!mature.warnings.some(warning => /less than two days old/i.test(warning)));
  assert.ok(mature.score > first.score);
});

test("valuation scales project prices by the current valuation-to-price ratio", () => {
  const currentPrice = 1.25;
  const marketCapMultiplier = 500_000;
  const fdvMultiplier = 1_200_000;
  const scales = createValuationScales({
    marketCapUsd: currentPrice * marketCapMultiplier,
    fdvUsd: currentPrice * fdvMultiplier,
  }, currentPrice);

  assert.equal(scales.marketCap.available, true);
  assert.equal(scales.fdv.available, true);
  assert.equal(scales.assumesConstantSupply, true);

  const projected = projectValuationAtPrice(currentPrice / 2, scales);
  assertNearlyEqual(projected.marketCapUsd, (currentPrice * marketCapMultiplier) / 2);
  assertNearlyEqual(projected.fdvUsd, (currentPrice * fdvMultiplier) / 2);
});

test("never fabricates market cap or FDV projections when provider values are unavailable", () => {
  const scales = createValuationScales({ marketCapUsd: null, fdvUsd: 0 }, 1.25);

  assert.equal(scales.marketCap.available, false);
  assert.equal(scales.fdv.available, false);

  const projected = projectValuationAtPrice(1, scales);
  assert.equal(projected.priceUsd, 1);
  assert.equal(projected.marketCapUsd, null);
  assert.equal(projected.fdvUsd, null);
});

test("formatters keep unavailable provider values distinct from zero", () => {
  assert.equal(formatUsd(null), "—");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatTokenAmount(null), "—");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatPercent(0), "0.00%");
  assert.equal(formatPrice(1e-19), "$1.0000e-19");
});

test("formatUsd always renders whole cents for money at or above one dollar", () => {
  assert.equal(formatUsd(14.5), "$14.50");
  assert.equal(formatUsd(46.3), "$46.30");
  assert.equal(formatUsd(1_234.5), "$1,234.50");
  assert.equal(formatUsd(20), "$20.00");
  assert.equal(formatUsd(14.49), "$14.49");
  assert.equal(formatUsd(0.5), "$0.50");
  assert.equal(formatUsd(-14.5), "-$14.50");
});

test("formatPrice never leaves a dangling decimal point just below one dollar", () => {
  assert.equal(formatPrice(0.9999995), "$1");
  assert.equal(formatPrice(0.99999951), "$1");
  assert.equal(formatPrice(1.00000001), "$1");
  assert.equal(formatPrice(0.9999994), "$0.999999");
  assert.equal(formatPrice(0.5), "$0.5");
});
