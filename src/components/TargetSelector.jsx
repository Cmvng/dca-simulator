// Target SCENARIO selector — explicitly framed as "what outcome do you want
// to test?", never as a forecast. Supports a custom value.

import React, { useState } from "react";
import { G, inp } from "../styles/theme.js";
import { track } from "../lib/analytics.js";

const TARGETS = [10, 25, 50, 100, 200];

export default function TargetSelector({ targetPct, onChange }) {
  const isPreset = TARGETS.includes(targetPct);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [customVal, setCustomVal] = useState(isPreset ? "" : String(targetPct));

  const commitCustom = raw => {
    setCustomVal(raw);
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n >= 1 && n <= 1000) {
      onChange(n);
      track("target_selected", { target: n, custom: true });
    }
  };

  return (
    <div>
      <span style={{ fontSize: 13, fontWeight: 700, color: G.sub, display: "block", marginBottom: 4 }}>
        Target scenario — what outcome do you want to test?
      </span>
      <div style={{ fontSize: 12, color: G.muted, marginBottom: 8 }}>
        This is a scenario you choose, not a prediction the app makes.
      </div>
      <div role="radiogroup" aria-label="Target scenario" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {TARGETS.map(t => (
          <button key={t} role="radio" aria-checked={targetPct === t && !customOpen}
            onClick={() => { onChange(t); setCustomOpen(false); track("target_selected", { target: t }); }}
            style={{
              flex: 1, minWidth: 56, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
              border: `2px solid ${targetPct === t && !customOpen ? G.green : G.border}`,
              background: targetPct === t && !customOpen ? G.greenPale : G.surfaceAlt,
              color: targetPct === t && !customOpen ? G.green : G.muted, transition: "all 0.15s",
            }}>
            +{t}%
          </button>
        ))}
        <button role="radio" aria-checked={customOpen}
          onClick={() => setCustomOpen(v => !v)}
          style={{
            flex: 1, minWidth: 66, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
            border: `2px solid ${customOpen ? G.green : G.border}`,
            background: customOpen ? G.greenPale : G.surfaceAlt,
            color: customOpen ? G.green : G.muted,
          }}>
          Custom
        </button>
      </div>
      {customOpen && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="custom-target" style={{ fontSize: 13, color: G.muted }}>+</label>
          <input id="custom-target" type="text" inputMode="numeric" value={customVal}
            onChange={e => commitCustom(e.target.value)}
            placeholder="e.g. 75" aria-label="Custom target percent (1 to 1000)"
            style={{ ...inp, maxWidth: 120, padding: "8px 12px" }} />
          <span style={{ fontSize: 13, color: G.muted }}>% (1–1000)</span>
        </div>
      )}
    </div>
  );
}
