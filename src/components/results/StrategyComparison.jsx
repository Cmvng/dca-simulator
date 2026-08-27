// DCA vs Hybrid vs Lump Sum — same capital, same asset, same evaluation
// price. The winner depends on the price path; no blanket claims.

import React, { useEffect } from "react";
import { G } from "../../styles/theme.js";
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
      <div style={{ fontSize: 13, color: G.muted, marginBottom: 10, lineHeight: 1.5 }}>
        Same {fmtUSD(capital)}, same coin, all valued at your +{targetPct}% target price. Lump sum enters everything at today's live price; DCA spreads entries over the simulated path.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {comparison.map(s => {
          const isBest = s.id === best.id;
          return (
            <div key={s.id} style={{
              background: isBest ? G.greenPale : G.surfaceAlt,
              border: `1.5px solid ${isBest ? G.green : G.border}`,
              borderRadius: 14, padding: "13px 15px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: isBest ? G.green : G.sub, display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span>{s.name}</span>
                {isBest && <span aria-label="best under this scenario">▲ ahead</span>}
              </div>
              <div style={{ fontSize: 21, fontWeight: 900, color: G.dark, margin: "6px 0 2px" }}>{fmtUSD(s.valueAtTarget)}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.roiAtTarget >= 0 ? G.green : G.red }}>{fmtPct(s.roiAtTarget)}</div>
              <div style={{ fontSize: 12, color: G.muted, marginTop: 6, lineHeight: 1.5 }}>
                Avg entry {fmtPrice(s.avgEntry)}
                {s.totalFees > 0 && <> · fees {fmtUSD(s.totalFees)}</>}
              </div>
            </div>
          );
        })}
      </div>
      {dca && lump && (
        <div style={{ fontSize: 13, color: G.text, marginTop: 10 }}>
          Under this scenario, <strong>{diff >= 0 ? "DCA" : "lump sum"}</strong> ends {fmtUSD(Math.abs(diff))} ahead.
          <span style={{ color: G.muted }}> Which strategy wins depends entirely on the price path — neither always wins.</span>
        </div>
      )}
    </div>
  );
}
