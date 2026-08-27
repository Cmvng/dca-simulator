// Interactive SVG portfolio chart — no chart library, ~4KB.
// Shows: simulated price path (right axis) as the signature --blue-deep line
// over a faint --paper-2 area fill, cumulative invested and portfolio value
// (left axis), and the dashed --blue-soft average-entry rule.
// Hover/touch snaps to the nearest purchase. The DcaTimeline table below the
// chart is the screen-reader/data alternative to this graphic.

import React, { useMemo, useRef, useState } from "react";
import { T, MONO, SANS } from "../../styles/theme.js";
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
    <div>
      {/* legend — labels + line styles, never color alone */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", textTransform: "lowercase", color: T.ink3, marginBottom: 8 }}>
        <LegendItem color={T.ink} width={1.5} label="portfolio value" />
        <LegendItem color={T.ink3} width={1} dash="4 3" label="amount invested" />
        <LegendItem color={T.blueDeep} width={1.5} label={mode === "backtest" ? "actual price" : "simulated price"} />
        <LegendItem color={T.blueSoft} width={1} dash="6 4" label="avg entry" />
      </div>

      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Chart of ${series.length} DCA purchases: portfolio value, amount invested and ${mode === "backtest" ? "actual" : "simulated"} price over the plan. The purchase table below contains the same data.`}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        >
          {/* price-path area fill — solid --paper-2, drawn first so gridlines stay legible over it */}
          <path d={`${path(s => s.price, yP)}L${x(series.length - 1)},${H - PAD_B}L${x(0)},${H - PAD_B}Z`} fill={T.paper2} />

          {/* gridlines + $ axis */}
          {Array.from({ length: ticksY + 1 }, (_, i) => {
            const v = (model.mMax / ticksY) * i;
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yM(v)} y2={yM(v)} stroke={T.line} strokeWidth="1" />
                <text x={PAD_L - 6} y={yM(v) + 4} textAnchor="end" fontSize="10" fontFamily={MONO} fill={T.ink3}>{fmtUSD(v)}</text>
              </g>
            );
          })}
          {/* price axis (right) */}
          {Array.from({ length: 3 }, (_, i) => {
            const v = model.pMin + ((model.pMax - model.pMin) / 2) * i;
            return <text key={i} x={W - PAD_R + 6} y={yP(v) + 4} fontSize="10" fontFamily={MONO} fill={T.ink3}>{fmtPrice(v)}</text>;
          })}
          {/* x-axis dates */}
          {Array.from({ length: ticksX + 1 }, (_, i) => {
            const idx = Math.round((i / ticksX) * (series.length - 1));
            return <text key={i} x={x(idx)} y={H - 8} textAnchor="middle" fontSize="10" fontFamily={MONO} fill={T.ink3}>{fmtDateShort(series[idx].date)}</text>;
          })}

          {/* invested (dashed) */}
          <path d={path(s => s.cumInvested, yM)} fill="none" stroke={T.ink3} strokeWidth="1" strokeDasharray="4 3" />
          {/* portfolio value */}
          <path d={path(s => s.value, yM)} fill="none" stroke={T.ink} strokeWidth="1.5" strokeLinejoin="round" />
          {/* price path (right axis) */}
          <path d={path(s => s.price, yP)} fill="none" stroke={T.blueDeep} strokeWidth="1.5" strokeLinejoin="round" />
          {/* avg entry rule */}
          <line x1={PAD_L} x2={W - PAD_R} y1={yP(avgEntry)} y2={yP(avgEntry)} stroke={T.blueSoft} strokeWidth="1" strokeDasharray="6 4" />

          {/* hover crosshair + active dots (the only dots on the chart) */}
          {hovered && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke={T.ink3} strokeWidth="1" />
              <circle cx={x(hover)} cy={yM(hovered.value)} r="3.5" fill={T.ink} />
              <circle cx={x(hover)} cy={yP(hovered.price)} r="3" fill={T.blueDeep} />
            </g>
          )}
        </svg>

        {hovered && (
          <div style={{
            position: "absolute", top: 8,
            left: hover / series.length < 0.5 ? "auto" : 8,
            right: hover / series.length < 0.5 ? 8 : "auto",
            background: T.ink, color: "#FFFFFF", borderRadius: 2,
            padding: "9px 12px", fontFamily: SANS, fontSize: 11, fontWeight: 400,
            lineHeight: 1.7, pointerEvents: "none", minWidth: 176,
          }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Buy #{hover + 1} · {fmtDateShort(hovered.date)}</div>
            <TipRow label="Price" value={fmtPrice(hovered.price)} />
            <TipRow label="Contribution" value={fmtUSD(hovered.gross)} />
            <TipRow label="Units" value={fmtTok(hovered.units)} />
            <TipRow label="Cum. units" value={fmtTok(hovered.cumUnits)} />
            <TipRow label="Cum. capital" value={fmtUSD(hovered.cumInvested)} />
            <TipRow label="Avg entry" value={fmtPrice(hovered.avgEntry)} />
          </div>
        )}
      </div>
    </div>
  );
}

function TipRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function LegendItem({ color, width, dash, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width="22" height="8" aria-hidden="true">
        <line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth={width} strokeDasharray={dash || "none"} />
      </svg>
      {label}
    </span>
  );
}
