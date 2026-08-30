// Interactive SVG portfolio chart — no chart library, ~4KB.
// CLEAR BLUE: the simulated price path as the one vivid --blue line over a
// soft --blue-soft area, portfolio value in --ink, cumulative invested as a
// dashed --ink-3 line, and the dashed deep-blue average-entry rule.
// Hover/touch snaps to the nearest purchase. The DcaTimeline table below the
// chart is the screen-reader/data alternative to this graphic.

import React, { useMemo, useRef, useState } from "react";
import { T, SANS, CARD_SHADOW } from "../../styles/theme.js";
import { fmtUSD, fmtPrice, fmtTok } from "../../lib/formatting/money.js";
import { fmtDateShort } from "../../lib/formatting/dates.js";

const W = 700, H = 280, PAD_L = 56, PAD_R = 62, PAD_T = 16, PAD_B = 30;
const ACTION_ORANGE = "#D86B16";

export default function PortfolioChart({ series, avgEntry, mode, targetPrice = null }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const model = useMemo(() => {
    if (!series?.length) return null;
    const xs = series.map((_, i) => i);
    const moneyVals = series.flatMap(s => [s.value, s.cumInvested]);
    const normalizedTarget = Number(targetPrice);
    const validTarget = Number.isFinite(normalizedTarget) && normalizedTarget > 0
      ? normalizedTarget
      : null;
    const priceVals = series
      .map(s => s.price)
      .concat([avgEntry], validTarget === null ? [] : [validTarget]);
    const mMax = Math.max(...moneyVals) * 1.05, mMin = 0;
    const pMax = Math.max(...priceVals) * 1.02, pMin = Math.min(...priceVals) * 0.98;
    const x = i => PAD_L + (i / Math.max(1, xs.length - 1)) * (W - PAD_L - PAD_R);
    const yM = v => PAD_T + (1 - (v - mMin) / (mMax - mMin || 1)) * (H - PAD_T - PAD_B);
    const yP = v => PAD_T + (1 - (v - pMin) / (pMax - pMin || 1)) * (H - PAD_T - PAD_B);
    const path = (get, y) => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(s)).toFixed(1)}`).join("");
    const markerStep = Math.max(1, Math.ceil(series.length / 12));
    const buyMarkerIndexes = series
      .map((_, index) => index)
      .filter(index => index === 0 || index === series.length - 1 || index % markerStep === 0);
    const targetIndex = validTarget !== null
      ? series.findIndex(point => point.price >= validTarget)
      : -1;
    const worstIndex = series.reduce(
      (lowest, point, index) => point.price < series[lowest].price ? index : lowest,
      0,
    );
    return { x, yM, yP, path, mMax, pMin, pMax, buyMarkerIndexes, targetIndex, validTarget, worstIndex };
  }, [series, avgEntry, targetPrice]);

  if (!model) return null;
  const { x, yM, yP, path, buyMarkerIndexes, targetIndex, validTarget, worstIndex } = model;

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
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: SANS, fontSize: 11, fontWeight: 500, color: T.ink3, marginBottom: 8 }}>
        <LegendItem color={T.ink} width={2} label="Portfolio value" />
        <LegendItem color={T.ink3} width={1} dash="4 3" label="Amount invested" />
        <LegendItem color={T.blue} width={2} label={mode === "backtest" ? "Actual price" : "Simulated price"} />
        <LegendItem color={T.bluePress} width={1.5} dash="6 4" label="Avg entry" />
        <MarkerLegend color={T.gain} glyph="+" label={mode === "backtest" ? "Sampled modeled backtest buys" : "Sampled simulated buys"} />
        {validTarget !== null && <LegendItem color={ACTION_ORANGE} width={1.5} dash="5 4" label="Conditional S target · no sale modeled" />}
        {targetIndex >= 0 && <MarkerLegend color={ACTION_ORANGE} glyph="−" label="First target crossing · no sale modeled" />}
        <MarkerLegend color={T.loss} glyph="!" label="Lowest sample price · not an exit" />
      </div>

      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Chart of ${series.length} DCA purchases: portfolio value, amount invested and ${mode === "backtest" ? "actual" : "simulated"} price over the plan. The purchase table below contains the same data.`}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        >
          {/* price-path area fill — soft blue tint, drawn first so gridlines stay legible over it */}
          <path d={`${path(s => s.price, yP)}L${x(series.length - 1)},${H - PAD_B}L${x(0)},${H - PAD_B}Z`} fill={T.blueSoft} />

          {/* gridlines + $ axis */}
          {Array.from({ length: ticksY + 1 }, (_, i) => {
            const v = (model.mMax / ticksY) * i;
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yM(v)} y2={yM(v)} stroke={T.line} strokeWidth="1" />
                <text x={PAD_L - 6} y={yM(v) + 4} textAnchor="end" fontSize="11" fontWeight="500" fontFamily={SANS} fill={T.ink3}>{fmtUSD(v)}</text>
              </g>
            );
          })}
          {/* price axis (right) */}
          {Array.from({ length: 3 }, (_, i) => {
            const v = model.pMin + ((model.pMax - model.pMin) / 2) * i;
            return <text key={i} x={W - PAD_R + 6} y={yP(v) + 4} fontSize="11" fontWeight="500" fontFamily={SANS} fill={T.ink3}>{fmtPrice(v)}</text>;
          })}
          {/* x-axis dates */}
          {Array.from({ length: ticksX + 1 }, (_, i) => {
            const idx = ticksX === 0 ? 0 : Math.round((i / ticksX) * (series.length - 1));
            return <text key={i} x={x(idx)} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="500" fontFamily={SANS} fill={T.ink3}>{fmtDateShort(series[idx].date)}</text>;
          })}

          {/* invested (dashed) */}
          <path d={path(s => s.cumInvested, yM)} fill="none" stroke={T.ink3} strokeWidth="1" strokeDasharray="4 3" />
          {/* portfolio value */}
          <path d={path(s => s.value, yM)} fill="none" stroke={T.ink} strokeWidth="2" strokeLinejoin="round" />
          {/* price path (right axis) */}
          <path d={path(s => s.price, yP)} fill="none" stroke={T.blue} strokeWidth="2" strokeLinejoin="round" />
          {/* avg entry rule */}
          <line x1={PAD_L} x2={W - PAD_R} y1={yP(avgEntry)} y2={yP(avgEntry)} stroke={T.bluePress} strokeWidth="1.5" strokeDasharray="6 4" />

          {/* Conditional scenario target. It is a reference line, never an executed sale. */}
          {validTarget !== null && (
            <g aria-hidden="true" pointerEvents="none">
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yP(validTarget)}
                y2={yP(validTarget)}
                stroke={ACTION_ORANGE}
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <rect
                x={W - PAD_R - 92}
                y={yP(validTarget) - 10}
                width="89"
                height="20"
                rx="6"
                fill="#FFF3E8"
                stroke={ACTION_ORANGE}
              />
              <text
                x={W - PAD_R - 8}
                y={yP(validTarget) + 3.5}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="700"
                fontFamily={SANS}
                fill="#7A3100"
              >
                S · conditional
              </text>
            </g>
          )}

          {/* Fomo-style action markers. These are explicitly scoped to this simulation/backtest. */}
          {buyMarkerIndexes.map(index => (
            <ChartMarker
              key={`buy-${index}`}
              x={x(index)}
              y={yP(series[index].price)}
              color={T.gain}
              glyph="+"
            />
          ))}
          {targetIndex >= 0 && (
            <ChartMarker
              x={x(targetIndex)}
              y={yP(series[targetIndex].price)}
              color={ACTION_ORANGE}
              glyph="−"
              above
            />
          )}
          {worstIndex >= 0 && (
            <ChartMarker
              x={x(worstIndex)}
              y={yP(series[worstIndex].price)}
              color={T.loss}
              glyph="!"
              above
            />
          )}

          {/* hover crosshair + active dots (the only dots on the chart) */}
          {hovered && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke={T.ink3} strokeWidth="1" />
              <circle cx={x(hover)} cy={yM(hovered.value)} r="3.5" fill={T.ink} />
              <circle cx={x(hover)} cy={yP(hovered.price)} r="3" fill={T.blue} />
            </g>
          )}
        </svg>

        {hovered && (
          <div style={{
            position: "absolute", top: 8,
            left: hover / series.length < 0.5 ? "auto" : 8,
            right: hover / series.length < 0.5 ? 8 : "auto",
            background: T.card, color: T.ink, borderRadius: 12,
            border: `1px solid ${T.line}`, boxShadow: CARD_SHADOW,
            padding: "10px 12px", fontFamily: SANS, fontSize: 11, fontWeight: 500,
            lineHeight: 1.7, pointerEvents: "none", minWidth: 176,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Buy #{hover + 1} · {fmtDateShort(hovered.date)}</div>
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
      <span style={{ color: T.ink2 }}>{label}</span>
      <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
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

function MarkerLegend({ color, glyph, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span aria-hidden="true" style={{ width: 16, height: 16, display: "grid", placeItems: "center", color: "#fff", borderRadius: "50%", background: color, fontSize: 12, fontWeight: 800, lineHeight: 1 }}>{glyph}</span>
      {label}
    </span>
  );
}

function ChartMarker({ x, y, color, glyph, above = false }) {
  const cy = y + (above ? -13 : 13);
  return (
    <g aria-hidden="true" pointerEvents="none">
      <line x1={x} x2={x} y1={y} y2={cy} stroke={color} strokeWidth="1.5" opacity=".72" />
      <circle cx={x} cy={cy} r="8.5" fill={color} stroke="#fff" strokeWidth="1.4" />
      <text x={x} y={cy + 3.7} textAnchor="middle" fontSize="12" fontWeight="800" fontFamily={SANS} fill="#fff">{glyph}</text>
    </g>
  );
}
