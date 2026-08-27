// Buy barcode — the DCA schedule as a machined scale under the price path.
// Evenly spaced vertical ticks on a hairline baseline: --blue ticks = buys
// made, one taller --ink tick = "you are here", --ink-3 ticks = remaining.

import React from "react";
import { T, MONO } from "../../styles/theme.js";

const W = 640, PAD_X = 3;

export default function BuyBarcode({ entries, madeCount = 0, currentIndex = null, height = 26 }) {
  if (!entries || entries < 1) return null;

  const baseY = height - 2;
  const x = i => entries === 1
    ? W / 2
    : PAD_X + (i / (entries - 1)) * (W - 2 * PAD_X);
  const dense = entries > 120; // every tick still drawn, but at 1px to stay crisp

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${height}`} role="img"
        aria-label={`dca schedule: ${entries} purchases, ${madeCount} made`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <line x1="0" x2={W} y1={baseY} y2={baseY} stroke={T.line} strokeWidth="1" />
        {Array.from({ length: entries }, (_, i) => {
          const isCurrent = currentIndex !== null && i === currentIndex;
          const made = i < madeCount;
          const h = isCurrent ? 18 : made ? 12 : 9;
          const w = isCurrent ? 2 : made ? (dense ? 1 : 1.5) : 1;
          const color = isCurrent ? T.ink : made ? T.blue : T.ink3;
          return <line key={i} x1={x(i)} x2={x(i)} y1={baseY - h} y2={baseY} stroke={color} strokeWidth={w} />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, letterSpacing: "0.05em", color: T.ink3, marginTop: 3 }}>
        <span>buy 1</span>
        <span>buy {entries}</span>
      </div>
    </div>
  );
}
