// Explainable market conditions — the components behind the verdict,
// plus 1–3 short reasons and a "how this is calculated" disclosure.

import React from "react";
import { T, monoLabel, monoFigure, body } from "../../styles/theme.js";
import { SpecRow, ToneBadge, Collapsible } from "../ui.jsx";

const Strong = ({ children }) => <span style={{ fontWeight: 600, color: T.ink }}>{children}</span>;

export default function MarketConditions({ conditions, analysis }) {
  if (!conditions) return null;
  return (
    <div>
      {conditions.components.map((c, i) => (
        <SpecRow key={c.key} label={c.label} last={i === conditions.components.length - 1}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
            {c.detail && <span style={{ ...monoFigure, color: T.ink3 }}>{c.detail}</span>}
            <ToneBadge tone={c.tone}>{c.value}</ToneBadge>
          </span>
        </SpecRow>
      ))}
      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...monoLabel, marginBottom: 0 }}>Overall assessment</span>
        <ToneBadge tone={conditions.overallTone}>{conditions.overall}</ToneBadge>
      </div>
      {conditions.reasons.length > 0 && (
        <ul style={{ ...body, margin: "8px 0 0", paddingLeft: 18 }}>
          {conditions.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      <div style={{ marginTop: 12 }}>
        <Collapsible title="How the CMVNG Model Score is calculated" subtitle="It is a heuristic — not a probability of profit">
          <div style={{ ...body, lineHeight: 1.7 }}>
            The score adds three components over the last {analysis?.windowDays ?? 120} days of daily prices:
            <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
              <li><Strong>Trend</Strong> (+2 / 0 / −2): price vs its 30-day average, and 30-day vs 90-day average.</li>
              <li><Strong>Momentum</Strong> (+2 to −2): % change across the window (thresholds at +20%, 0%, −20%).</li>
              <li><Strong>Range position</Strong> (+1 / 0 / −1): +1 in the bottom 35% of the window's range, −1 in the top 25%.</li>
            </ul>
            Total range −5…+5. It is deterministic and explainable, but it is a rule-of-thumb built on recent price action only — it does not model fundamentals, liquidity or news, and it is not a prediction.
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
