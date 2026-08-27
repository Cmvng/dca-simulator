// Frequency selection as square hairline option buttons with a dynamic
// contribution-count explainer.

import React from "react";
import { T, MONO, body, btnOption } from "../styles/theme.js";
import { FREQS, entryCount } from "../lib/simulation/dca.js";

export default function FrequencySelector({ freqId, months, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <span style={{ ...body, color: T.ink, display: "block", marginBottom: 8 }}>How often do you buy?</span>
      <div role="radiogroup" aria-label="Purchase frequency" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 7 }}>
        {FREQS.map(f => {
          const n = entryCount(months, f.days);
          const active = freqId === f.id;
          return (
            <button key={f.id} role="radio" aria-checked={active} onClick={() => onChange(f.id)}
              style={{ ...btnOption(active), display: "flex", flexDirection: "column", gap: 2, alignItems: "center", padding: "10px 4px" }}>
              <span>{f.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 400, color: T.ink3, fontVariantNumeric: "tabular-nums" }}>≈ {n} buys</span>
            </button>
          );
        })}
      </div>
      <div style={{ ...body, marginTop: 6 }}>
        Buy counts shown for your current {months * 30}-day duration · all frequencies support up to 6 months
      </div>
    </div>
  );
}
