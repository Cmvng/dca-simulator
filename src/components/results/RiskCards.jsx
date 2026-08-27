// Risk & price-level cards: target price + required move, break-even ladder,
// maximum simulated drawdown.

import React from "react";
import { G } from "../../styles/theme.js";
import { InfoRow } from "../ui.jsx";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

export function TargetPriceCard({ refPrice, targetPrice, targetPct, symbol }) {
  return (
    <div>
      <InfoRow label={`${symbol} current price`}>{fmtPrice(refPrice)}</InfoRow>
      <InfoRow label="Your target price">{fmtPrice(targetPrice)}</InfoRow>
      <InfoRow label="Required move" last>
        <span style={{ color: G.green, fontWeight: 800 }}>+{targetPct}%</span>
      </InfoRow>
    </div>
  );
}

export function BreakEvenCard({ breakEven, refPrice, hasFees }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: G.muted, marginBottom: 8, lineHeight: 1.5 }}>
        Price levels your accumulated units need{hasFees ? " (fees included)" : ""}, based on total invested ÷ units:
      </div>
      {breakEven.map((b, i) => {
        const movePct = refPrice > 0 ? ((b.price - refPrice) / refPrice) * 100 : 0;
        return (
          <InfoRow key={b.roiPct} label={b.roiPct === 0 ? "Break-even (0% ROI)" : `+${b.roiPct}% ROI`} last={i === breakEven.length - 1}>
            {fmtPrice(b.price)} <span style={{ color: G.muted, fontWeight: 500 }}>({fmtPct(movePct)} from live)</span>
          </InfoRow>
        );
      })}
    </div>
  );
}

export function DrawdownCard({ drawdown, mode }) {
  if (!drawdown) return null;
  const dd = drawdown.drawdownPct;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 26, fontWeight: 900, color: dd < -20 ? G.red : dd < -8 ? G.amber : G.text }}>
          {dd.toFixed(1)}%
        </span>
        <span style={{ fontSize: 13, color: G.muted }}>maximum {mode === "backtest" ? "" : "simulated "}drawdown along the plan</span>
      </div>
      {dd < 0 && (
        <div style={{ fontSize: 13, color: G.muted, marginTop: 8, lineHeight: 1.6 }}>
          Peak-to-trough: <strong style={{ color: G.text }}>{fmtUSD(drawdown.peak)} → {fmtUSD(drawdown.trough)}</strong>
          {drawdown.recoveryIdx !== null
            ? <> · recovered within the plan (by buy #{drawdown.recoveryIdx + 1})</>
            : <> · had not recovered by the last purchase</>}
        </div>
      )}
      <div style={{ fontSize: 12, color: G.muted, marginTop: 8 }}>
        Portfolio value measured at each purchase point along the {mode === "backtest" ? "actual historical" : "simulated"} path. Your real drawdown can be deeper between purchases.
      </div>
    </div>
  );
}
