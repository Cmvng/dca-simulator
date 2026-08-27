// Tests for scoring (v1 oracle), reality check, rolling windows, scenarios,
// Monte Carlo determinism, data validation, and statistics helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMarket, marketConditions } from "./scoring.js";
import { realityCheck, buildScenarios, waitForDipComparison } from "./scenarios.js";
import { rollingWindows, windowMoves, scaledWindowEntryPrices } from "./historical.js";
import { runMonteCarlo, mulberry32 } from "./monteCarlo.js";
import { validateHistory } from "./validate.js";
import { percentile, maxDrawdown, logReturns, median } from "./statistics.js";

// ── v1 analyzeMarket oracle (copied unchanged from original App.jsx) ─────────
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const std = a => { const m = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
function v1Analyze(prices) {
  const vals = prices.map(p => p[1]);
  const ma30 = avg(vals.slice(-30)), ma90 = avg(vals.slice(-90));
  const vol30 = std(vals.slice(-30)), cur = vals[vals.length - 1], oldest = vals[0];
  const volPct = (vol30 / cur) * 100;
  const momentum = ((cur - oldest) / oldest) * 100;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const nearLow = (cur - mn) / (mx - mn || 1);
  let trend = "Ranging";
  if (cur > ma30 * 1.02 && ma30 > ma90) trend = "Uptrend";
  else if (cur < ma30 * 0.98 && ma30 < ma90) trend = "Downtrend";
  const score =
    (trend === "Uptrend" ? 2 : trend === "Downtrend" ? -2 : 0) +
    (momentum > 20 ? 2 : momentum > 0 ? 1 : momentum > -20 ? -1 : -2) +
    (nearLow < 0.35 ? 1 : nearLow > 0.75 ? -1 : 0);
  return { ma30, ma90, volPct, trend, momentum, nearLow, score };
}

function makePrices(seed, days = 365, start = 100) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const out = []; let price = start;
  const t0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < days; i++) { price *= 1 + (rnd() - 0.495) * 0.08; out.push([t0 + i * 86400000, price]); }
  return out;
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9), `${msg}: ${a} vs ${b}`);

test("analyzeMarket matches v1 on 120-day input", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const p120 = makePrices(seed, 120);
    const oracle = v1Analyze(p120);
    const ours = analyzeMarket(p120);
    close(ours.ma30, oracle.ma30, "ma30");
    close(ours.momentum, oracle.momentum, "momentum");
    assert.equal(ours.trend, oracle.trend, "trend");
    assert.equal(ours.score, oracle.score, "score");
  }
});

test("marketConditions exposes components and 1–3 reasons", () => {
  const a = analyzeMarket(makePrices(8, 120));
  const mc = marketConditions(a, null);
  assert.ok(mc.components.length >= 4);
  assert.ok(["FAVOURABLE", "OK", "CAUTION", "UNFAVOURABLE"].includes(mc.overall));
  assert.ok(mc.reasons.length <= 3);
});

test("reality check thresholds are deterministic and ordered", () => {
  const vals = makePrices(42, 365).map(p => p[1]);
  const windowDays = 90;
  const rcSmall = realityCheck({ vals, windowDays, targetPct: 1 });
  assert.ok(rcSmall.ok);
  assert.equal(rcSmall.label, "Relatively modest");
  const rcHuge = realityCheck({ vals, windowDays, targetPct: 100000 });
  assert.equal(rcHuge.label, "Extreme");
  // Same inputs → same outputs.
  const again = realityCheck({ vals, windowDays, targetPct: 1 });
  assert.deepEqual(again, rcSmall);
  // typical is the median absolute move.
  const moves = windowMoves(vals, windowDays);
  close(rcSmall.typicalPct, median(moves.map(Math.abs)), "typical = median |move|");
});

test("reality check refuses insufficient data", () => {
  const rc = realityCheck({ vals: [1, 2, 3], windowDays: 90, targetPct: 50 });
  assert.equal(rc.ok, false);
});

test("scenarios: every scenario reports value, P/L, ROI from the same units", () => {
  const scen = buildScenarios({ units: 10, totalInvested: 1000, refPrice: 120, targetPct: 50, reality: null });
  for (const s of scen) {
    close(s.value, 10 * s.price, `${s.id} value = units × price`);
    close(s.profit, s.value - 1000, `${s.id} profit`);
    assert.ok(Number.isFinite(s.roiPct));
  }
  const flat = scen.find(s => s.id === "flat");
  close(flat.value, 1200, "flat = units × live price");
  assert.ok(scen.find(s => s.id === "severe").movePct === -50);
});

