// CURRENT MARKET — price, 24h/7d/30d changes, range position, volatility,
// trend. Always timestamped; stale data is labeled.

import React from "react";
import { G } from "../../styles/theme.js";
import { InfoRow, PctBadge, TrendPill, Staleness } from "../ui.jsx";
import { fmtPrice } from "../../lib/formatting/money.js";

export default function MarketSnapshot({ analysis, live, selected, history }) {
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 900, color: G.dark }}>{fmtPrice(price)}</span>
        {live && <PctBadge val={live.change24h} />}
        <Staleness fetchedAt={live?.fetchedAt || history?.fetchedAt} stale={live?.stale || history?.stale} />
      </div>
      {live && <InfoRow label="24h change"><PctBadge val={live.change24h} /></InfoRow>}
      {c7 !== null && <InfoRow label="7d change"><PctBadge val={c7} /></InfoRow>}
      {c30 !== null && <InfoRow label="30d change"><PctBadge val={c30} /></InfoRow>}
      <InfoRow label={`Position in ${analysis.windowDays}-day range`}>
        {analysis.nearLow < 0.35 ? "Lower part" : analysis.nearLow > 0.75 ? "Upper part" : "Middle"}
      </InfoRow>
      <InfoRow label="Volatility (30d, % of price)">
        {analysis.volPct > 8 ? "High" : analysis.volPct > 4 ? "Elevated" : "Normal"} · {analysis.volPct.toFixed(1)}%
      </InfoRow>
      <InfoRow label="Trend" last><TrendPill trend={analysis.trend} /></InfoRow>
    </div>
  );
}
