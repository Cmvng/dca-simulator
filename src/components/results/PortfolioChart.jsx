// Interactive SVG portfolio chart — no chart library, ~4KB.
// Shows: simulated price path (right axis), cumulative invested and portfolio
// value (left axis), average entry (dashed) and each DCA purchase (dots).
// Hover/touch snaps to the nearest purchase. The DcaTimeline table below the
// chart is the screen-reader/data alternative to this graphic.

import React, { useMemo, useRef, useState } from "react";
import { G } from "../../styles/theme.js";
import { fmtUSD, fmtPrice, fmtTok } from "../../lib/formatting/money.js";
import { fmtDateShort } from "../../lib/formatting/dates.js";

const W = 700, H = 280, PAD_L = 56, PAD_R = 62, PAD_T = 16, PAD_B = 30;

export default function PortfolioChart({ series, avgEntry, mode }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const model = useMemo(() => {
    if (!series?.length) return null;
    const xs = series.map((_, i) => i);
    const moneyVals = series.flatMap(s => [s.value, s.cumInvested]);
    const priceVals = series.map(s => s.price).concat([avgEntry]);
    const mMax = Math.max(...moneyVals) * 1.05, mMin = 0;
    const pMax = Math.max(...priceVals) * 1.02, pMin = Math.min(...priceVals) * 0.98;
    const x = i => PAD_L + (i / Math.max(1, xs.length - 1)) * (W - PAD_L - PAD_R);
    const yM = v => PAD_T + (1 - (v - mMin) / (mMax - mMin || 1)) * (H - PAD_T - PAD_B);
    const yP = v => PAD_T + (1 - (v - pMin) / (pMax - pMin || 1)) * (H - PAD_T - PAD_B);
    const path = (get, y) => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(s)).toFixed(1)}`).join("");
    return { x, yM, yP, path, mMax, pMin, pMax };
  }, [series, avgEntry]);

  if (!model) return null;
  const { x, yM, yP, path } = model;

  const onMove = e => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const hovered = hover !== null ? series[hover] : null;
  const ticksY = 4, ticksX = Math.min(4, series.length - 1);

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      {/* legend — labels + line styles, never color alone */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: G.muted, marginBottom: 6 }}>
        <LegendItem color={G.green} label="Portfolio value" />
        <LegendItem color={G.muted} dash label="Amount invested" />
        <LegendItem color={G.blue} thin label={mode === "backtest" ? "Actual price" : "Simulated price"} />
        <LegendItem color={G.amber} dash label="Avg entry" />
      </div>

      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Chart of ${series.length} DCA purchases: portfolio value, amount invested and ${mode === "backtest" ? "actual" : "simulated"} price over the plan. The purchase table below contains the same data.`}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        >
          {/* gridlines + $ axis */}
          {Array.from({ length: ticksY + 1 }, (_, i) => {
            const v = (model.mMax / ticksY) * i;
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yM(v)} y2={yM(v)} stroke={G.border} strokeWidth="1" />
                <text x={PAD_L - 6} y={yM(v) + 4} textAnchor="end" fontSize="10" fill={G.muted}>{fmtUSD(v)}</text>
              </g>
            );
          })}
          {/* price axis (right) */}
          {Array.from({ length: 3 }, (_, i) => {
            const v = model.pMin + ((model.pMax - model.pMin) / 2) * i;
            return <text key={i} x={W - PAD_R + 6} y={yP(v) + 4} fontSize="10" fill={G.blue} opacity="0.75">{fmtPrice(v)}</text>;
          })}
          {/* x-axis dates */}
          {Array.from({ length: ticksX + 1 }, (_, i) => {
            const idx = Math.round((i / ticksX) * (series.length - 1));
            return <text key={i} x={x(idx)} y={H - 8} textAnchor="middle" fontSize="10" fill={G.muted}>{fmtDateShort(series[idx].date)}</text>;
          })}

          {/* invested (stepped, dashed) */}
          <path d={path(s => s.cumInvested, yM)} fill="none" stroke={G.muted} strokeWidth="1.5" strokeDasharray="5 4" />
          {/* portfolio value area + line */}
          <path d={`${path(s => s.value, yM)}L${x(series.length - 1)},${yM(0)}L${x(0)},${yM(0)}Z`} fill={G.green} opacity="0.08" />
          <path d={path(s => s.value, yM)} fill="none" stroke={G.green} strokeWidth="2.5" strokeLinejoin="round" />
          {/* price path (right axis) */}
          <path d={path(s => s.price, yP)} fill="none" stroke={G.blue} strokeWidth="1.2" opacity="0.65" />
          {/* avg entry */}
          <line x1={PAD_L} x2={W - PAD_R} y1={yP(avgEntry)} y2={yP(avgEntry)} stroke={G.amber} strokeWidth="1.2" strokeDasharray="6 4" />

          {/* purchase markers on price path */}
          {series.map((s, i) => (
            <circle key={i} cx={x(i)} cy={yP(s.price)} r={series.length > 60 ? 1.6 : 3}
              fill="#fff" stroke={G.blue} strokeWidth="1.4" />
          ))}

          {/* hover crosshair */}
          {hovered && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke={G.dark} strokeWidth="1" opacity="0.35" />
              <circle cx={x(hover)} cy={yM(hovered.value)} r="4.5" fill={G.green} stroke="#fff" strokeWidth="1.5" />
              <circle cx={x(hover)} cy={yP(hovered.price)} r="4" fill={G.blue} stroke="#fff" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {hovered && (
          <div style={{
            position: "absolute", top: 8,
            left: hover / series.length < 0.5 ? "auto" : 8,
            right: hover / series.length < 0.5 ? 8 : "auto",
            background: "rgba(5,46,22,0.94)", color: "#fff", borderRadius: 10,
            padding: "10px 13px", fontSize: 12, lineHeight: 1.6, pointerEvents: "none", minWidth: 168,
          }}>
            <div style={{ fontWeight: 800 }}>Buy #{hover + 1} · {fmtDateShort(hovered.date)}</div>
            <div>Price: <strong>{fmtPrice(hovered.price)}</strong></div>
            <div>Contribution: <strong>{fmtUSD(hovered.gross)}</strong></div>
            <div>Units: <strong>{fmtTok(hovered.units)}</strong></div>
            <div>Cum. units: <strong>{fmtTok(hovered.cumUnits)}</strong></div>
            <div>Cum. capital: <strong>{fmtUSD(hovered.cumInvested)}</strong></div>
            <div>Avg entry: <strong>{fmtPrice(hovered.avgEntry)}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, dash, thin, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width="22" height="8" aria-hidden="true">
        <line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth={thin ? 1.2 : 2.5} strokeDasharray={dash ? "5 3" : "none"} />
      </svg>
      {label}
    </span>
  );
}
