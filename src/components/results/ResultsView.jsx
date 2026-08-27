// Scenario-mode results page — CLEAR BLUE. Hierarchy unchanged:
// plan → market → outcome → scenarios → reality check → robustness →
// comparison → conditions → risk → distribution → entries → timeline →
// wait-for-dip → share/save → methodology.
// A stack of soft floating white cards on the blue-grey backdrop; one hero
// numeral counts up once, everything else stays calm and friendly.

import React, { Suspense, useMemo } from "react";
import { T, SANS, monoLabel, body, plColor } from "../../styles/theme.js";
import { Section, SpecRow, Numeral, useCountUp, DeltaBadge, ToneBadge } from "../ui.jsx";
import { Skeleton } from "../LoadingState.jsx";
import { fmtUSD, fmtPrice, fmtTok, fmtUSDPrecise } from "../../lib/formatting/money.js";
import { fmtPct } from "../../lib/formatting/percentage.js";
import { marketConditions } from "../../lib/simulation/scoring.js";
import MarketSnapshot from "./MarketSnapshot.jsx";
import ScenarioBars from "./ScenarioBars.jsx";
import RealityCheck from "./RealityCheck.jsx";
import MarketConditions from "./MarketConditions.jsx";
import StrategyComparison from "./StrategyComparison.jsx";
import RollingWindows from "./RollingWindows.jsx";
import { TargetPriceCard, BreakEvenCard, DrawdownCard } from "./RiskCards.jsx";
import PortfolioChart from "./PortfolioChart.jsx";
import BuyBarcode from "./BuyBarcode.jsx";
import DcaTimeline from "./DcaTimeline.jsx";
import WaitForDip from "./WaitForDip.jsx";
import Methodology from "./Methodology.jsx";
import AssumptionsDrawer from "../AssumptionsDrawer.jsx";

const MonteCarloCard = React.lazy(() => import("./MonteCarloCard.jsx"));

