// Historical-data transformations.
//
// Three distinct uses of history, kept strictly separate (see Methodology):
//  1. SCENARIO SIMULATION (default, v1-preserved): the historical window whose
//     length matches the plan duration is scaled so its average sits on the
//     live price. Real volatility shape, anchored to now. NOT a forecast.
//  2. HISTORICAL BACKTEST: actual prices from a completed past period.
//     No scaling, no anchoring.
//  3. ROLLING WINDOWS: the same plan executed over every available completed
//     historical window of the plan's length — best / median / worst outcomes.

import { avg, std, median } from "./statistics.js";
import { executeDca } from "./dca.js";

// ── 1. v1-preserved scenario entry-price construction ────────────────────────
// Exact port of the v1 runSim price logic. Do not alter without a model
// version bump.
export function scaledWindowEntryPrices({ vals, months, entries, anchorPrice }) {
  const windowDays = months * 30;
  const windowVals = vals.slice(-windowDays);
  const windowPrices = windowVals.length >= 4 ? windowVals : vals;

  const windowAvg = avg(windowPrices);
  const windowStd = std(windowPrices);
  const volPct = (windowStd / windowAvg) * 100;

  const scaleFactor = anchorPrice / (windowAvg || anchorPrice);
  const step = Math.max(1, Math.floor(windowPrices.length / entries));
  const entryPrices = Array.from({ length: entries }, (_, i) => {
    const idx = Math.min(i * step, windowPrices.length - 1);
    const scaled = windowPrices[idx] * scaleFactor;
    return Math.max(scaled, anchorPrice * 0.01);
  });

  return {
    entryPrices,
    windowDays,
    windowLen: windowPrices.length,
    volPct,
    simLow: Math.min(...entryPrices),
    simHigh: Math.max(...entryPrices),
    scaleFactor,
  };
}

// ── Shared sampler for real (unscaled) windows ───────────────────────────────
// Same even-step sampling rule as v1, applied to actual prices.
export function sampleEntryPrices(windowVals, entries) {
  const step = Math.max(1, Math.floor(windowVals.length / entries));
  return Array.from({ length: entries }, (_, i) =>
    windowVals[Math.min(i * step, windowVals.length - 1)]);
}

// ── 2. Historical backtest — actual prices, actual dates ─────────────────────
// prices: CoinGecko [[timestampMs, price], ...] daily points.
// startOffsetDays: how many days ago the plan would have started.
export function backtest({ prices, startOffsetDays, months, entries, amtPer, amountsCents, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const windowDays = months * 30;
  const startIdx = prices.length - startOffsetDays;
  const endIdx = startIdx + windowDays;
  if (startIdx < 0 || endIdx > prices.length) {
    return { ok: false, reason: "Not enough historical data for that period." };
  }
  const slice = prices.slice(startIdx, endIdx);
  if (slice.length < 4) return { ok: false, reason: "Not enough historical data for that period." };

  const vals = slice.map(p => p[1]);
  const entryPrices = sampleEntryPrices(vals, entries);
  const step = Math.max(1, Math.floor(vals.length / entries));
  const buyDates = Array.from({ length: entries }, (_, i) =>
    slice[Math.min(i * step, slice.length - 1)][0]);

  const exec = executeDca({ amtPer, amountsCents, entryPrices, feePct, feeFixed, slippagePct });
  const endPrice = vals[vals.length - 1];
  const endValue = Math.round(exec.units * endPrice * 100) / 100;
  return {
    ok: true,
    mode: "backtest",
    startDate: slice[0][0],
    endDate: slice[slice.length - 1][0],
    endPrice,
    endValue,
    roiPct: ((endValue - exec.totalInvested) / exec.totalInvested) * 100,
    buyDates,
    vals,
    slice,
    ...exec,
  };
}

// ── 3. Rolling windows — robustness across all completed periods ─────────────
// Runs the plan over every windowDays-long slice of real prices (stepping
// stepDays), evaluated at each window's own final price. Historical outcomes,
// NOT probabilities.
export function rollingWindows({ vals, windowDays, entries, amtPer, amountsCents, stepDays = 7, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const results = [];
  for (let start = 0; start + windowDays <= vals.length; start += stepDays) {
    const windowVals = vals.slice(start, start + windowDays);
    const entryPrices = sampleEntryPrices(windowVals, entries);
    const exec = executeDca({ amtPer, amountsCents, entryPrices, feePct, feeFixed, slippagePct });
    const endPrice = windowVals[windowVals.length - 1];
    const endValue = exec.units * endPrice;
    results.push({
      startIdx: start,
      roiPct: exec.totalInvested > 0 ? ((endValue - exec.totalInvested) / exec.totalInvested) * 100 : 0,
      endValue,
    });
  }
  if (results.length < 3) return { ok: false, count: results.length };
  const rois = results.map(r => r.roiPct);
  return {
    ok: true,
    count: results.length,
    best: Math.max(...rois),
    median: median(rois),
    worst: Math.min(...rois),
    windows: results,
  };
}

// % moves over every completed windowDays-long period (for Reality Check and
// derived scenarios). Historical observations, not predictions.
export function windowMoves(vals, windowDays, stepDays = 1) {
  const moves = [];
  for (let start = 0; start + windowDays <= vals.length; start += stepDays) {
    const a = vals[start], b = vals[start + windowDays - 1];
    if (a > 0) moves.push(((b - a) / a) * 100);
  }
  return moves;
}
