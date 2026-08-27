// Capital input with presets and hard validation (no NaN/negative/infinite).

import React, { useState } from "react";
import { G, inp } from "../styles/theme.js";
import { validateCapital } from "../lib/simulation/dca.js";

const PRESETS = [500, 1000, 5000, 10000, 25000, 50000];

export default function CapitalInput({ capital, onChange }) {
  const [display, setDisplay] = useState(capital.toLocaleString("en-US"));
  const [focused, setFocused] = useState(false);
  const validation = validateCapital(capital);

  const commit = raw => {
    const digits = raw.replace(/[^0-9]/g, "");
    const num = digits === "" ? 0 : Number(digits);
    onChange(num);
    setDisplay(focused ? digits : (digits === "" ? "" : Number(digits).toLocaleString("en-US")));
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor="capital" style={{ fontSize: 13, fontWeight: 700, color: G.sub, display: "block", marginBottom: 6 }}>
        Total money to invest (USD)
      </label>
      <div style={{ position: "relative" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 700, color: G.sub, pointerEvents: "none" }}>$</span>
        <input
          id="capital" type="text" inputMode="numeric"
          aria-invalid={!validation.ok}
          aria-describedby={validation.ok ? undefined : "capital-error"}
          style={{ ...inp, paddingLeft: 28, borderColor: validation.ok ? undefined : G.redBorder }}
          value={display}
          onChange={e => commit(e.target.value)}
          onFocus={e => { setFocused(true); e.target.style.borderColor = G.green; setDisplay(String(capital || "")); }}
          onBlur={e => { setFocused(false); e.target.style.borderColor = validation.ok ? G.border : G.redBorder; setDisplay(capital ? capital.toLocaleString("en-US") : ""); }}
          placeholder="e.g. 1,000"
        />
      </div>
      {!validation.ok && (
        <div id="capital-error" role="alert" style={{ fontSize: 12, color: G.red, marginTop: 5, fontWeight: 600 }}>{validation.reason}</div>
      )}
      <div role="group" aria-label="Preset amounts" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {PRESETS.map(p => (
          <button key={p} onClick={() => { onChange(p); setDisplay(p.toLocaleString("en-US")); }}
            aria-pressed={capital === p}
            style={{
              padding: "6px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${capital === p ? G.green : G.border}`,
              background: capital === p ? G.greenPale : G.surfaceAlt,
              color: capital === p ? G.green : G.muted,
            }}>
            ${p.toLocaleString("en-US")}
          </button>
        ))}
      </div>
    </div>
  );
}
