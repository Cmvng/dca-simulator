// Robustness: the same plan executed over every completed historical window
// of the plan's length in the past year. Best / median / worst — historical
// outcomes, explicitly NOT probabilities.

import React from "react";
import { G } from "../../styles/theme.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

export default function RollingWindows({ rolling, windowDays }) {
  if (!rolling?.ok) return null;
  const cell = (label, v, color) => (
    <div style={{ flex: 1, minWidth: 100, background: G.surfaceAlt, border: `1px solid ${G.border}`, borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: G.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4 }}>{fmtPct(v)}</div>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 13, color: G.muted, marginBottom: 10, lineHeight: 1.5 }}>
        The same {windowDays}-day plan, run over <strong style={{ color: G.text }}>{rolling.count} different historical {windowDays}-day windows</strong> from the past year (weekly steps, real prices, each valued at its own window's final price):
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {cell("Best window", rolling.best, G.green)}
        {cell("Median window", rolling.median, rolling.median >= 0 ? G.green2 : G.amber)}
        {cell("Worst window", rolling.worst, G.red)}
      </div>
      <div style={{ fontSize: 12, color: G.muted, marginTop: 10 }}>
        These are historical outcomes, not probabilities — the coming {windowDays} days are not drawn from this list.
      </div>
    </div>
  );
}
