import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIllustrativePlanTouches,
  ILLUSTRATIVE_TOUCH_NOTICE,
} from "../src/lib/onchain/planTouches.js";

const START = 1_750_000_000;

function candle(index, { open, high, low, close }) {
  return {
    time: START + (index * 3_600),
    open,
    high,
    low,
    close,
    volume: 10_000,
  };
}

function plan(overrides = {}) {
  return {
    mode: "adaptive",
    legs: [
      { id: "B1", midpoint: 92, lower: 90, upper: 95, allocationPct: 15, amountUsd: 150 },
      { id: "B2", midpoint: 82, lower: 80, upper: 85, allocationPct: 20, amountUsd: 200 },
      { id: "B3", midpoint: 72, lower: 70, upper: 75, allocationPct: 25, amountUsd: 250 },
      { id: "B4", midpoint: 62, lower: 60, upper: 65, allocationPct: 40, amountUsd: 400 },
    ],
    targetPrice: 120,
    invalidationPrice: 50,
    ...overrides,
  };
}

test("returns chronological B1-B4 touches followed by a conditional S1 touch", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 108, high: 110, low: 90, close: 93 }),
    candle(2, { open: 93, high: 94, low: 80, close: 83 }),
    candle(3, { open: 83, high: 84, low: 70, close: 73 }),
    candle(4, { open: 73, high: 74, low: 60, close: 63 }),
    candle(5, { open: 63, high: 121, low: 61, close: 118 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });

  assert.deepEqual(events.map(event => event.markerId), ["B1", "B2", "B3", "B4", "S1"]);
  assert.deepEqual(events.map(event => event.kind), [
    "buy-zone-touch",
    "buy-zone-touch",
    "buy-zone-touch",
    "buy-zone-touch",
    "target-touch",
  ]);
  assert.ok(events.every(event => event.illustrative === true));
  assert.ok(events.every(event => event.executed === false));
  assert.ok(events.every(event => event.backtest === false));
  assert.match(ILLUSTRATIVE_TOUCH_NOTICE, /not fills, executed trades, or a backtest/i);
});

test("does not label an upward pass through a buy zone as a dip touch", () => {
  const candles = [
    candle(0, { open: 79, high: 81, low: 78, close: 80 }),
    candle(1, { open: 80, high: 94, low: 79, close: 93 }),
    candle(2, { open: 97, high: 101, low: 96, close: 100 }),
    candle(3, { open: 100, high: 101, low: 90, close: 92 }),
  ];

  const events = buildIllustrativePlanTouches({
    candles,
    plan: plan({ legs: [plan().legs[0]] }),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].markerId, "B1");
  assert.equal(events[0].time, candles[3].time);
});

test("orders multiple same-candle buys B1-B4 and emits each leg only once", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 108, high: 109, low: 60, close: 64 }),
    candle(2, { open: 64, high: 100, low: 60, close: 90 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });

  assert.deepEqual(events.map(event => event.markerId), ["B1", "B2", "B3", "B4"]);
  assert.ok(events.every(event => event.time === candles[1].time));
});

test("never infers S1 from the same candle as the final plan-zone touches", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 110, high: 121, low: 60, close: 118 }),
    candle(2, { open: 118, high: 122, low: 115, close: 121 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });
  const target = events.find(event => event.markerId === "S1");

  assert.ok(target);
  assert.equal(target.time, candles[2].time);
});

test("records an S1 touch before the same interval confirms X1 at its close", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 108, high: 109, low: 60, close: 64 }),
    candle(2, { open: 64, high: 125, low: 40, close: 45 }),
    candle(3, { open: 80, high: 121, low: 79, close: 120 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });
  const terminal = events.filter(event => !event.markerId.startsWith("B"));

  assert.equal(terminal.length, 2);
  assert.deepEqual(terminal.map(event => event.markerId), ["S1", "X1"]);
  assert.deepEqual(terminal.map(event => event.kind), ["target-touch", "reassess-touch"]);
  assert.match(terminal[0].detail, /not an executed sale/i);
  assert.match(terminal[1].detail, /closed below the reassessment level/i);
});

test("returns X1 as reassessment rather than an executed stop", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 108, high: 109, low: 60, close: 64 }),
    candle(2, { open: 64, high: 70, low: 47, close: 49 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });
  const risk = events.find(event => event.markerId === "X1");

  assert.ok(risk);
  assert.equal(risk.kind, "reassess-touch");
  assert.equal(risk.executed, false);
  assert.match(risk.detail, /not an automatic stop or executed sale/i);
});

test("requires an interval close below X1 rather than a wick intersection", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 108, high: 109, low: 60, close: 64 }),
    candle(2, { open: 64, high: 70, low: 49, close: 52 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });
  assert.equal(events.some(event => event.markerId === "X1"), false);
});

test("does not infer a touch when a candle gaps completely past a zone", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 84, high: 85, low: 80, close: 82 }),
  ];

  const events = buildIllustrativePlanTouches({ candles, plan: plan() });

  assert.equal(events.some(event => event.markerId === "B1"), false);
  assert.equal(events.some(event => event.markerId === "B2"), true);
});

test("respects the replay start time and ignores blocked or unusable plans", () => {
  const candles = [
    candle(0, { open: 108, high: 112, low: 105, close: 110 }),
    candle(1, { open: 108, high: 109, low: 90, close: 100 }),
    candle(2, { open: 100, high: 101, low: 90, close: 92 }),
  ];

  const events = buildIllustrativePlanTouches({
    candles,
    plan: plan({ legs: [plan().legs[0]] }),
    startTime: candles[2].time,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].time, candles[2].time);
  assert.deepEqual(buildIllustrativePlanTouches({ candles, plan: plan({ mode: "blocked" }) }), []);
  assert.deepEqual(buildIllustrativePlanTouches({ candles: [candles[0]], plan: plan() }), []);
});
