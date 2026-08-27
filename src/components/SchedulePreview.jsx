// Real-time plan preview — updates instantly, before any simulation runs.
// A soft inset: eyebrow label over one friendly line of tabular figures.

import React from "react";
import { T, body, monoFigure, pillSoft } from "../styles/theme.js";
import { SectionLabel } from "./ui.jsx";
import { buildSchedule, validateCapital } from "../lib/simulation/dca.js";
import { fmtUSD, fmtUSDPrecise } from "../lib/formatting/money.js";

export default function SchedulePreview({ selected, capital, freqId, months, targetPct, mode }) {
  const valid = validateCapital(capital);
  if (!valid.ok) return null;
  const s = buildSchedule({ capital, freqId, months });
  const items = [
    selected ? `${selected.symbol.toUpperCase()}` : null,
    `${fmtUSD(capital)} total`,
    s.freq.label.toLowerCase(),
    `${months * 30} days`,
    `${s.entries} buys`,
    `≈ ${fmtUSDPrecise(s.amtPer)}/buy`,
  ].filter(Boolean);

  return (
    <div aria-live="polite" style={{ marginTop: 16, background: T.card2, borderRadius: 16, padding: "14px 16px" }}>
      <SectionLabel eyebrow style={{ marginBottom: 8 }}>Your plan</SectionLabel>
      <div style={monoFigure}>{items.join(" · ")}</div>
      <div style={{ ...body, marginTop: 8 }}>
        {mode === "backtest"
          ? "Mode: historical backtest — real past prices, real dates."
          : <>Target scenario: <span style={{ ...pillSoft, fontVariantNumeric: "tabular-nums" }}>+{targetPct}%</span> (your chosen test case, not a forecast)</>}
      </div>
    </div>
  );
}
