// Robustness: the same plan executed over every completed historical window
// of the plan's length in the past year. Best / median / worst — historical
// outcomes, explicitly NOT probabilities.
// CLEAR BLUE signature moment #3: three soft --card-2 cells with big colored
// numerals under small labels.

import React from "react";
import { T, SANS, body, plColor } from "../../styles/theme.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

// one soft cell: small label over a big colored numeral (sign carries meaning
// alongside color — never color alone)
const Cell = ({ label, v }) => (
  <div style={{ flex: "1 1 90px", background: T.card2, borderRadius: 16, padding: 14 }}>
    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: SANS, fontSize: 21, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: plColor(v) }}>
      {fmtPct(v)}
    </div>
  </div>
);

export default function RollingWindows({ rolling, windowDays }) {
  if (!rolling?.ok) return null;
  return (
    <div>
      <div style={{ ...body, marginBottom: 14 }}>
        The same {windowDays}-day plan, run over <span style={{ fontWeight: 600, color: T.ink }}>{rolling.count} different historical {windowDays}-day windows</span> from the past year (weekly steps, real prices, each valued at its own window&apos;s final price):
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Cell label="Worst window" v={rolling.worst} />
        <Cell label="Median window" v={rolling.median} />
        <Cell label="Best window" v={rolling.best} />
      </div>
      <div style={{ ...body, color: T.ink3, marginTop: 14 }}>
        These are historical outcomes, not probabilities — the coming {windowDays} days are not drawn from this list.
      </div>
    </div>
  );
}
