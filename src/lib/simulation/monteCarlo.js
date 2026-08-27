// Monte Carlo distribution mode (Advanced simulation).
//
// METHODOLOGY (disclosed in the UI):
//   - Take the daily log returns actually observed in the historical window.
//   - Build N price paths by resampling those returns i.i.d. with replacement
//     (a stationary bootstrap-style simplification), starting from the live
//     price.
//   - Execute the exact DCA schedule on each path; evaluate at each path's
//     final price.
//   - Report the DISTRIBUTION of outcomes (percentiles), plus the fraction of
//     paths ending above the target — labeled "Model-based estimate".
//
// LIMITATIONS (also disclosed): assumes future daily returns are drawn from
// the same distribution as the sampled window and are independent day-to-day.
// Real markets have regime changes, autocorrelation and fat tails beyond the
// sample. This is NOT a probability of what will happen — it is what this
// model produces under its stated assumptions.
//
// Reproducibility: fully deterministic given (seed, returns, config).

import { percentile } from "./statistics.js";

// Small deterministic PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runMonteCarlo({
  dailyLogReturns, days, startPrice, amtPer, entries,
  targetPct, paths = 10000, seed = 1337,
  feePct = 0, feeFixed = 0, slippagePct = 0,
}) {
  if (!dailyLogReturns?.length || dailyLogReturns.length < 10) {
    return { ok: false, reason: "Not enough return history for a distribution run." };
  }
  const rand = mulberry32(seed);
  const nRet = dailyLogReturns.length;
  // Buy on day floor(i * days / entries) — same even spacing as the schedule.
  const buyDays = Array.from({ length: entries }, (_, i) => Math.min(days - 1, Math.floor((i * days) / entries)));
  const buySet = new Map(); // day -> number of buys that day (12h freq can double up)
  for (const d of buyDays) buySet.set(d, (buySet.get(d) || 0) + 1);

  const targetValue = (amtPer * entries) * (1 + targetPct / 100); // portfolio value if ROI == target
  const endValues = new Float64Array(paths);
  let above = 0;

  for (let p = 0; p < paths; p++) {
    let price = startPrice;
    let units = 0;
    for (let d = 0; d < days; d++) {
      const nBuys = buySet.get(d) || 0;
      for (let b = 0; b < nBuys; b++) {
        const fee = amtPer * (feePct / 100) + feeFixed;
        const net = Math.max(0, amtPer - fee);
        units += net / (price * (1 + slippagePct / 100));
      }
      price *= Math.exp(dailyLogReturns[(rand() * nRet) | 0]);
    }
    const v = units * price;
    endValues[p] = v;
    if (v >= targetValue) above++;
  }

  const arr = Array.from(endValues);
  const invested = amtPer * entries;
  const pct = q => percentile(arr, q);
  return {
    ok: true,
    seed, paths, invested,
    p10: pct(0.10), p25: pct(0.25), p50: pct(0.50), p75: pct(0.75), p90: pct(0.90),
    probAboveTargetPct: (above / paths) * 100,
    targetValue,
  };
}
