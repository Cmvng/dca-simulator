// "What if I wait for a dip?" — a scenario experiment only. Explicitly does
// not imply those levels can be timed or will occur.

import React from "react";
import { G } from "../../styles/theme.js";
import { Collapsible } from "../ui.jsx";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

export default function WaitForDip({ waitForDip, targetPct }) {
  if (!waitForDip) return null;
  const { base, dips } = waitForDip;
  const row = (label, r, highlight = false) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: `1px solid ${G.border}`, fontSize: 13, flexWrap: "wrap", background: highlight ? G.surfaceAlt : "transparent" }}>
      <span style={{ fontWeight: 700, color: G.text, minWidth: 110 }}>{label}</span>
      <span style={{ color: G.muted }}>avg entry {fmtPrice(r.avgEntry)}</span>
      <span style={{ color: G.muted }}>at target: <strong style={{ color: G.text }}>{fmtUSD(r.valueAtTarget)}</strong></span>
      <span style={{ fontWeight: 700, color: r.roiPct >= 0 ? G.green : G.red }}>{fmtPct(r.roiPct)}</span>
    </div>
  );
  return (
    <Collapsible title="What if I wait for a dip?" subtitle="Scenario experiment — dips can't be reliably timed">
      <div style={{ fontSize: 13, color: G.muted, marginBottom: 8, lineHeight: 1.5 }}>
        If the same plan's entry prices were all shifted down before your +{targetPct}% target price is reached:
      </div>
      {row("Start now", base, true)}
      {dips.map(d => row(`After a ${d.dipPct}% dip`, d))}
      <div style={{ fontSize: 12, color: G.muted, marginTop: 8, lineHeight: 1.5 }}>
        Lower entries improve the outcome <em>if</em> the dip happens and the target is still reached — but the price may never dip, or may keep falling. This table shows arithmetic, not a strategy recommendation.
      </div>
    </Collapsible>
  );
}
