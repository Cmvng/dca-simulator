// Scenario bars — the stress test as clean horizontal bars (CLEAR BLUE
// signature moment #2). One row per scenario: label left, soft track with a
// colored fill proportional to the ending value, dollar value right. Colors
// run loss-red → amber → neutral → target-blue → gain-green; meaning is never
// color-only — every row carries its label, move and value as text.

import React from "react";
import { T, SANS, body } from "../../styles/theme.js";
import { Pill } from "../ui.jsx";
import { fmtUSD } from "../../lib/formatting/money.js";

// short display names + short basis lines, derived from scenario id
const SHORT = {
  histWorst: "Historical worst",
  severe: "Severe downside",
  moderate: "Moderate downside",
  flat: "Flat",
  target: "Your target",
  histBest: "Strong upside",
};
const BASIS_SHORT = {
  histWorst: "worst observed window",
  severe: "fixed assumption",
  moderate: "fixed assumption",
  flat: "price unchanged",
  target: "your chosen target",
  histBest: "best observed window",
};

// fill color per scenario — amber is allowed here ONLY, as the mid step
// between loss-red and target-blue (see DESIGN.md)
const fillFor = s =>
  s.id === "histWorst" || s.id === "severe" ? T.loss
  : s.id === "moderate" ? T.amberBar
  : s.id === "flat" ? T.ink3
  : s.id === "target" ? T.blue
  : s.id === "histBest" ? T.gain
  : T.ink3;

const signedMove = m => `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m))}%`;

export default function ScenarioBars({ scenarios, totalInvested }) {
  if (!scenarios?.length) return null;

  const maxVal = Math.max(...scenarios.map(s => s.value), 1);

  const aria =
    `Stress test for ${fmtUSD(totalInvested)} invested. ` +
    scenarios.map(s => `${SHORT[s.id] || s.name}: ${fmtUSD(s.value)}`).join(", ") +
    ". Test cases, not predictions.";

  return (
    <div aria-label={aria}>
      {scenarios.map((s, i) => {
        const isTarget = s.id === "target";
        const widthPct = Math.max(4, (s.value / maxVal) * 100);
        const name = SHORT[s.id] || s.name;
        return (
          <div key={s.id} style={{ marginBottom: i === scenarios.length - 1 ? 0 : 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: isTarget ? 700 : 600, color: T.ink }}>
                  {name}
                  {isTarget && <Pill style={{ marginLeft: 8, fontSize: 11, padding: "3px 10px", verticalAlign: "middle" }}>target</Pill>}
                </span>
                <span style={{ display: "block", fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink3 }}>
                  {signedMove(s.movePct)} · {BASIS_SHORT[s.id] || s.basis}
                </span>
              </span>
              <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {fmtUSD(s.value)}
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 100, background: T.card2, marginTop: 7, overflow: "hidden" }}>
              <div style={{ width: `${widthPct}%`, height: "100%", borderRadius: 100, background: fillFor(s) }} />
            </div>
          </div>
        );
      })}
      <div style={{ ...body, fontSize: 12, color: T.ink3, marginTop: 12 }}>
        Test cases, not predictions — each bar is the plan&apos;s ending value under that move.
      </div>
    </div>
  );
}
