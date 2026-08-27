import React from "react";
import { G } from "../styles/theme.js";

export default function DurationSelector({ months, maxMonths, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor="duration" style={{ fontSize: 13, fontWeight: 700, color: G.sub, display: "block", marginBottom: 8 }}>
        Over how long? <span style={{ color: G.green, fontWeight: 900 }}>{months} month{months !== 1 ? "s" : ""}</span>
        <span style={{ color: G.muted, fontWeight: 400 }}> ({months * 30} days)</span>
      </label>
      <input id="duration" type="range" min={1} max={maxMonths} value={months} step={1}
        onChange={e => onChange(Number(e.target.value))}
        aria-valuetext={`${months} months`}
        style={{ width: "100%", accentColor: G.green }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: G.muted }}>
        <span>1 month</span><span>{maxMonths} months</span>
      </div>
    </div>
  );
}
