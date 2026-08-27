// Risk & price-level cards: target price + required move, break-even ladder,
// maximum simulated drawdown.

import React from "react";
import { T, monoFigure, body, plColor } from "../../styles/theme.js";
import { SpecRow, Numeral } from "../ui.jsx";
import { fmtUSD, fmtPrice } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";

export function TargetPriceCard({ refPrice, targetPrice, targetPct, symbol }) {
  return (
    <div>
      <SpecRow label={`${symbol} current price`}>{fmtPrice(refPrice)}</SpecRow>
      <SpecRow label="Your target price">{fmtPrice(targetPrice)}</SpecRow>
      <SpecRow label="Required move" last>
        <span style={{ color: plColor(targetPct) }}>+{targetPct}%</span>
      </SpecRow>
    </div>
  );
}

export function BreakEvenCard({ breakEven, refPrice, hasFees }) {
  return (
    <div>
      <div style={{ ...body, marginBottom: 4 }}>
        Price levels your accumulated units need{hasFees ? " (fees included)" : ""}, based on total invested ÷ units:
      </div>
      {breakEven.map((b, i) => {
        const movePct = refPrice > 0 ? ((b.price - refPrice) / refPrice) * 100 : 0;
        return (
          <SpecRow key={b.roiPct} label={b.roiPct === 0 ? "Break-even (0% ROI)" : `+${b.roiPct}% ROI`} last={i === breakEven.length - 1}>
            {fmtPrice(b.price)} <span style={{ ...monoFigure, color: T.ink3 }}>({fmtPct(movePct)} from live)</span>
          </SpecRow>
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
        <Numeral size={28} color={dd < -8 ? T.loss : T.ink}>{fmtPct(dd)}</Numeral>
        <span style={body}>maximum {mode === "backtest" ? "" : "simulated "}drawdown along the plan</span>
      </div>
      {dd < 0 && (
        <div style={{ ...body, marginTop: 8 }}>
          Peak-to-trough: <span style={{ ...monoFigure }}>{fmtUSD(drawdown.peak)} → {fmtUSD(drawdown.trough)}</span>
          {drawdown.recoveryIdx !== null
            ? <> · recovered within the plan (by buy #{drawdown.recoveryIdx + 1})</>
            : <> · had not recovered by the last purchase</>}
        </div>
      )}
      <div style={{ ...body, color: T.ink3, marginTop: 8 }}>
        Portfolio value measured at each purchase point along the {mode === "backtest" ? "actual historical" : "simulated"} path. Your real drawdown can be deeper between purchases.
      </div>
    </div>
  );
}
