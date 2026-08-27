// REALITY CHECK — the user's target vs the actual historical record for
// windows of the plan's length. Deterministic thresholds, documented in
// the Methodology panel. Never phrased as a probability.

import React from "react";
import { SANS, T, monoFigure, body } from "../../styles/theme.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { SpecRow, Pill } from "../ui.jsx";

// verdict word, lowercase — the one permitted pill
const verdictWord = label =>
  label === "Relatively modest" ? "modest" : String(label).toLowerCase();

export default function RealityCheck({ reality, windowDays }) {
  if (!reality?.ok) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 400, color: T.ink }}>
          Your target: <span style={monoFigure}>+{reality.targetPct}%</span> over <span style={monoFigure}>{windowDays}</span> days
        </span>
        <Pill>{verdictWord(reality.label)}</Pill>
      </div>
      <SpecRow label={`Historical windows sampled (${windowDays}-day, past year)`}>{reality.count}</SpecRow>
      <SpecRow label="Typical move (median of absolute moves)">{reality.typicalPct.toFixed(1)}%</SpecRow>
      <SpecRow label="Largest observed gain">{fmtPct(reality.largestGainPct)}</SpecRow>
      <SpecRow label="Largest observed drop" last>{fmtPct(reality.largestLossPct)}</SpecRow>
      <div style={{ ...body, marginTop: 10 }}>
        {reality.label === "Extreme"
          ? `A +${reality.targetPct}% move exceeds anything observed over ${windowDays}-day windows in the sampled year. It would require conditions this data has not seen.`
          : reality.label === "Ambitious"
            ? `A +${reality.targetPct}% move has happened over windows of this length, but it is well beyond the typical move. It needs an unusually strong period.`
            : reality.label === "Moderate"
              ? `A +${reality.targetPct}% move is above the typical move for this window length, but within twice the typical range.`
              : `A +${reality.targetPct}% move is within the typical range observed for windows of this length.`}
        {" "}These are historical observations, not probabilities.
      </div>
    </div>
  );
}
