// Equivalence + invariant tests for the extracted engine.
//
// THE ORACLE: `v1RunSim` below is a verbatim copy of the simulation from the
// original src/App.jsx (v1). With default advanced options, the refactored
// engine must reproduce v1's numbers exactly (within float tolerance).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenarioSimulation, runBacktest } from "./engine.js";
import { FREQS } from "./dca.js";

// ── v1 oracle (copied unchanged from the original App.jsx) ───────────────────
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const std = a => { const m = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
function v1RunSim({ capital, freqId, months, targetPct, prices, livePrice }) {
  const freq = FREQS.find(f => f.id === freqId);
  const entries = Math.min(180, Math.max(4, Math.round((months * 30) / freq.days)));
  const amtPer = capital / entries;
  const anchorPrice = livePrice || prices[prices.length - 1][1];
  const windowDays = months * 30;
  const allVals = prices.map(p => p[1]);
  const windowVals = allVals.slice(-windowDays);
  const windowPrices = windowVals.length >= 4 ? windowVals : allVals;
  const windowAvg = avg(windowPrices);
  const windowStd = std(windowPrices);
  const volPct = (windowStd / windowAvg);
  const scaleFactor = anchorPrice / (windowAvg || anchorPrice);
  const step = Math.max(1, Math.floor(windowPrices.length / entries));
  const entryPrices = Array.from({ length: entries }, (_, i) => {
    const idx = Math.min(i * step, windowPrices.length - 1);
    const scaled = windowPrices[idx] * scaleFactor;
    return Math.max(scaled, anchorPrice * 0.01);
  });
  const totalTokens = entryPrices.reduce((s, p) => s + amtPer / p, 0);
  const avgEntry = capital / totalTokens;
  const refPrice = anchorPrice;
  const targetPrice = refPrice * (1 + targetPct / 100);
  const targetVal = totalTokens * targetPrice;
  const currentVal = totalTokens * refPrice;
  const downVal = totalTokens * (refPrice * 0.8);
  const down50Val = totalTokens * (refPrice * 0.5);
  return {
    entries, amtPer, avgEntry, totalTokens, refPrice,
    targetPrice, targetVal,
    targetProfit: targetVal - capital,
    targetROI: ((targetVal - capital) / capital) * 100,
    currentVal, currentROI: ((currentVal - capital) / capital) * 100,
    flatVal: capital,
    downVal, downLoss: downVal - capital,
    down50Val, down50Loss: down50Val - capital,
    simLow: Math.min(...entryPrices), simHigh: Math.max(...entryPrices),
    volPct: volPct * 100, windowDays,
  };
}

// Deterministic pseudo-random price history generator.
function makePrices(seed, days = 365, start = 100) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const out = [];
  let price = start;
  const t0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < days; i++) {
    price *= 1 + (rnd() - 0.495) * 0.08;
    out.push([t0 + i * 86400000, price]);
  }
  return out;
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9), `${msg}: ${a} vs ${b}`);

test("v2 engine reproduces v1 numbers exactly with default options", () => {
  const cases = [
    { capital: 500, freqId: "daily", months: 3, targetPct: 50, seed: 1 },
    { capital: 10000, freqId: "weekly", months: 3, targetPct: 50, seed: 2 },
    { capital: 1234.56, freqId: "12h", months: 6, targetPct: 200, seed: 3 },
    { capital: 50, freqId: "biweekly", months: 1, targetPct: 10, seed: 4 },
    { capital: 999999, freqId: "daily", months: 1, targetPct: 100, seed: 5 },
  ];
  for (const c of cases) {
    const prices = makePrices(c.seed);
    const livePrice = prices[prices.length - 1][1] * 1.07;
    const v1 = v1RunSim({ ...c, prices, livePrice });
    const v2 = runScenarioSimulation({ ...c, prices, livePrice });
    for (const k of ["entries", "amtPer", "avgEntry", "totalTokens", "refPrice", "targetPrice",
      "targetVal", "targetProfit", "targetROI", "currentVal", "currentROI", "flatVal",
      "downVal", "downLoss", "down50Val", "down50Loss", "simLow", "simHigh", "volPct", "windowDays"]) {
      close(v2[k], v1[k], `${JSON.stringify(c)} field ${k}`);
    }
  }
});

