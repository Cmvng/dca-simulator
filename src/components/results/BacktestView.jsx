// HISTORICAL BACKTEST results — real prices, real dates, clearly labeled as
// materially different from the scenario simulator. INSTRUMENT sheet:
// one hero numeral, everything else whispers in hairlines and mono.

import React from "react";
import { T, SANS, MONO, HAIRLINE_2, monoLabel, monoFigure, body, plColor } from "../../styles/theme.js";
import { Section, SpecRow, Numeral, useCountUp } from "../ui.jsx";
import { fmtUSD, fmtPrice, fmtTok } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { fmtDate } from "../../lib/formatting/dates.js";
import PortfolioChart from "./PortfolioChart.jsx";
import BuyBarcode from "./BuyBarcode.jsx";
import DcaTimeline from "./DcaTimeline.jsx";
import { DrawdownCard } from "./RiskCards.jsx";

export default function BacktestView({ bt, selected }) {
  // ONE count-up on results reveal — the hero numeral only (hook stays
  // unconditional; the guard below only affects rendering).
  const heroVal = useCountUp(bt?.ok ? bt.endValue : 0);
  if (!bt?.ok) return null;

  const symbol = selected.symbol.toUpperCase();
  const hasFees = bt.totalFees > 0;
  const profit = bt.endValue - bt.totalInvested;
  const dcaBeatLump = bt.endValue >= bt.lump.endValue;
  const strategies = [
    { id: "dca", name: `DCA (${bt.entries} buys)`, value: bt.endValue, roi: bt.roiPct, best: dcaBeatLump },
    { id: "lump", name: `Lump sum on ${fmtDate(bt.startDate)}`, value: bt.lump.endValue, roi: bt.lump.roiPct, best: !dcaBeatLump },
  ];

  return (
    <>
      {/* ── THE RESULT — hero numeral ── */}
      <Section ariaLabel="Historical backtest result" label={`historical backtest · ${selected.symbol.toLowerCase()}`}>
        <div style={{ ...monoLabel, marginBottom: 14 }}>
          real {symbol.toLowerCase()} prices · {fmtDate(bt.startDate)} → {fmtDate(bt.endDate)}
        </div>
        <Numeral size={60}>{fmtUSD(heroVal)}</Numeral>
        <div style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: "tabular-nums", marginTop: 12, color: T.ink3 }}>
          <span style={{ color: plColor(profit) }}>{profit >= 0 ? "+" : "−"}{fmtUSD(Math.abs(profit))}</span>
          {" · "}
          <span style={{ color: plColor(bt.roiPct) }}>{bt.roiPct >= 0 ? "+" : "−"}{Math.abs(bt.roiPct).toFixed(0)}%</span>
          {" · what actually happened"}
        </div>
        <div style={{ ...body, marginTop: 12 }}>
          Real {symbol} prices — no scaling, no assumptions. Past performance does not determine future results.
        </div>
      </Section>

      {/* ── DETAILS ── */}
      <Section ariaLabel="Backtest details" label="backtest details">
        <SpecRow label="Period">{fmtDate(bt.startDate)} → {fmtDate(bt.endDate)}</SpecRow>
        <SpecRow label="Purchases">{bt.entries} × {fmtUSD(bt.amtPer)}</SpecRow>
        <SpecRow label="Total invested">{fmtUSD(bt.totalInvested)}</SpecRow>
        {hasFees && <SpecRow label="Total fees">{fmtUSD(bt.totalFees)}</SpecRow>}
        <SpecRow label={`${symbol} accumulated`}>{fmtTok(bt.units)}</SpecRow>
        <SpecRow label="Average entry">{fmtPrice(bt.avgEntry)}</SpecRow>
        <SpecRow label="Final price">{fmtPrice(bt.endPrice)}</SpecRow>
        <SpecRow label="Ending value" last>
          <span style={{ color: plColor(bt.roiPct) }}>{fmtUSD(bt.endValue)} ({fmtPct(bt.roiPct)})</span>
        </SpecRow>
      </Section>

      {/* ── DCA vs LUMP SUM ── */}
      <Section ariaLabel="DCA versus lump sum in this period" label="dca vs lump sum · same period, real prices">
        {strategies.map((s, i) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: i === strategies.length - 1 ? "none" : HAIRLINE_2 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: s.best ? 500 : 400, color: T.ink }}>
              {s.name}
              {s.best && (
                <span aria-label="ahead in this period" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", color: T.ink3 }}> · ahead</span>
              )}
            </span>
            <span style={{ textAlign: "right" }}>
              <div style={monoFigure}>{fmtUSD(s.value)}</div>
              <div style={{ ...monoFigure, color: plColor(s.roi) }}>{fmtPct(s.roi)}</div>
            </span>
          </div>
        ))}
        <div style={{ ...body, color: T.ink, marginTop: 10 }}>
          <span style={{ fontWeight: 500 }}>{dcaBeatLump ? "DCA" : "Lump sum"}</span> ends {fmtUSD(Math.abs(bt.endValue - bt.lump.endValue))} ahead.
          <span style={{ color: T.ink3 }}> In this specific period. Neither strategy always wins — it depends on the price path.</span>
        </div>
      </Section>

      {/* ── ENTRIES ── */}
      <Section ariaLabel="Backtest chart" label="price path · actual prices">
        <PortfolioChart series={bt.series} avgEntry={bt.avgEntry} mode="backtest" />
        <div style={{ marginTop: 10 }}>
          <BuyBarcode entries={bt.entries} madeCount={bt.entries} currentIndex={null} />
          <div style={{ ...monoLabel, marginTop: 6, marginBottom: 0 }}>
            one tick per executed buy — all {bt.entries} were made in this period
          </div>
        </div>
      </Section>

      {/* ── RISK ── */}
      <Section ariaLabel="Backtest risk" label="risk in this period">
        <DrawdownCard drawdown={bt.drawdown} mode="backtest" />
      </Section>

      <DcaTimeline series={bt.series} symbol={symbol} hasFees={hasFees} />
    </>
  );
}