export default function ResultsView({ sim, selected, analysis, live, history, targetPct, shareSlot, shareRef }) {
  const symbol = selected.symbol.toUpperCase();
  const conditions = useMemo(
    () => analysis ? marketConditions(analysis, sim.reality?.ok ? sim.reality : null) : null,
    [analysis, sim]
  );
  const hasFees = sim.totalFees > 0;
  const aggressive = sim.reality?.ok && (sim.reality.label === "Ambitious" || sim.reality.label === "Extreme");

  // ONE count-up on results reveal — the hero numeral only.
  const heroVal = useCountUp(sim.targetVal);
  const profit = sim.targetProfit;

  return (
    <>
      {/* ── YOUR PLAN ── */}
      <Section ariaLabel="Your DCA plan" eyebrow label={`Your DCA plan · ${symbol}`}>
        <SpecRow label="Deployed">{fmtUSD(sim.totalInvested)}</SpecRow>
        <SpecRow label="Purchases">{sim.entries}</SpecRow>
        <SpecRow label="Duration">{sim.windowDays} days</SpecRow>
        <SpecRow label="Per purchase" last={!hasFees}>≈ {fmtUSDPrecise(sim.amtPer)}</SpecRow>
        {hasFees && <SpecRow label="Fees" last>{fmtUSD(sim.totalFees)}</SpecRow>}
        <div style={{ ...body, marginTop: 10 }}>
          Historical sample: the last {sim.windowDays} days · entries modeled on that window, scaled to the live price (see methodology).
        </div>
      </Section>

      {/* ── CURRENT MARKET ── */}
      <Section ariaLabel="Current market" eyebrow label="Current market">
        <MarketSnapshot analysis={analysis} live={live} history={history} />
      </Section>

      {/* ── YOUR SIMULATED OUTCOME — the hero ── */}
      <Section ariaLabel="Your simulated outcome" style={{ padding: 26 }}>
        <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: T.ink2, marginBottom: 14 }}>
          If {selected.name} reaches {fmtPrice(sim.targetPrice)} (+{targetPct}%)
        </div>
        <Numeral size={58}>{fmtUSD(heroVal)}</Numeral>
        <div style={{ marginTop: 14 }}>
          <DeltaBadge profit={profit} roiPct={sim.targetROI} suffix="a scenario, not a forecast" />
        </div>
        <div style={{ ...body, marginTop: 14 }}>
          You&apos;d end with {fmtUSD(sim.targetVal)} on {fmtUSD(sim.totalInvested)} invested — if your chosen scenario plays out.
        </div>
        <div style={{ marginTop: 18 }}>
          <TargetPriceCard refPrice={sim.refPrice} targetPrice={sim.targetPrice} targetPct={targetPct} symbol={symbol} />
        </div>
        {aggressive && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ToneBadge tone={sim.reality.tone}>{sim.reality.label}</ToneBadge>
            <span style={{ ...body, fontSize: 12.5 }}>
              the reality check below rates this target for a {sim.windowDays}-day window.
            </span>
          </div>
        )}
      </Section>

      {/* ── SCENARIOS ── */}
      <Section ariaLabel="Scenarios" eyebrow label={`Stress test · ${sim.windowDays}-day window`}>
        <ScenarioBars scenarios={sim.scenarios} totalInvested={sim.totalInvested} />
      </Section>

      {/* ── REALITY CHECK ── */}
      {sim.reality?.ok && (
        <Section ariaLabel="Reality check" eyebrow label="Reality check">
          <RealityCheck reality={sim.reality} windowDays={sim.windowDays} />
        </Section>
      )}

      {/* ── ROBUSTNESS ── */}
      {sim.rolling?.ok && (
        <Section ariaLabel="Historical robustness" eyebrow label="If history repeated · best, median, worst">
          <RollingWindows rolling={sim.rolling} windowDays={sim.windowDays} />
        </Section>
      )}

      {/* ── DCA vs LUMP SUM ── */}
      <Section ariaLabel="DCA versus lump sum" eyebrow label="DCA vs hybrid vs lump sum">
        <StrategyComparison comparison={sim.comparison} targetPct={targetPct} capital={sim.config.capital} />
      </Section>

      {/* ── MARKET CONDITIONS ── */}
      <Section ariaLabel="Market conditions" eyebrow label="Market conditions · behind the verdict">
        <MarketConditions conditions={conditions} analysis={analysis} />
      </Section>

      {/* ── RISK ── */}
      <Section ariaLabel="Risk" eyebrow label="Risk">
        <DrawdownCard drawdown={sim.drawdown} mode="scenario" />
        <div style={{ borderTop: `1px solid ${T.line}`, margin: "16px 0" }} />
        <BreakEvenCard breakEven={sim.breakEven} refPrice={sim.refPrice} hasFees={hasFees} />
      </Section>

      {/* ── DISTRIBUTION MODE (advanced) ── */}
      {sim.config && sim.monteCarloOn && (
        <Section ariaLabel="Distribution of outcomes" eyebrow label="Distribution mode · 10,000 paths">
          <Suspense fallback={<Skeleton height={140} />}>
            <MonteCarloCard sim={sim} seed={sim.seed} />
          </Suspense>
        </Section>
      )}

      {/* ── ENTRIES ── */}
      <Section ariaLabel="Your entries" eyebrow label={`Price path · ${sim.windowDays}-day sample`}>
        <PortfolioChart series={sim.series} avgEntry={sim.avgEntry} mode="scenario" />
        <div style={{ marginTop: 10 }}>
          <BuyBarcode entries={sim.entries} madeCount={0} currentIndex={0} />
          <div style={{ ...monoLabel, fontWeight: 500, marginTop: 6, marginBottom: 0 }}>
            One tick per scheduled buy · the tall tick is today
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <SpecRow label="Entry price range">{fmtPrice(sim.simLow)} – {fmtPrice(sim.simHigh)}</SpecRow>
          <SpecRow label="Window volatility">{sim.volPct.toFixed(1)}%</SpecRow>
          <SpecRow label="Avg entry (vol-adjusted)">
            {fmtPrice(sim.avgEntry)} {sim.avgEntry < sim.refPrice ? "(below live ↓)" : "(above live ↑)"}
          </SpecRow>
          <SpecRow label={`Total ${symbol} accumulated`}>{fmtTok(sim.units)}</SpecRow>
          <SpecRow label="Value at live price" last>
            <span style={{ color: plColor(sim.currentROI) }}>{fmtUSD(sim.currentVal)} ({fmtPct(sim.currentROI)})</span>
          </SpecRow>
        </div>
      </Section>

      <DcaTimeline series={sim.series} symbol={symbol} hasFees={hasFees} />

      <WaitForDip waitForDip={sim.waitForDip} targetPct={targetPct} />

      {/* ── SHARE / SAVE ── */}
      <div ref={shareRef}>{shareSlot}</div>

      {/* ── ASSUMPTIONS + METHODOLOGY ── */}
      <AssumptionsDrawer sim={sim} mode="scenario" />
      <Methodology mode="scenario" />
    </>
  );
}