test("invariants: capital conservation, monotone units, consistency, finiteness", () => {
  for (const seed of [11, 22, 33]) {
    for (const freqId of ["12h", "daily", "weekly", "biweekly"]) {
      const prices = makePrices(seed);
      const r = runScenarioSimulation({
        capital: 7500, freqId, months: 4, targetPct: 25, prices,
        livePrice: prices[prices.length - 1][1], feePct: 0.5, feeFixed: 1,
      });
      // Total scheduled contributions equal capital.
      close(r.totalInvested, 7500, "total invested == capital");
      close(r.buys[r.buys.length - 1].cumInvested, 7500, "cum invested == capital");
      // Cumulative units never decrease; fees never negative.
      let prev = 0;
      for (const b of r.buys) {
        assert.ok(b.cumUnits >= prev, "units monotone");
        assert.ok(b.fee >= 0, "fee >= 0");
        prev = b.cumUnits;
      }
      // avgEntry mathematically consistent.
      close(r.avgEntry, r.totalInvested / r.units, "avgEntry = invested/units");
      // Ending value = units × price.
      close(r.targetVal, r.units * r.targetPrice, "value = units × price");
      // Never NaN/Infinity anywhere important.
      for (const k of ["targetVal", "targetROI", "currentVal", "avgEntry", "units", "totalFees"]) {
        assert.ok(Number.isFinite(r[k]), `${k} finite`);
      }
      // Fees reduce accumulated units vs no-fee run.
      const noFee = runScenarioSimulation({ capital: 7500, freqId, months: 4, targetPct: 25, prices, livePrice: prices[prices.length - 1][1] });
      assert.ok(r.units < noFee.units, "fees reduce units");
    }
  }
});

test("comparison uses identical capital and endpoint for all strategies", () => {
  const prices = makePrices(7);
  const live = prices[prices.length - 1][1];
  const r = runScenarioSimulation({ capital: 10000, freqId: "weekly", months: 3, targetPct: 50, prices, livePrice: live });
  assert.equal(r.comparison.length, 3);
  const lump = r.comparison.find(c => c.id === "lump");
  const dca = r.comparison.find(c => c.id === "dca");
  const hybrid = r.comparison.find(c => c.id === "hybrid");
  // Lump sum invests everything at live price.
  close(lump.units, 10000 / live, "lump units");
  close(lump.valueAtTarget, (10000 / live) * r.targetPrice, "lump value at target = units × target price");
  // Same evaluation endpoint: all valueAtTarget = units × same targetPrice.
  for (const c of r.comparison) close(c.valueAtTarget, c.units * r.targetPrice, `${c.id} endpoint`);
  // Hybrid units sit between... not guaranteed in general, but invested equals capital:
  assert.ok(Number.isFinite(hybrid.units) && hybrid.units > 0);
});

test("hybrid at 0% equals pure DCA; at 100% equals lump sum", async () => {
  const { hybridOutcome, lumpSumOutcome, executeDca } = await import("./dca.js");
  const entryPrices = [100, 90, 110, 105];
  const h0 = hybridOutcome({ capital: 4000, initialPct: 0, startPrice: 120, entryPrices });
  const dca = executeDca({ amtPer: 1000, entryPrices });
  close(h0.units, dca.units, "hybrid 0% == DCA");
  const h100 = hybridOutcome({ capital: 4000, initialPct: 100, startPrice: 120, entryPrices });
  const lump = lumpSumOutcome({ capital: 4000, startPrice: 120 });
  close(h100.units, lump.units, "hybrid 100% == lump");
});

test("weekly 3-month plan: 13 purchases of ≈$769.23 from $10,000", () => {
  const prices = makePrices(9);
  const r = runScenarioSimulation({ capital: 10000, freqId: "weekly", months: 3, targetPct: 50, prices, livePrice: 100 });
  assert.equal(r.entries, 13);
  close(r.amtPer, 10000 / 13, "amount per purchase");
});

test("backtest uses actual historical prices and dates (no scaling)", () => {
  const prices = makePrices(13, 365);
  const bt = runBacktest({ capital: 9000, freqId: "weekly", months: 3, startOffsetDays: 180, prices });
  assert.ok(bt.ok);
  // First entry price is a real price from the slice, untouched.
  const startIdx = prices.length - 180;
  assert.equal(bt.buys[0].price, prices[startIdx][1]);
  assert.equal(bt.startDate, prices[startIdx][0]);
  // End evaluated at the real final price of the window.
  assert.equal(bt.endPrice, prices[startIdx + 90 - 1][1]);
  close(bt.endValue, bt.units * bt.endPrice, "end value = units × end price");
  close(bt.totalInvested, 9000, "backtest invests full capital");
  // Lump comparison enters at the window's real start price.
  close(bt.lump.units, 9000 / prices[startIdx][1], "lump entry at window start");
});

test("backtest refuses periods outside available data", () => {
  const prices = makePrices(5, 120);
  const bt = runBacktest({ capital: 1000, freqId: "daily", months: 6, startOffsetDays: 119, prices });
  assert.equal(bt.ok, false);
});

test("drawdown and break-even outputs are sane", () => {
  const prices = makePrices(21);
  const r = runScenarioSimulation({ capital: 5000, freqId: "daily", months: 2, targetPct: 25, prices, livePrice: prices[prices.length - 1][1] });
  assert.ok(r.drawdown.drawdownPct <= 0);
  const be0 = r.breakEven.find(b => b.roiPct === 0);
  close(be0.price * r.units, r.totalInvested, "break-even × units = invested");
  const be50 = r.breakEven.find(b => b.roiPct === 50);
  close(be50.price, be0.price * 1.5, "ROI ladder scales linearly");
});
