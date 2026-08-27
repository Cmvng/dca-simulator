// BEHAVIOR LOCK — pins the exact engine outputs for a fixed fixture.
//
// MODEL v3.0.0 constants, recaptured 2026-08-27 under the APPROVED MCR-001
// (integer-minor-unit money: capital split to the cent with the remainder on
// the earliest purchases, fees rounded to the cent and clamped per purchase,
// money outputs cent-quantized; units and prices remain continuous). The
// original v2.0.0 float constants live in git history (commit 040e560).
//
// Every later change must keep this test green. If a change breaks a locked
// number, that is a red gate: fix the change or stop — never update these
// constants without an approved METHODOLOGY CHANGE REQUEST and a
// MODEL_VERSION bump.
//
// Fixture: $10,000 · daily · 3 months · +50% target · deterministic 365-day
// synthetic price series (LCG seed 7) · live price = last close × 1.03.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenarioSimulation } from "./engine.js";

function fixturePrices() {
  let s = 7 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const out = []; let price = 100;
  const t0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 365; i++) { price *= 1 + (rnd() - 0.495) * 0.08; out.push([t0 + i * 86400000, price]); }
  return { prices: out, t0 };
}

const LOCKED = {
  entries: 90,
  amtPer: 111.11111111111111,
  avgEntry: 104.9284336314136,
  units: 95.30305231780558,
  refPrice: 105.26976037386807,
  targetPrice: 157.9046405608021,
  targetVal: 15048.79,
  targetProfit: 5048.790000000001,
  targetROI: 50.48790000000001,
  currentVal: 10032.53,
  currentROI: 0.32530000000000653,
  downVal: 8026.02,
  down50Val: 5016.26,
  simLow: 91.58664647391421,
  simHigh: 116.95345405332326,
  volPct: 5.6678425787066375,
  windowDays: 90,
  totalInvested: 10000, // exact by construction since v3 (integer cents)
};
const LOCKED_ROLLING = { count: 40, best: 26.343983117421537, median: -0.6541438166295848, worst: -12.622648279236673 };
const LOCKED_REALITY = { count: 276, typicalPct: 9.624687911273858, largestGainPct: 38.854437697122975, largestLossPct: -25.161188901962888, label: "Extreme" };

const close = (a, b, msg) =>
  assert.ok(Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-12), `${msg}: got ${a}, locked ${b}`);

test("BEHAVIOR LOCK: $10k daily 3mo +50% fixture reproduces the v3.0.0 numbers exactly", () => {
  const { prices, t0 } = fixturePrices();
  const live = prices[prices.length - 1][1] * 1.03;
  const r = runScenarioSimulation({
    capital: 10000, freqId: "daily", months: 3, targetPct: 50,
    prices, livePrice: live, now: t0 + 365 * 86400000,
  });
  for (const [k, v] of Object.entries(LOCKED)) close(r[k], v, `locked field ${k}`);
  assert.equal(r.totalInvested, 10000, "totalInvested is exactly capital");
  for (const [k, v] of Object.entries(LOCKED_ROLLING)) close(r.rolling[k], v, `locked rolling.${k}`);
  assert.equal(r.reality.label, LOCKED_REALITY.label, "locked reality label");
  for (const k of ["count", "typicalPct", "largestGainPct", "largestLossPct"]) {
    close(r.reality[k], LOCKED_REALITY[k], `locked reality.${k}`);
  }
});
