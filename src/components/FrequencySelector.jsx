// Frequency selection as soft rounded option cards with a dynamic
// contribution-count explainer.

import React from "react";
import { T, SANS, body, btnOption } from "../styles/theme.js";
import { FREQS, entryCount } from "../lib/simulation/dca.js";

export default function FrequencySelector({ freqId, months, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: T.ink, display: "block", marginBottom: 8 }}>How often do you buy?</span>
      <div role="radiogroup" aria-label="Purchase frequency" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
        {FREQS.map(f => {
          const n = entryCount(months, f.days);
          const active = freqId === f.id;
          return (
            <button key={f.id} role="radio" aria-checked={active} onClick={() => onChange(f.id)}
              style={{ ...btnOption(active), borderRadius: 14, display: "flex", flexDirection: "column", gap: 3, alignItems: "center", padding: "11px 6px", fontWeight: active ? 700 : 500 }}>
              <span>{f.label}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3, fontVariantNumeric: "tabular-nums" }}>≈ {n} buys</span>
            </button>
          );
        })}
      </div>
      <div style={{ ...body, fontSize: 12, marginTop: 8 }}>
        Buy counts shown for your current {months * 30}-day duration · all frequencies support up to 6 months
      </div>
    </div>
  );
}
