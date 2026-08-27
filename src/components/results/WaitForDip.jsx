// "What if I wait for a dip?" — a scenario experiment only. Explicitly does
// not imply those levels can be timed or will occur.

import React from "react";
import { T, SANS, HAIRLINE_2, monoFigure, body, plColor } from "../../styles/theme.js";
import { Collapsible } from "../ui.jsx";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

export default function WaitForDip({ waitForDip, targetPct }) {
  if (!waitForDip) return null;
  const { base, dips } = waitForDip;
  const row = (label, r, emphasize = false) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "8px 0", borderBottom: HAIRLINE_2, flexWrap: "wrap" }}>
      <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: emphasize ? 500 : 400, color: T.ink, minWidth: 110 }}>{label}</span>
      <span style={{ ...monoFigure, color: T.ink3 }}>avg entry {fmtPrice(r.avgEntry)}</span>
      <span style={{ ...monoFigure, color: T.ink3 }}>at target: <span style={{ color: T.ink }}>{fmtUSD(r.valueAtTarget)}</span></span>
      <span style={{ ...monoFigure, color: plColor(r.roiPct) }}>{fmtPct(r.roiPct)}</span>
    </div>
  );
  return (
    <Collapsible title="What if I wait for a dip?" subtitle="Scenario experiment — dips can't be reliably timed">
      <div style={{ ...body, marginBottom: 8 }}>
        If the same plan's entry prices were all shifted down before your +{targetPct}% target price is reached:
      </div>
      {row("Start now", base, true)}
      {dips.map(d => row(`After a ${d.dipPct}% dip`, d))}
      <div style={{ ...body, color: T.ink3, marginTop: 8 }}>
        Lower entries improve the outcome <em>if</em> the dip happens and the target is still reached — but the price may never dip, or may keep falling. This table shows arithmetic, not a strategy recommendation.
      </div>
    </Collapsible>
  );
}
