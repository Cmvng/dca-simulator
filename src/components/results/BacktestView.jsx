// HISTORICAL BACKTEST results — real prices, real dates, clearly labeled as
// materially different from the scenario simulator. CLEAR BLUE: one hero
// numeral with a soft delta badge, everything else in gentle spec rows.

import React from "react";
import { T, SANS, monoLabel, monoFigure, body, plColor, pillSoft } from "../../styles/theme.js";
import { Section, SpecRow, Numeral, useCountUp, DeltaBadge } from "../ui.jsx";
import { fmtUSD, fmtPrice, fmtTok } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { fmtDate } from "../../lib/formatting/dates.js";
import PortfolioChart from "./PortfolioChart.jsx";
import BuyBarcode from "./BuyBarcode.jsx";
import DcaTimeline from "./DcaTimeline.jsx";
import { DrawdownCard } from "./RiskCards.jsx";

const caption = { fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3 };

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
      <Section ariaLabel="Historical backtest result" label={`Historical backtest · ${symbol}`} eyebrow>
        <div style={{ ...monoLabel, marginBottom: 16 }}>
          Real {symbol} prices · {fmtDate(bt.startDate)} → {fmtDate(bt.endDate)}
        </div>
        <Numeral size={58}>{fmtUSD(heroVal)}</Numeral>
        <div style={{ marginTop: 14 }}>
          <DeltaBadge profit={profit} roiPct={bt.roiPct} suffix="modeled on historical prices" />
        </div>
        <div style={{ ...body, marginTop: 14 }}>
          Historical {symbol} prices are unscaled; the purchase schedule, contribution amounts, and configured fees and slippage are modeled. Taxes and additional market impact are not included. Past performance does not determine future results.
        </div>
      </Section>

      {/* ── DETAILS ── */}
      <Section ariaLabel="Backtest details" label="Backtest details" eyebrow>
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
      <Section ariaLabel="DCA versus lump sum in this period" label="DCA vs lump sum · same period, real prices" eyebrow>
        {strategies.map(s => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: T.card2, borderRadius: 16, padding: "12px 14px", marginBottom: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: s.best ? 700 : 500, color: T.ink, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {s.name}
              {s.best && (
                <span aria-label="ahead in this period" style={{ ...pillSoft, fontSize: 11, padding: "3px 10px" }}>ahead</span>
              )}
            </span>
            <span style={{ textAlign: "right" }}>
              <div style={monoFigure}>{fmtUSD(s.value)}</div>
              <div style={{ ...monoFigure, color: plColor(s.roi) }}>{fmtPct(s.roi)}</div>
            </span>
          </div>
        ))}
        <div style={{ ...body, color: T.ink, marginTop: 10 }}>
          <span style={{ fontWeight: 600 }}>{dcaBeatLump ? "DCA" : "Lump sum"}</span> ends {fmtUSD(Math.abs(bt.endValue - bt.lump.endValue))} ahead.
          <span style={{ color: T.ink3 }}> In this specific period. Neither strategy always wins — it depends on the price path.</span>
        </div>
      </Section>

      {/* ── ENTRIES ── */}
      <Section ariaLabel="Backtest chart" label="Price path · actual prices" eyebrow>
        <PortfolioChart series={bt.series} avgEntry={bt.avgEntry} mode="backtest" />
        <div style={{ marginTop: 10 }}>
          <BuyBarcode entries={bt.entries} madeCount={bt.entries} currentIndex={null} />
          <div style={{ ...caption, marginTop: 6 }}>
            One tick per modeled scheduled buy — all {bt.entries} are simulated against this historical period.
          </div>
        </div>
      </Section>

      {/* ── RISK ── */}
      <Section ariaLabel="Backtest risk" label="Risk in this period" eyebrow>
        <DrawdownCard drawdown={bt.drawdown} mode="backtest" />
      </Section>

      <DcaTimeline series={bt.series} symbol={symbol} hasFees={hasFees} />
    </>
  );
}
