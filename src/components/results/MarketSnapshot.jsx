// CURRENT MARKET — price, 24h/7d/30d changes, range position, volatility,
// trend. Always timestamped; stale data is labeled.

import React from "react";
import { SpecRow, SignedPct, TrendPill, Staleness, Numeral } from "../ui.jsx";
import { fmtPrice } from "../../lib/formatting/money.js";

export default function MarketSnapshot({ analysis, live, history }) {
  if (!analysis) return null;
  const vals = history?.prices?.map(p => p[1]) || [];
  const chg = days => {
    if (vals.length <= days) return null;
    const a = vals[vals.length - 1 - days], b = vals[vals.length - 1];
    return a > 0 ? ((b - a) / a) * 100 : null;
  };
  const c7 = chg(7), c30 = chg(30);
  const price = live?.price ?? analysis.cur;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <Numeral size={26}>{fmtPrice(price)}</Numeral>
        {live && <SignedPct val={live.change24h} />}
        <Staleness fetchedAt={live?.fetchedAt || history?.fetchedAt} stale={live?.stale || history?.stale} />
      </div>
      {live && <SpecRow label="24h change"><SignedPct val={live.change24h} /></SpecRow>}
      {c7 !== null && <SpecRow label="7d change"><SignedPct val={c7} /></SpecRow>}
      {c30 !== null && <SpecRow label="30d change"><SignedPct val={c30} /></SpecRow>}
      <SpecRow label={`Position in ${analysis.windowDays}-day range`}>
        {analysis.nearLow < 0.35 ? "Lower part" : analysis.nearLow > 0.75 ? "Upper part" : "Middle"}
      </SpecRow>
      <SpecRow label="Volatility (30d, % of price)">
        {analysis.volPct > 8 ? "High" : analysis.volPct > 4 ? "Elevated" : "Normal"} · {analysis.volPct.toFixed(1)}%
      </SpecRow>
      <SpecRow label="Trend" last><TrendPill trend={analysis.trend} /></SpecRow>
    </div>
  );
}