test("rolling windows: count and best ≥ median ≥ worst", () => {
  const vals = makePrices(3, 365).map(p => p[1]);
  const rw = rollingWindows({ vals, windowDays: 90, entries: 13, amtPer: 769.23 });
  assert.ok(rw.ok);
  assert.equal(rw.count, Math.floor((365 - 90) / 7) + 1);
  assert.ok(rw.best >= rw.median && rw.median >= rw.worst);
});

test("rolling windows refuses when too little data", () => {
  const rw = rollingWindows({ vals: makePrices(3, 95).map(p => p[1]), windowDays: 90, entries: 13, amtPer: 100, stepDays: 7 });
  assert.equal(rw.ok, false);
});

test("waitForDip: deeper dip → lower avg entry → higher ROI at same target", () => {
  const { base, dips } = waitForDipComparison({ entryPrices: [100, 95, 105, 98], amtPer: 250, refPrice: 100, targetPct: 50 });
  let prevRoi = base.roiPct;
  for (const d of dips) {
    assert.ok(d.avgEntry < base.avgEntry);
    assert.ok(d.roiPct > prevRoi);
    prevRoi = d.roiPct;
  }
});

test("monte carlo: deterministic under same seed, ordered percentiles, no NaN", () => {
  const vals = makePrices(6, 365).map(p => p[1]);
  const rets = logReturns(vals.slice(-90));
  const cfg = { dailyLogReturns: rets, days: 90, startPrice: 100, amtPer: 100, entries: 13, targetPct: 50, paths: 2000, seed: 99 };
  const a = runMonteCarlo(cfg);
  const b = runMonteCarlo(cfg);
  assert.ok(a.ok);
  assert.deepEqual(a, b, "same seed → same result");
  assert.ok(a.p10 <= a.p25 && a.p25 <= a.p50 && a.p50 <= a.p75 && a.p75 <= a.p90, "percentiles ordered");
  for (const k of ["p10", "p50", "p90", "probAboveTargetPct"]) assert.ok(Number.isFinite(a[k]), `${k} finite`);
  assert.ok(a.probAboveTargetPct >= 0 && a.probAboveTargetPct <= 100);
  const c = runMonteCarlo({ ...cfg, seed: 100 });
  assert.notDeepEqual(a.p50, c.p50, "different seed → different draw");
});

test("monte carlo refuses thin return history", () => {
  assert.equal(runMonteCarlo({ dailyLogReturns: [0.01], days: 90, startPrice: 100, amtPer: 100, entries: 13, targetPct: 50 }).ok, false);
});

test("mulberry32 is stable", () => {
  const r = mulberry32(1);
  const seq = [r(), r(), r()];
  const r2 = mulberry32(1);
  assert.deepEqual([r2(), r2(), r2()], seq);
});

test("validateHistory: rejects garbage, cleans fixable issues, flags jumps", () => {
  assert.equal(validateHistory(null).ok, false);
  assert.equal(validateHistory([]).ok, false);
  assert.equal(validateHistory([[1, 1], [2, 2]]).ok, false, "too few points");

  const good = makePrices(1, 60);
  const v = validateHistory(good);
  assert.ok(v.ok);
  assert.equal(v.issues.length, 0);
  assert.equal(v.cleaned.length, 60);

  const messy = [...good];
  messy[5] = [messy[5][0], -4];              // negative price
  messy[10] = [messy[9][0], messy[10][1]];   // duplicate timestamp
  messy.push([messy[3][0] - 1, 50]);          // out of order
  const vm = validateHistory(messy);
  assert.ok(vm.ok);
  assert.ok(vm.issues.length >= 3);
  assert.ok(vm.cleaned.every(p => p[1] > 0));
  for (let i = 1; i < vm.cleaned.length; i++) assert.ok(vm.cleaned[i][0] > vm.cleaned[i - 1][0], "strictly ascending");

  const jumpy = makePrices(1, 60);
  jumpy[30] = [jumpy[30][0], jumpy[29][1] * 100];
  assert.ok(validateHistory(jumpy).issues.some(i => i.includes("jump")), "implausible jump flagged");
});

test("statistics: percentile interpolation and drawdown", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([7], 0.9), 7);
  const dd = maxDrawdown([100, 120, 80, 90, 130]);
  close(dd.drawdownPct, ((80 - 120) / 120) * 100, "worst drop from 120 to 80");
  assert.equal(dd.peak, 120);
  assert.equal(dd.trough, 80);
  assert.equal(dd.recoveryIdx, 4, "recovered at 130");
  assert.equal(maxDrawdown([1, 2, 3]).drawdownPct, 0, "monotone series has zero drawdown");
});

test("scaledWindowEntryPrices floors entries at 1% of anchor", () => {
  const vals = [1000, 1000, 1000, 0.0001, 1000, 1000];
  const w = scaledWindowEntryPrices({ vals, months: 1, entries: 6, anchorPrice: 100 });
  assert.ok(w.entryPrices.every(p => p >= 1), "no entry below anchor×0.01");
});
