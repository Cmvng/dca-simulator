// Collapsible, auditable purchase table — every simulated buy with date,
// price, contribution, units, cumulative units and running average entry.

import React from "react";
import { T, MONO, HAIRLINE_2 } from "../../styles/theme.js";
import { Collapsible } from "../ui.jsx";
import { fmtUSDPrecise, fmtPrice, fmtTok } from "../../lib/formatting/money.js";
import { fmtDate } from "../../lib/formatting/dates.js";

export default function DcaTimeline({ series, symbol, hasFees }) {
  if (!series?.length) return null;
  const th = { textAlign: "right", padding: "7px 8px", fontFamily: MONO, fontSize: 10, fontWeight: 400, letterSpacing: "0.05em", textTransform: "lowercase", color: T.ink3, whiteSpace: "nowrap" };
  const td = { textAlign: "right", padding: "7px 8px", fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums", color: T.ink, whiteSpace: "nowrap" };

  return (
    <Collapsible
      title={`Purchase timeline · ${series.length} buys`}
      subtitle="Every simulated purchase — audit the numbers yourself"
    >
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            DCA purchase schedule
          </caption>
          <thead>
            <tr style={{ borderBottom: `0.5px solid ${T.line}` }}>
              <th scope="col" style={{ ...th, textAlign: "left" }}>#</th>
              <th scope="col" style={{ ...th, textAlign: "left" }}>Date</th>
              <th scope="col" style={th}>Price</th>
              <th scope="col" style={th}>Contribution</th>
              {hasFees && <th scope="col" style={th}>Fee</th>}
              <th scope="col" style={th}>{symbol} bought</th>
              <th scope="col" style={th}>Cum. {symbol}</th>
              <th scope="col" style={th}>Avg entry</th>
            </tr>
          </thead>
          <tbody>
            {series.map(b => (
              <tr key={b.i} style={{ borderBottom: HAIRLINE_2 }}>
                <td style={{ ...td, textAlign: "left", color: T.ink3 }}>{b.i + 1}</td>
                <td style={{ ...td, textAlign: "left" }}>{fmtDate(b.date)}</td>
                <td style={td}>{fmtPrice(b.price)}</td>
                <td style={td}>{fmtUSDPrecise(b.gross)}</td>
                {hasFees && <td style={{ ...td, color: T.ink2 }}>{fmtUSDPrecise(b.fee)}</td>}
                <td style={td}>{fmtTok(b.units)}</td>
                <td style={td}>{fmtTok(b.cumUnits)}</td>
                <td style={td}>{fmtPrice(b.avgEntry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}
