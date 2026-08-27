// REALITY CHECK — the user's target vs the actual historical record for
// windows of the plan's length. Deterministic thresholds, documented in
// the Methodology panel. Never phrased as a probability.

import React from "react";
import { G, TONES } from "../../styles/theme.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { InfoRow, ToneBadge } from "../ui.jsx";

export default function RealityCheck({ reality, windowDays }) {
  if (!reality?.ok) return null;
  const [c] = TONES[reality.tone] || TONES.warn;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: G.text }}>
          Your target: <strong style={{ color: G.green }}>+{reality.targetPct}%</strong> over {windowDays} days
        </span>
        <ToneBadge tone={reality.tone}>{reality.label.toUpperCase()}</ToneBadge>
      </div>
      <InfoRow label={`Historical windows sampled (${windowDays}-day, past year)`}>{reality.count}</InfoRow>
      <InfoRow label="Typical move (median of absolute moves)">{reality.typicalPct.toFixed(1)}%</InfoRow>
      <InfoRow label="Largest observed gain">{fmtPct(reality.largestGainPct)}</InfoRow>
      <InfoRow label="Largest observed drop" last>{fmtPct(reality.largestLossPct)}</InfoRow>
      <div style={{ fontSize: 12, color: G.muted, marginTop: 10, lineHeight: 1.55 }}>
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
