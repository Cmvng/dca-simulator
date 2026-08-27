// Robustness: the same plan executed over every completed historical window
// of the plan's length in the past year. Best / median / worst — historical
// outcomes, explicitly NOT probabilities.

import React from "react";
import { T, MONO, HAIRLINE, monoLabel, body, plColor } from "../../styles/theme.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

// stat stack: mono whisper label over a mono tabular figure. Each carries a
// left hairline; the wrapper clips the line-leading ones so dividers only
// appear between stacks — and the row wraps instead of overflowing at 320px.
const Stat = ({ label, v }) => (
  <div style={{ flex: "1 1 96px", borderLeft: HAIRLINE, padding: "2px 12px" }}>
    <div style={{ ...monoLabel, marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: MONO, fontSize: 20, fontVariantNumeric: "tabular-nums", fontWeight: 400, color: plColor(v) }}>
      {fmtPct(v)}
    </div>
  </div>
);

export default function RollingWindows({ rolling, windowDays }) {
  if (!rolling?.ok) return null;
  return (
    <div>
      <div style={{ ...body, marginBottom: 12 }}>
        The same {windowDays}-day plan, run over <span style={{ fontWeight: 500, color: T.ink }}>{rolling.count} different historical {windowDays}-day windows</span> from the past year (weekly steps, real prices, each valued at its own window's final price):
      </div>
      <div style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", rowGap: 14, marginLeft: -13 }}>
          <Stat label="best window" v={rolling.best} />
          <Stat label="median window" v={rolling.median} />
          <Stat label="worst window" v={rolling.worst} />
        </div>
      </div>
      <div style={{ ...body, color: T.ink3, marginTop: 12 }}>
        These are historical outcomes, not probabilities — the coming {windowDays} days are not drawn from this list.
      </div>
    </div>
  );
}
