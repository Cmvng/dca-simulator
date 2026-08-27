// Market analysis + CMVNG Model Score.
//
// analyzeMarket() is an exact port of the v1 heuristic, computed over the last
// 120 days of prices (pass prices.slice(-120)). It is a HEURISTIC — surfaced
// in the UI as "CMVNG Model Score", never as a probability.
//
// Score inputs (documented in the "How this is calculated" panel):
//   Trend      : +2 uptrend / 0 ranging / -2 downtrend
//                (uptrend = price > 1.02×MA30 and MA30 > MA90; downtrend mirrored)
//   Momentum   : window % change → >20%:+2, >0:+1, >-20%:-1, else -2
//   Range pos  : bottom 35% of range:+1, top 25%:-1, else 0
// Total range: -5 … +5.

import { avg, std } from "./statistics.js";

export function analyzeMarket(prices) {
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
  let verdict;
  if (score >= 3) verdict = "Strong Setup";
  else if (score >= 1) verdict = "Decent Setup";
  else if (score >= -1) verdict = "Mixed Signals";
  else verdict = "Weak Setup";
  return {
    ma30, ma90, vol30, volPct, cur, trend, momentum, nearLow, score, verdict,
    windowDays: vals.length,
  };
}

// Explainable component breakdown behind the score (Phase 21).
export function marketConditions(analysis, reality) {
  const comps = [
    {
      key: "trend", label: "Trend",
      value: analysis.trend === "Uptrend" ? "Positive" : analysis.trend === "Downtrend" ? "Negative" : "Sideways",
      tone: analysis.trend === "Uptrend" ? "good" : analysis.trend === "Downtrend" ? "bad" : "ok",
    },
    {
      key: "momentum", label: `Momentum (${analysis.windowDays}d)`,
      value: analysis.momentum > 20 ? "Strong" : analysis.momentum > 0 ? "Moderate" : analysis.momentum > -20 ? "Weak" : "Very weak",
      tone: analysis.momentum > 0 ? "good" : analysis.momentum > -20 ? "warn" : "bad",
      detail: `${analysis.momentum >= 0 ? "+" : ""}${analysis.momentum.toFixed(1)}%`,
    },
    {
      key: "range", label: "Range position",
      value: analysis.nearLow < 0.35 ? "Lower part of range" : analysis.nearLow > 0.75 ? "Near recent highs" : "Middle of range",
      tone: analysis.nearLow < 0.35 ? "good" : analysis.nearLow > 0.75 ? "warn" : "ok",
    },
    {
      key: "volatility", label: "Volatility (30d)",
      value: analysis.volPct > 8 ? "High" : analysis.volPct > 4 ? "Elevated" : "Normal",
      tone: analysis.volPct > 8 ? "warn" : "ok",
      detail: `${analysis.volPct.toFixed(1)}%`,
    },
  ];
  if (reality?.ok) {
    comps.push({
      key: "difficulty", label: "Target difficulty", value: reality.label,
      tone: reality.tone,
    });
  }

  // Overall assessment + reasons (deterministic, from the same components).
  const reasons = [];
  if (analysis.trend === "Downtrend") reasons.push("Price is trading below its recent averages.");
  if (analysis.trend === "Uptrend") reasons.push("Price is holding above its recent averages.");
  if (analysis.momentum <= -20) reasons.push(`Momentum over the analysis window is deeply negative (${analysis.momentum.toFixed(0)}%).`);
  if (analysis.momentum > 20) reasons.push(`Momentum over the analysis window is strongly positive (+${analysis.momentum.toFixed(0)}%).`);
  if (analysis.volPct > 8) reasons.push("Short-term volatility is high — expect large swings during the plan.");
  if (reality?.ok && (reality.label === "Ambitious" || reality.label === "Extreme"))
    reasons.push(`Your target (+${Math.round(reality.targetPct)}%) is large relative to the typical ${reality.typicalPct.toFixed(0)}% move seen over windows of this length.`);

  let overall, overallTone;
  if (analysis.score >= 3) { overall = "FAVOURABLE"; overallTone = "good"; }
  else if (analysis.score >= 1) { overall = "OK"; overallTone = "ok"; }
  else if (analysis.score >= -1) { overall = "CAUTION"; overallTone = "warn"; }
  else { overall = "UNFAVOURABLE"; overallTone = "bad"; }

  return { components: comps, overall, overallTone, reasons: reasons.slice(0, 3) };
}
