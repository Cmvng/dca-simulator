// Progressive disclosure: fees, slippage, hybrid split, and the Monte Carlo
// distribution toggle live here — hidden from the default flow.

import React from "react";
import { T, SANS, inp, body, btnOption } from "../styles/theme.js";
import { Collapsible } from "./ui.jsx";

const SLIPPAGE_OPTS = [0, 0.1, 0.25, 0.5, 1];
const HYBRID_OPTS = [0, 10, 20, 30, 50, 70, 90];

const groupLabel = { ...body, color: T.ink, display: "block", marginBottom: 6 };
const fieldLabel = { fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink2, display: "block", marginBottom: 4 };
const helper = { fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink3, lineHeight: 1.6, marginTop: 5 };
const optBtn = active => ({ ...btnOption(active), padding: "6px 12px", fontSize: 12, fontVariantNumeric: "tabular-nums" });

export default function AdvancedOptions({ config, onChange }) {
  const set = (k, v) => onChange({ ...config, [k]: v });
  const numInput = (raw, min, max) => {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
  };

  const active = config.feePct > 0 || config.feeFixed > 0 || config.slippagePct > 0 || config.hybridPct !== 30 || config.monteCarlo;

  return (
    <Collapsible
      title={`advanced options${active ? " · active" : ""}`}
      subtitle="Fees, execution slippage, hybrid strategy split, distribution mode"
    >
      {/* Fees */}
      <div style={{ marginBottom: 14 }}>
        <span style={groupLabel}>Trading fees (optional)</span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label htmlFor="fee-pct" style={fieldLabel}>Fee per purchase (%)</label>
            <input id="fee-pct" type="text" inputMode="decimal" value={config.feePct}
              onChange={e => set("feePct", numInput(e.target.value, 0, 10))}
              style={{ ...inp, padding: "8px 12px" }} />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label htmlFor="fee-fixed" style={fieldLabel}>Fixed fee per purchase ($)</label>
            <input id="fee-fixed" type="text" inputMode="decimal" value={config.feeFixed}
              onChange={e => set("feeFixed", numInput(e.target.value, 0, 1000))}
              style={{ ...inp, padding: "8px 12px" }} />
          </div>
        </div>
        <div style={helper}>
          Fees are deducted from each purchase before buying — units bought reflect the fee.
        </div>
      </div>

      {/* Slippage */}
      <div style={{ marginBottom: 14 }}>
        <span style={groupLabel}>
          Estimated execution slippage
        </span>
        <div role="radiogroup" aria-label="Slippage assumption" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SLIPPAGE_OPTS.map(s => (
            <button key={s} role="radio" aria-checked={config.slippagePct === s} onClick={() => set("slippagePct", s)}
              style={optBtn(config.slippagePct === s)}>
              {s}%
            </button>
          ))}
        </div>
        <div style={helper}>
          Historical closing prices are not guaranteed executable prices — this assumption raises every execution price by the chosen amount.
        </div>
      </div>

      {/* Hybrid split */}
      <div style={{ marginBottom: 14 }}>
        <span style={groupLabel}>
          Hybrid strategy — % deployed immediately (rest DCA'd)
        </span>
        <div role="radiogroup" aria-label="Initial allocation" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HYBRID_OPTS.map(h => (
            <button key={h} role="radio" aria-checked={config.hybridPct === h} onClick={() => set("hybridPct", h)}
              style={optBtn(config.hybridPct === h)}>
              {h}%
            </button>
          ))}
        </div>
        <div style={helper}>
          Shown in the strategy comparison as "Hybrid {config.hybridPct}/{100 - config.hybridPct}".
        </div>
      </div>

      {/* Monte Carlo */}
      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={!!config.monteCarlo} onChange={e => set("monteCarlo", e.target.checked)}
            style={{ width: 18, height: 18, accentColor: T.ink }} />
          <span>
            <span style={{ ...body, color: T.ink, display: "block" }}>Advanced simulation: run 10,000 simulated paths</span>
            <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink3, lineHeight: 1.6 }}>Distribution of outcomes from resampling this coin's historical daily returns (model-based, methodology disclosed in results).</span>
          </span>
        </label>
      </div>
    </Collapsible>
  );
}
