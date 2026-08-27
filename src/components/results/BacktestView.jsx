// HISTORICAL BACKTEST results — real prices, real dates, clearly labeled as
// materially different from the scenario simulator.

import React from "react";
import { G, card, secLabel } from "../../styles/theme.js";
import { InfoRow } from "../ui.jsx";
import { fmtUSD, fmtPrice, fmtTok } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { fmtDate } from "../../lib/formatting/dates.js";
import PortfolioChart from "./PortfolioChart.jsx";
import DcaTimeline from "./DcaTimeline.jsx";
import { DrawdownCard } from "./RiskCards.jsx";

export default function BacktestView({ bt, selected }) {
  if (!bt?.ok) return null;
  const gain = bt.roiPct >= 0;
  const symbol = selected.symbol.toUpperCase();
  const hasFees = bt.totalFees > 0;
  const dcaBeatLump = bt.endValue >= bt.lump.endValue;

  return (
    <>
      <div style={{ borderRadius: 18, padding: "22px", marginBottom: 14, background: G.bluePale, border: "2px solid #BFDBFE" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: G.blue, letterSpacing: 1.5, textTransform: "uppercase" }}>
          📜 Historical backtest — what actually happened
        </div>
        <div style={{ fontSize: 13, color: G.muted, marginTop: 4 }}>
          Real {symbol} prices from {fmtDate(bt.startDate)} to {fmtDate(bt.endDate)} — no scaling, no assumptions. Past performance does not determine future results.
        </div>
        <div style={{ fontSize: "clamp(34px,6vw,50px)", fontWeight: 900, lineHeight: 1.05, margin: "10px 0 4px", color: gain ? G.green : G.red }}>
          {fmtUSD(bt.endValue)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: G.dark }}>
          {fmtUSD(bt.totalInvested)} invested → {gain ? "gained" : "lost"} {fmtUSD(Math.abs(bt.endValue - bt.totalInvested))}
          <span style={{ background: gain ? G.green : G.red, color: "#fff", borderRadius: 20, padding: "2px 12px", fontSize: 14, marginLeft: 8 }}>{fmtPct(bt.roiPct)}</span>
        </div>
      </div>

      <section style={card} aria-label="Backtest details">
        <div style={secLabel}>Backtest details</div>
        <InfoRow label="Period">{fmtDate(bt.startDate)} → {fmtDate(bt.endDate)}</InfoRow>
        <InfoRow label="Purchases">{bt.entries} × {fmtUSD(bt.amtPer)}</InfoRow>
        <InfoRow label="Total invested">{fmtUSD(bt.totalInvested)}</InfoRow>
        {hasFees && <InfoRow label="Total fees">{fmtUSD(bt.totalFees)}</InfoRow>}
        <InfoRow label={`${symbol} accumulated`}>{fmtTok(bt.units)}</InfoRow>
        <InfoRow label="Average entry">{fmtPrice(bt.avgEntry)}</InfoRow>
        <InfoRow label="Final price">{fmtPrice(bt.endPrice)}</InfoRow>
        <InfoRow label="Ending value" last>
          <span style={{ color: gain ? G.green : G.red }}>{fmtUSD(bt.endValue)} ({fmtPct(bt.roiPct)})</span>
        </InfoRow>
      </section>

      <section style={card} aria-label="DCA versus lump sum in this period">
        <div style={secLabel}>DCA vs lump sum — same period, real prices</div>
        <InfoRow label={`DCA (${bt.entries} buys)`}>
          <span style={{ color: bt.roiPct >= 0 ? G.green : G.red }}>{fmtUSD(bt.endValue)} ({fmtPct(bt.roiPct)})</span>
        </InfoRow>
        <InfoRow label={`Lump sum on ${fmtDate(bt.startDate)}`}>
          <span style={{ color: bt.lump.roiPct >= 0 ? G.green : G.red }}>{fmtUSD(bt.lump.endValue)} ({fmtPct(bt.lump.roiPct)})</span>
        </InfoRow>
        <InfoRow label="Difference" last>
          <strong>{dcaBeatLump ? "DCA" : "Lump sum"}</strong>&nbsp;ahead by {fmtUSD(Math.abs(bt.endValue - bt.lump.endValue))}
        </InfoRow>
        <div style={{ fontSize: 12, color: G.muted, marginTop: 8 }}>In this specific period. Neither strategy always wins — it depends on the price path.</div>
      </section>

      <section style={card} aria-label="Backtest chart">
        <div style={secLabel}>Your entries — actual prices</div>
        <PortfolioChart series={bt.series} avgEntry={bt.avgEntry} mode="backtest" />
      </section>

      <section style={card} aria-label="Backtest risk">
        <div style={secLabel}>Risk in this period</div>
        <DrawdownCard drawdown={bt.drawdown} mode="backtest" />
      </section>

      <DcaTimeline series={bt.series} symbol={symbol} hasFees={hasFees} />
    </>
  );
}
