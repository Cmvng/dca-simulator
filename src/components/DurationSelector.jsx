import React from "react";
import { T, SANS } from "../styles/theme.js";

export default function DurationSelector({ months, maxMonths, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor="duration" style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: T.ink, display: "block", marginBottom: 8 }}>
        Over how long? <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{months} month{months !== 1 ? "s" : ""}</span>
        <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3, fontVariantNumeric: "tabular-nums" }}> ({months * 30} days)</span>
      </label>
      <input id="duration" type="range" min={1} max={maxMonths} value={months} step={1}
        onChange={e => onChange(Number(e.target.value))}
        aria-valuetext={`${months} months`}
        style={{ width: "100%", accentColor: T.blue }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3, fontVariantNumeric: "tabular-nums" }}>
        <span>1 month</span><span>{maxMonths} months</span>
      </div>
    </div>
  );
}
