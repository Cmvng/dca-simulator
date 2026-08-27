// Scenario-mode results page — Phase 56 hierarchy:
// plan → market → outcome → scenarios → reality check → comparison → risk →
// entries chart/timeline → share/save → methodology.

import React, { Suspense, useMemo } from "react";
import { G, card, secLabel } from "../../styles/theme.js";
import { InfoRow } from "../ui.jsx";
import { Skeleton } from "../LoadingState.jsx";
import { fmtUSD, fmtPrice, fmtTok, fmtUSDPrecise } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { marketConditions } from "../../lib/simulation/scoring.js";
import MarketSnapshot from "./MarketSnapshot.jsx";
import ScenarioGrid from "./ScenarioGrid.jsx";
import RealityCheck from "./RealityCheck.jsx";
import MarketConditions from "./MarketConditions.jsx";
import StrategyComparison from "./StrategyComparison.jsx";
import RollingWindows from "./RollingWindows.jsx";
import { TargetPriceCard, BreakEvenCard, DrawdownCard } from "./RiskCards.jsx";
import PortfolioChart from "./PortfolioChart.jsx";
import DcaTimeline from "./DcaTimeline.jsx";
import WaitForDip from "./WaitForDip.jsx";
import Methodology from "./Methodology.jsx";

const MonteCarloCard = React.lazy(() => import("./MonteCarloCard.jsx"));

