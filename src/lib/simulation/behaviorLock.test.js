// BEHAVIOR LOCK — Stage 1 gate artifact for the INSTRUMENT redesign run.
//
// These exact output values were captured from the engine BEFORE any redesign
// work began (branch feat/cmvng-v2-upgrade, engine untouched since commit
// 8692c68). Every later stage must keep this test green. If a change breaks a
// locked number, that is a red gate: fix the change or stop — never update
// these constants without a METHODOLOGY CHANGE REQUEST and a model version
// bump.
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
  avgEntry: 104.92835816059969,
  units: 95.30312086551818,
  refPrice: 105.26976037386807,
  targetPrice: 157.9046405608021,
  targetVal: 15048.805044592327,
  targetProfit: 5048.8050445923145,
  targetROI: 50.48805044592308,
  currentVal: 10032.536696394885,
  currentROI: 0.32536696394872666,
  downVal: 8026.029357115909,
  down50Val: 5016.268348197443,
  simLow: 91.58664647391421,
  simHigh: 116.95345405332326,
  volPct: 5.6678425787066375,
  windowDays: 90,
  totalInvested: 10000.000000000013,
};
const LOCKED_ROLLING = { count: 40, best: 26.34391959646721, median: -0.6541299897659056, worst: -12.622606515784977 };
const LOCKED_REALITY = { count: 276, typicalPct: 9.624687911273858, largestGainPct: 38.854437697122975, largestLossPct: -25.161188901962888, label: "Extreme" };

const close = (a, b, msg) =>
  assert.ok(Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-12), `${msg}: got ${a}, locked ${b}`);

test("BEHAVIOR LOCK: $10k daily 3mo +50% fixture reproduces pre-redesign numbers exactly", () => {
  const { prices, t0 } = fixturePrices();
  const live = prices[prices.length - 1][1] * 1.03;
  const r = runScenarioSimulation({
    capital: 10000, freqId: "daily", months: 3, targetPct: 50,
    prices, livePrice: live, now: t0 + 365 * 86400000,
  });
  for (const [k, v] of Object.entries(LOCKED)) close(r[k], v, `locked field ${k}`);
  for (const [k, v] of Object.entries(LOCKED_ROLLING)) close(r.rolling[k], v, `locked rolling.${k}`);
  assert.equal(r.reality.label, LOCKED_REALITY.label, "locked reality label");
  for (const k of ["count", "typicalPct", "largestGainPct", "largestLossPct"]) {
    close(r.reality[k], LOCKED_REALITY[k], `locked reality.${k}`);
  }
});
