// Top-level simulation orchestrator.
//
// runScenarioSimulation() is the successor of v1's runSim(). Since MODEL
// v3.0.0 (approved MCR-001) money is computed in whole cents, so outputs
// match v1's float math to within money quantization (≤1 cent per purchase);
// the equivalence test against a copy of the v1 implementation asserts that
// tolerance, and behaviorLock.test.js pins the exact v3 outputs.

import { MODEL_VERSION } from "../version.js";
import { buildSchedule, executeDca, lumpSumOutcome, hybridOutcome, requiredPriceForRoi, roiPct as roi, round2 } from "./dca.js";
import { scaledWindowEntryPrices, rollingWindows, backtest } from "./historical.js";
import { buildScenarios, realityCheck, waitForDipComparison } from "./scenarios.js";
import { maxDrawdown, logReturns } from "./statistics.js";

const ROI_LADDER = [0, 10, 25, 50, 100];

export function runScenarioSimulation({
  capital, freqId, months, targetPct, prices, livePrice,
  feePct = 0, feeFixed = 0, slippagePct = 0, hybridPct = 30,
  now = Date.now(),
}) {
  const vals = prices.map(p => p[1]);
  const schedule = buildSchedule({ capital, freqId, months });
  const { entries, amtPer, freq } = schedule;

  // Live price anchors everything (v1-preserved).
  const anchorPrice = livePrice || vals[vals.length - 1];

  const window = scaledWindowEntryPrices({ vals, months, entries, anchorPrice });
  const exec = executeDca({ amountsCents: schedule.amountsCents, entryPrices: window.entryPrices, feePct, feeFixed, slippagePct });

  const refPrice = anchorPrice;
  const totalInvested = exec.totalInvested;
  const units = exec.units;

  const targetPrice = refPrice * (1 + targetPct / 100);
  // money outputs cent-quantized (MODEL v3.0.0, MCR-001)
  const targetVal = round2(units * targetPrice);
  const currentVal = round2(units * refPrice);

  // Reality check + scenarios (derived from real, unscaled history).
  const reality = realityCheck({ vals, windowDays: window.windowDays, targetPct });
  const scenarios = buildScenarios({
    units, totalInvested, refPrice, targetPct,
    reality: reality.ok ? reality : null,
  });

  // Per-buy series for chart/timeline. Buy i happens i × freq.days days from now.
  const series = exec.buys.map(b => ({
    ...b,
    dayOffset: schedule.dayOffsets[b.i],
    date: now + schedule.dayOffsets[b.i] * 86400000,
    value: b.cumUnits * b.price,
  }));

  // Simulated drawdown: portfolio value at each purchase point along the path.
  const dd = maxDrawdown(series.map(s => s.value));

  // Strategy comparison — same capital, evaluated at the same endpoint prices.
  // Lump sum enters at the live price today; hybrid = X% today + rest DCA.
  const lump = lumpSumOutcome({ capital, startPrice: refPrice, feePct, feeFixed, slippagePct });
  const hybrid = hybridOutcome({ capital, initialPct: hybridPct, startPrice: refPrice, entryPrices: window.entryPrices, feePct, feeFixed, slippagePct });
  const comparison = [
    { id: "dca", name: "100% DCA", units, avgEntry: exec.avgEntry, totalFees: exec.totalFees },
    { id: "hybrid", name: `Hybrid ${hybridPct}/${100 - hybridPct}`, units: hybrid.units, avgEntry: hybrid.avgEntry, totalFees: hybrid.totalFees },
    { id: "lump", name: "100% Lump sum", units: lump.units, avgEntry: lump.avgEntry, totalFees: lump.totalFees },
  ].map(s => ({
    ...s,
    valueAtTarget: round2(s.units * targetPrice),
    roiAtTarget: roi(round2(s.units * targetPrice), capital),
    valueAtLive: round2(s.units * refPrice),
    roiAtLive: roi(round2(s.units * refPrice), capital),
  }));

  // Robustness: same plan over every completed historical window of this length.
  const rolling = rollingWindows({ vals, windowDays: window.windowDays, entries, amountsCents: schedule.amountsCents, feePct, feeFixed, slippagePct });

  // Break-even ladder.
  const breakEven = ROI_LADDER.map(r => ({
    roiPct: r,
    price: requiredPriceForRoi(totalInvested, units, r),
  }));

  const waitForDip = waitForDipComparison({ entryPrices: window.entryPrices, amtPer, refPrice, targetPct });

  return {
    modelVersion: MODEL_VERSION,
    mode: "scenario",
    config: { capital, freqId, months, targetPct, feePct, feeFixed, slippagePct, hybridPct },
    // ── v1-compatible core ──
    entries, amtPer, freq,
    avgEntry: exec.avgEntry,
    totalTokens: units, units,
    refPrice, targetPrice, targetVal,
    targetProfit: targetVal - totalInvested,
    targetROI: roi(targetVal, totalInvested),
    currentVal, currentROI: roi(currentVal, totalInvested),
    // v1 defined "flat" as capital back (approximation kept for compatibility);
    // the v2 scenario grid computes flat precisely as units × unchanged price.
    flatVal: totalInvested,
    downVal: round2(units * refPrice * 0.8), downLoss: round2(units * refPrice * 0.8) - totalInvested,
    down50Val: round2(units * refPrice * 0.5), down50Loss: round2(units * refPrice * 0.5) - totalInvested,
    simLow: window.simLow, simHigh: window.simHigh,
    volPct: window.volPct, windowDays: window.windowDays,
    // ── v2 additions ──
    totalInvested, totalFees: exec.totalFees, netInvested: exec.netInvested,
    buys: exec.buys, series,
    scenarios, reality, rolling, comparison, breakEven, waitForDip,
    drawdown: dd,
    dailyLogReturns: logReturns(vals.slice(-window.windowDays)),
  };
}

// Historical backtest mode — real prices, real dates. Materially different
// from scenario mode and labeled as such in the UI.
export function runBacktest({ capital, freqId, months, startOffsetDays, prices, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const schedule = buildSchedule({ capital, freqId, months });
  const bt = backtest({
    prices, startOffsetDays, months,
    entries: schedule.entries, amountsCents: schedule.amountsCents,
    feePct, feeFixed, slippagePct,
  });
  if (!bt.ok) return bt;
  const series = bt.buys.map((b, i) => ({ ...b, date: bt.buyDates[i], value: b.cumUnits * b.price }));
  return {
    ...bt,
    modelVersion: MODEL_VERSION,
    freq: schedule.freq,
    series,
    drawdown: maxDrawdown(series.map(s => s.value)),
    lump: (() => {
      const l = lumpSumOutcome({ capital, startPrice: bt.vals[0], feePct, feeFixed, slippagePct });
      const endValue = round2(l.units * bt.endPrice);
      return { ...l, endValue, roiPct: roi(endValue, capital) };
    })(),
  };
}