export default function ResultsView({ sim, selected, analysis, live, history, targetPct, months, shareSlot, shareRef }) {
  const symbol = selected.symbol.toUpperCase();
  const conditions = useMemo(
    () => analysis ? marketConditions(analysis, sim.reality?.ok ? sim.reality : null) : null,
    [analysis, sim]
  );
  const hasFees = sim.totalFees > 0;
  const aggressive = sim.reality?.ok && (sim.reality.label === "Ambitious" || sim.reality.label === "Extreme");

  return (
    <>
      {/* ── YOUR PLAN ── */}
      <section style={card} aria-label="Your DCA plan">
        <div style={secLabel}>Your DCA plan · {symbol}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 14, fontWeight: 700, color: G.text }}>
          <span>{fmtUSD(sim.totalInvested)} deployed</span>
          <span aria-hidden="true" style={{ color: G.border }}>·</span>
          <span>{sim.entries} purchases</span>
          <span aria-hidden="true" style={{ color: G.border }}>·</span>
          <span>{sim.windowDays} days</span>
          <span aria-hidden="true" style={{ color: G.border }}>·</span>
          <span>≈ {fmtUSDPrecise(sim.amtPer)} each</span>
          {hasFees && (<><span aria-hidden="true" style={{ color: G.border }}>·</span><span style={{ color: G.amber }}>fees {fmtUSD(sim.totalFees)}</span></>)}
        </div>
        <div style={{ fontSize: 12, color: G.muted, marginTop: 6 }}>
          Historical sample used: last {sim.windowDays} days · entries modeled on that window scaled to the live price (see methodology)
        </div>
      </section>

      {/* ── CURRENT MARKET ── */}
      <section style={card} aria-label="Current market">
        <div style={secLabel}>Current market</div>
        <MarketSnapshot analysis={analysis} live={live} selected={selected} history={history} />
      </section>

      {/* ── YOUR SIMULATED OUTCOME ── */}
      <section aria-label="Your simulated outcome" style={{ borderRadius: 18, padding: "24px", marginBottom: 14, background: "linear-gradient(135deg,#F0FDF4,#DCFCE7)", border: `2px solid ${G.greenBorder}` }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: G.green, letterSpacing: 1.5, textTransform: "uppercase" }}>
          🎯 Your target scenario
        </div>
        <div style={{ fontSize: 13, color: G.muted, marginTop: 4 }}>
          IF {symbol} reaches {fmtPrice(sim.targetPrice)} (+{targetPct}%) — your chosen test case, not a forecast
        </div>
        <div style={{ fontSize: "clamp(36px,6vw,54px)", fontWeight: 900, lineHeight: 1.05, margin: "8px 0 4px", color: G.green }}>
          {fmtUSD(sim.targetVal)}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: G.dark, marginBottom: aggressive ? 12 : 0 }}>
          You'd profit <span style={{ color: G.green }}>+{fmtUSD(sim.targetProfit)}</span> on {fmtUSD(sim.totalInvested)} invested
          <span style={{ background: G.green, color: "#fff", borderRadius: 20, padding: "2px 12px", fontSize: 14, marginLeft: 8 }}>+{sim.targetROI.toFixed(0)}%</span>
        </div>
        {aggressive && (
          <div style={{ background: G.amberPale, border: `1px solid ${G.amberBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: G.amber }}>
            ⚠️ The Reality Check below rates this target <strong>{sim.reality.label}</strong> for a {sim.windowDays}-day window.
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <TargetPriceCard refPrice={sim.refPrice} targetPrice={sim.targetPrice} targetPct={targetPct} symbol={symbol} />
        </div>
      </section>

      {/* ── SCENARIOS ── */}
      <section style={card} aria-label="Scenarios">
        <div style={secLabel}>Scenarios — how this plan ends under different moves</div>
        <ScenarioGrid scenarios={sim.scenarios} totalInvested={sim.totalInvested} />
      </section>

      {/* ── REALITY CHECK ── */}
      {sim.reality?.ok && (
        <section style={card} aria-label="Reality check">
          <div style={secLabel}>Reality check</div>
          <RealityCheck reality={sim.reality} windowDays={sim.windowDays} />
        </section>
      )}

      {/* ── ROBUSTNESS ── */}
      {sim.rolling?.ok && (
        <section style={card} aria-label="Historical robustness">
          <div style={secLabel}>If history repeated — best, median, worst</div>
          <RollingWindows rolling={sim.rolling} windowDays={sim.windowDays} />
        </section>
      )}

      {/* ── DCA vs LUMP SUM ── */}
      <section style={card} aria-label="DCA versus lump sum">
        <div style={secLabel}>DCA vs hybrid vs lump sum</div>
        <StrategyComparison comparison={sim.comparison} targetPct={targetPct} capital={sim.config.capital} />
      </section>

      {/* ── MARKET CONDITIONS ── */}
      <section style={card} aria-label="Market conditions">
        <div style={secLabel}>Market conditions — behind the verdict</div>
        <MarketConditions conditions={conditions} analysis={analysis} />
      </section>

      {/* ── RISK ── */}
      <section style={card} aria-label="Risk">
        <div style={secLabel}>Risk</div>
        <DrawdownCard drawdown={sim.drawdown} mode="scenario" />
        <div style={{ height: 1, background: G.border, margin: "14px 0" }} />
        <BreakEvenCard breakEven={sim.breakEven} refPrice={sim.refPrice} hasFees={hasFees} />
      </section>

      {/* ── DISTRIBUTION MODE (advanced) ── */}
      {sim.config && sim.monteCarloOn && (
        <section style={card} aria-label="Distribution of outcomes">
          <div style={secLabel}>Distribution mode · 10,000 paths</div>
          <Suspense fallback={<Skeleton height={140} />}>
            <MonteCarloCard sim={sim} seed={sim.seed} />
          </Suspense>
        </section>
      )}

      {/* ── ENTRIES ── */}
      <section style={card} aria-label="Your entries">
        <div style={secLabel}>Your entries — simulated path</div>
        <PortfolioChart series={sim.series} avgEntry={sim.avgEntry} mode="scenario" />
        <div style={{ marginTop: 12 }}>
          <InfoRow label="Entry price range">{fmtPrice(sim.simLow)} – {fmtPrice(sim.simHigh)}</InfoRow>
          <InfoRow label="Window volatility">{sim.volPct.toFixed(1)}%</InfoRow>
          <InfoRow label="Avg entry (vol-adjusted)">
            <span style={{ color: sim.avgEntry <= sim.refPrice ? G.green : G.amber }}>
              {fmtPrice(sim.avgEntry)} {sim.avgEntry < sim.refPrice ? "(below live ↓)" : "(above live ↑)"}
            </span>
          </InfoRow>
          <InfoRow label={`Total ${symbol} accumulated`}>{fmtTok(sim.units)}</InfoRow>
          <InfoRow label="Value at live price" last>
            <span style={{ color: sim.currentROI >= 0 ? G.green : G.red }}>{fmtUSD(sim.currentVal)} ({fmtPct(sim.currentROI)})</span>
          </InfoRow>
        </div>
      </section>

      <DcaTimeline series={sim.series} symbol={symbol} hasFees={hasFees} />

      <WaitForDip waitForDip={sim.waitForDip} targetPct={targetPct} />

      {/* ── SHARE / SAVE ── */}
      <div ref={shareRef}>{shareSlot}</div>

      {/* ── METHODOLOGY ── */}
      <Methodology mode="scenario" />
    </>
  );
}
