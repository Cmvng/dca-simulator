// DCA vs Hybrid vs Lump Sum — same capital, same asset, same evaluation
// price. The winner depends on the price path; no blanket claims.

import React, { useEffect } from "react";
import { T, SANS, MONO, monoFigure, body, plColor, HAIRLINE_2 } from "../../styles/theme.js";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { track } from "../../lib/analytics.js";

export default function StrategyComparison({ comparison, targetPct, capital }) {
  useEffect(() => { track("dca_vs_lump_sum_opened", {}); }, []);
  if (!comparison?.length) return null;
  const best = comparison.reduce((a, b) => (b.valueAtTarget > a.valueAtTarget ? b : a));
  const dca = comparison.find(c => c.id === "dca");
  const lump = comparison.find(c => c.id === "lump");
  const diff = dca && lump ? dca.valueAtTarget - lump.valueAtTarget : 0;

  return (
    <div>
      <div style={{ ...body, marginBottom: 6 }}>
        Same {fmtUSD(capital)}, same coin, all valued at your +{targetPct}% target price. Lump sum enters everything at today's live price; DCA spreads entries over the simulated path.
      </div>
      {comparison.map((s, i) => {
        const isBest = s.id === best.id;
        return (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: i === comparison.length - 1 ? "none" : HAIRLINE_2 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: isBest ? 500 : 400, color: T.ink }}>
              {s.name}
              {isBest && (
                <span aria-label="best under this scenario" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", color: T.ink3 }}> · ahead</span>
              )}
            </span>
            <span style={{ textAlign: "right" }}>
              <div style={monoFigure}>{fmtUSD(s.valueAtTarget)}</div>
              <div style={{ ...monoFigure, color: plColor(s.roiAtTarget) }}>{fmtPct(s.roiAtTarget)}</div>
              <div style={{ ...monoFigure, fontSize: 11, color: T.ink3 }}>
                avg entry {fmtPrice(s.avgEntry)}
                {s.totalFees > 0 && <> · fees {fmtUSD(s.totalFees)}</>}
              </div>
            </span>
          </div>
        );
      })}
      {dca && lump && (
        <div style={{ ...body, color: T.ink, marginTop: 10 }}>
          Under this scenario, <span style={{ fontWeight: 500 }}>{diff >= 0 ? "DCA" : "lump sum"}</span> ends {fmtUSD(Math.abs(diff))} ahead.
          <span style={{ color: T.ink3 }}> Which strategy wins depends entirely on the price path — neither always wins.</span>
        </div>
      )}
    </div>
  );
}
