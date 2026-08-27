// Real-time plan preview — updates instantly, before any simulation runs.

import React from "react";
import { G } from "../styles/theme.js";
import { buildSchedule, validateCapital } from "../lib/simulation/dca.js";
import { fmtUSD, fmtUSDPrecise } from "../lib/formatting/money.js";

export default function SchedulePreview({ selected, capital, freqId, months, targetPct, mode }) {
  const valid = validateCapital(capital);
  if (!valid.ok) return null;
  const s = buildSchedule({ capital, freqId, months });
  const items = [
    selected ? `${selected.symbol.toUpperCase()}` : null,
    `${fmtUSD(capital)} total`,
    s.freq.label,
    `${months * 30} days`,
    `${s.entries} buys`,
    `≈ ${fmtUSDPrecise(s.amtPer)}/buy`,
  ].filter(Boolean);

  return (
    <div aria-live="polite" style={{ background: G.surfaceAlt, border: `1px solid ${G.border}`, borderRadius: 12, padding: "12px 16px", marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: G.green, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
        Your plan
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {items.map((it, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span aria-hidden="true" style={{ color: G.border }}>·</span>}
            <span style={{ fontSize: 13, fontWeight: 700, color: G.text }}>{it}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 12, color: G.muted, marginTop: 5 }}>
        {mode === "backtest"
          ? "Mode: historical backtest — real past prices, real dates."
          : <>Target scenario: <strong style={{ color: G.green }}>+{targetPct}%</strong> (your chosen test case, not a forecast)</>}
      </div>
    </div>
  );
}
