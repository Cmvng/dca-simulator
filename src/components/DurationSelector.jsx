import React from "react";
import { T, MONO, body, monoFigure } from "../styles/theme.js";

export default function DurationSelector({ months, maxMonths, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor="duration" style={{ ...body, color: T.ink, display: "block", marginBottom: 8 }}>
        Over how long? <span style={monoFigure}>{months} month{months !== 1 ? "s" : ""}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 400, color: T.ink3, fontVariantNumeric: "tabular-nums" }}> ({months * 30} days)</span>
      </label>
      <input id="duration" type="range" min={1} max={maxMonths} value={months} step={1}
        onChange={e => onChange(Number(e.target.value))}
        aria-valuetext={`${months} months`}
        style={{ width: "100%", accentColor: T.ink }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: T.ink3, fontVariantNumeric: "tabular-nums" }}>
        <span>1 month</span><span>{maxMonths} months</span>
      </div>
    </div>
  );
}
