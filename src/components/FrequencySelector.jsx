// Card-based frequency selection with a dynamic contribution-count explainer.

import React from "react";
import { G } from "../styles/theme.js";
import { FREQS, entryCount } from "../lib/simulation/dca.js";

export default function FrequencySelector({ freqId, months, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: G.sub, display: "block", marginBottom: 8 }}>How often do you buy?</span>
      <div role="radiogroup" aria-label="Purchase frequency" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 7 }}>
        {FREQS.map(f => {
          const n = entryCount(months, f.days);
          const active = freqId === f.id;
          return (
            <button key={f.id} role="radio" aria-checked={active} onClick={() => onChange(f.id)}
              style={{
                padding: "10px 4px", borderRadius: 11, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: `2px solid ${active ? G.green : G.border}`,
                background: active ? G.green : G.surfaceAlt,
                color: active ? "#fff" : G.muted, transition: "all 0.15s",
                display: "flex", flexDirection: "column", gap: 2, alignItems: "center",
              }}>
              <span>{f.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: active ? 0.85 : 0.8 }}>≈ {n} buys</span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: G.muted, marginTop: 6 }}>
        Buy counts shown for your current {months * 30}-day duration · all frequencies support up to 6 months
      </div>
    </div>
  );
}
