// Scenario construction for the default (scenario-simulation) mode.
//
// All scenario end-values are computed from the LIVE price (v1-preserved
// framing: "if the asset moves X% from now"). Fixed assumptions (-20%, -50%,
// flat) are labeled as assumptions; derived scenarios (historical best/worst
// window moves) are labeled with their source.

import { median } from "./statistics.js";
import { windowMoves } from "./historical.js";

// Deterministic Reality Check thresholds — documented in Methodology:
//   target ≤ typical move            → "Relatively modest"
//   target ≤ 2 × typical move        → "Moderate"
//   target ≤ largest observed gain   → "Ambitious"
//   otherwise                        → "Extreme"
// where "typical move" = median ABSOLUTE move over all completed windows of
// the plan's length, and "largest observed gain" = best such move.
export function realityCheck({ vals, windowDays, targetPct }) {
  const moves = windowMoves(vals, windowDays);
  if (moves.length < 3) return { ok: false, count: moves.length };
  const typicalPct = median(moves.map(Math.abs));
  const largestGainPct = Math.max(...moves);
  const largestLossPct = Math.min(...moves);
  let label, tone;
  if (targetPct <= typicalPct) { label = "Relatively modest"; tone = "good"; }
  else if (targetPct <= 2 * typicalPct) { label = "Moderate"; tone = "ok"; }
  else if (targetPct <= largestGainPct) { label = "Ambitious"; tone = "warn"; }
  else { label = "Extreme"; tone = "bad"; }
  return { ok: true, count: moves.length, typicalPct, largestGainPct, largestLossPct, label, tone, targetPct };
}

// Ordered scenario set. `reality` may be null (falls back to fixed set only).
export function buildScenarios({ units, totalInvested, refPrice, targetPct, reality }) {
  const mk = (id, name, movePct, basis) => {
    const price = refPrice * (1 + movePct / 100);
    const value = Math.round(units * price * 100) / 100; // cents (MODEL v3)
    return {
      id, name, movePct, basis, price, value,
      profit: value - totalInvested,
      roiPct: totalInvested > 0 ? ((value - totalInvested) / totalInvested) * 100 : 0,
    };
  };
  const list = [];
  if (reality?.ok) {
    list.push(mk("histWorst", "Historical worst-like", reality.largestLossPct,
      `Worst observed move over any ${reality.count} sampled windows of this length`));
  }
  list.push(mk("severe", "Severe downside", -50, "Fixed assumption (-50%)"));
  list.push(mk("moderate", "Moderate downside", -20, "Fixed assumption (-20%)"));
  list.push(mk("flat", "Flat", 0, "Price unchanged"));
  list.push(mk("target", "Your target scenario", targetPct, "User-defined target"));
  if (reality?.ok && reality.largestGainPct > targetPct) {
    list.push(mk("histBest", "Strong upside (historical best-like)", reality.largestGainPct,
      "Best observed move over windows of this length"));
  }
  return list;
}

// "What if I wait for a dip?" — scenario experiment ONLY. Assumes the whole
// plan's entry prices shift down by dipPct before the same relative path
// unfolds, then evaluates at the same target price. Does not imply the dip
// will happen or can be timed.
export function waitForDipComparison({ entryPrices, amtPer, refPrice, targetPct, dips = [-10, -20, -30] }) {
  const targetPrice = refPrice * (1 + targetPct / 100);
  const base = evalDip(0);
  return { base, dips: dips.map(evalDip) };

  function evalDip(dipPct) {
    const f = 1 + dipPct / 100;
    let units = 0, invested = 0;
    for (const p of entryPrices) { units += amtPer / (p * f); invested += amtPer; }
    const value = units * targetPrice;
    return {
      dipPct,
      avgEntry: invested / units,
      units,
      valueAtTarget: value,
      roiPct: ((value - invested) / invested) * 100,
    };
  }
}
