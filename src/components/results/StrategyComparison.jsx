// DCA vs Hybrid vs Lump Sum — same capital, same asset, same evaluation
// price. The winner depends on the price path; no blanket claims.
// CLEAR BLUE signature moment #4: each strategy as a soft stat cell with a
// big tabular value; the leader carries a soft "ahead" pill.

import React, { useEffect } from "react";
import { T, SANS, body } from "../../styles/theme.js";
import { Pill, SignedPct } from "../ui.jsx";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
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
      <div style={{ ...body, marginBottom: 12 }}>
        Same {fmtUSD(capital)}, same coin, all valued at your +{targetPct}% target price. Lump sum enters everything at today&apos;s live price; DCA spreads entries over the simulated path.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {comparison.map(s => {
          const isBest = s.id === best.id;
          return (
            <div key={s.id} style={{ background: T.card2, borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.ink }}>{s.name}</span>
                {isBest && (
                  <Pill style={{ fontSize: 11, padding: "3px 10px" }}>ahead</Pill>
                )}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 21, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: T.ink }}>
                {fmtUSD(s.valueAtTarget)}
              </div>
              <div style={{ marginTop: 2 }}>
                <SignedPct val={s.roiAtTarget} />
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                avg entry {fmtPrice(s.avgEntry)}
                {s.totalFees > 0 && <> · fees {fmtUSD(s.totalFees)}</>}
              </div>
            </div>
          );
        })}
      </div>
      {dca && lump && (
        <div style={{ ...body, color: T.ink, marginTop: 12 }}>
          Under this scenario, <span style={{ fontWeight: 600 }}>{diff >= 0 ? "DCA" : "lump sum"}</span> ends {fmtUSD(Math.abs(diff))} ahead.
          <span style={{ color: T.ink3 }}> Which strategy wins depends entirely on the price path — neither always wins.</span>
        </div>
      )}
    </div>
  );
}
