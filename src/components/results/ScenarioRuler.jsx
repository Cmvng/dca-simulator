// Outcome ruler — the scenario set as a single measuring instrument.
// One horizontal hairline axis spanning worst→best move; each scenario is a
// small diamond marker at its movePct with a stacked mono label (name, ending
// value, and for the target its signed ROI). Replaces all scenario cards.
// Pure hairline + markers: no fills, no backgrounds, no animation.

import React from "react";
import { T, MONO, SANS } from "../../styles/theme.js";
import { fmtUSD } from "../../lib/formatting/money.js";

const W = 640, H = 150, PAD_X = 34, AXIS_Y = 78;
const LINE_H = 13;      // label stack line height (11px mono)
const CHAR_W = 6.6;     // approx mono 11px character advance, for clamping

// short marker names derived from scenario id
const SHORT = {
  histWorst: "worst-like",
  severe: "−50%",
  moderate: "−20%",
  flat: "flat",
  target: "target",
  histBest: "best-like",
};

const diamond = (cx, cy, r) =>
  `M${cx},${cy - r}L${cx + r},${cy}L${cx},${cy + r}L${cx - r},${cy}Z`;

const strokeFor = s =>
  s.id === "target" ? T.ink
  : s.id === "severe" ? T.lossDeep
  : s.movePct < 0 ? T.loss
  : s.movePct > 0 ? T.gain
  : T.ink3;

export default function ScenarioRuler({ scenarios, totalInvested }) {
  if (!scenarios?.length) return null;

  // sort by movePct so label stacks alternate above/below in axis order
  const sorted = [...scenarios].sort((a, b) => a.movePct - b.movePct);
  const min = sorted[0].movePct, max = sorted[sorted.length - 1].movePct;
  const span = max - min || 1;
  const x = m => PAD_X + ((m - min) / span) * (W - 2 * PAD_X);

  // clamp a label stack's x so text never leaves the viewBox
  const clampX = (cx, textLen) => {
    const half = (textLen * CHAR_W) / 2;
    return Math.max(half + 4, Math.min(W - half - 4, cx));
  };

  const aria =
    `Outcome ruler for ${fmtUSD(totalInvested)} invested. ` +
    scenarios.map(s => `${s.name}: ${fmtUSD(s.value)}`).join(", ") +
    ". Test cases, not predictions.";

  const bases = scenarios.filter(s => (s.id === "histWorst" || s.id === "histBest") && s.basis);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* the axis: one hairline with small end ticks */}
        <line x1={x(min)} x2={x(max)} y1={AXIS_Y} y2={AXIS_Y} stroke={T.line} strokeWidth="1" />
        <line x1={x(min)} x2={x(min)} y1={AXIS_Y - 4} y2={AXIS_Y + 4} stroke={T.line} strokeWidth="1" />
        <line x1={x(max)} x2={x(max)} y1={AXIS_Y - 4} y2={AXIS_Y + 4} stroke={T.line} strokeWidth="1" />

        {sorted.map((s, i) => {
          const isTarget = s.id === "target";
          const cx = x(s.movePct);
          const stroke = strokeFor(s);
          const name = SHORT[s.id] || String(s.name || "").toLowerCase();
          const value = fmtUSD(s.value);
          const roiText = isTarget
            ? `${s.roiPct >= 0 ? "+" : "−"}${Math.abs(Math.round(s.roiPct))}%`
            : null;
          const lines = roiText ? 3 : 2;
          const above = i % 2 === 0;
          const lx = clampX(cx, Math.max(name.length, value.length, roiText ? roiText.length : 0));
          // baseline of label line k (0 = top of stack)
          const yAt = k => above
            ? AXIS_Y - 14 - LINE_H * (lines - 1 - k)
            : AXIS_Y + 20 + LINE_H * k;
          return (
            <g key={s.id}>
              {isTarget
                ? <path d={diamond(cx, AXIS_Y, 6)} fill={T.ink} />
                : <path d={diamond(cx, AXIS_Y, 4.5)} fill={T.paper} stroke={stroke} strokeWidth="1.2" />}
              <text x={lx} y={yAt(0)} textAnchor="middle" fontFamily={MONO} fontSize="11" letterSpacing="0.05em" fill={isTarget ? T.ink : T.ink3}>{name}</text>
              <text x={lx} y={yAt(1)} textAnchor="middle" fontFamily={MONO} fontSize="11" fill={T.ink} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</text>
              {roiText && (
                <text x={lx} y={yAt(2)} textAnchor="middle" fontFamily={MONO} fontSize="11" fill={s.roiPct >= 0 ? T.gain : T.loss} style={{ fontVariantNumeric: "tabular-nums" }}>{roiText}</text>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", textTransform: "lowercase", color: T.ink3, marginTop: 8 }}>
        each marker: the plan's ending value if the price moves by that amount · test cases, not predictions
      </div>
      {bases.length > 0 && (
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink3, marginTop: 4, lineHeight: 1.6 }}>
          {bases.map(s => `${SHORT[s.id]}: ${s.basis}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
