// Scenario grid — fixed assumptions and historically-derived scenarios,
// each with final value, P/L, ROI. Bases are always disclosed.

import React from "react";
import { G } from "../../styles/theme.js";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

const STYLE_BY_ID = {
  histWorst: { c: G.rose, bg: G.rosePale, b: G.roseBorder },
  severe: { c: G.red, bg: G.redPale, b: G.redBorder },
  moderate: { c: G.red, bg: G.redPale, b: G.redBorder },
  flat: { c: G.amber, bg: G.amberPale, b: G.amberBorder },
  target: { c: G.green, bg: G.greenPale, b: G.greenBorder },
  histBest: { c: G.green2, bg: G.greenPale, b: G.greenBorder },
};

export default function ScenarioGrid({ scenarios, totalInvested }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {scenarios.map(sc => {
        const s = STYLE_BY_ID[sc.id] || STYLE_BY_ID.flat;
        const gain = sc.profit >= 0;
        return (
          <div key={sc.id} style={{ background: s.bg, border: `1.5px solid ${s.b}`, borderRadius: 14, padding: "13px 15px", outline: sc.id === "target" ? `2px solid ${G.green}` : "none" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.c, marginBottom: 2 }}>{sc.name}</div>
            <div style={{ fontSize: 12, color: G.muted }}>{fmtPct(sc.movePct)} → {fmtPrice(sc.price)}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: G.dark, margin: "6px 0 2px" }}>{fmtUSD(sc.value)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: gain ? G.green : G.red }}>
              {gain ? "+" : "−"}{fmtUSD(Math.abs(sc.profit))} ({fmtPct(sc.roiPct)})
            </div>
            <div style={{ fontSize: 11, color: G.muted, marginTop: 6, lineHeight: 1.4 }}>{sc.basis}</div>
          </div>
        );
      })}
      <div style={{ gridColumn: "1 / -1", fontSize: 12, color: G.muted }}>
        All scenarios apply the move to the live price and value your {fmtUSD(totalInvested)} plan's accumulated units at that price. These are test cases, not predictions.
      </div>
    </div>
  );
}
