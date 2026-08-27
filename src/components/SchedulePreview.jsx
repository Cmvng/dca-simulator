// Real-time plan preview — updates instantly, before any simulation runs.
// A mini spec sheet: mono whisper label over one line of mono figures.

import React from "react";
import { HAIRLINE, body, monoFigure } from "../styles/theme.js";
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
    <div aria-live="polite" style={{ borderTop: HAIRLINE, marginTop: 16, paddingTop: 14 }}>
      <SectionLabel style={{ marginBottom: 8 }}>your plan</SectionLabel>
      <div style={monoFigure}>{items.join(" · ")}</div>
      <div style={{ ...body, marginTop: 6 }}>
        {mode === "backtest"
          ? "Mode: historical backtest — real past prices, real dates."
          : <>Target scenario: <span style={monoFigure}>+{targetPct}%</span> (your chosen test case, not a forecast)</>}
      </div>
    </div>
  );
}
