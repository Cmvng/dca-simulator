import React from "react";
import {
  formatPercent,
  formatPrice,
  formatTokenAmount,
  formatUsd,
} from "../lib/onchain/formatters.js";

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

function levelValue(price, valuation, valueMode, plan) {
  if (valueMode === "price") return Number(price);
  const attached = valueMode === "marketCap" ? valuation?.marketCapUsd : valuation?.fdvUsd;
  if (finitePositive(attached)) return Number(attached);
  const multiplier = plan?.valuationScales?.[valueMode]?.multiplier;
  return finitePositive(price) && finitePositive(multiplier) ? Number(price) * Number(multiplier) : null;
}

function formatLevel(price, valuation, valueMode, plan) {
  const value = levelValue(price, valuation, valueMode, plan);
  if (!finitePositive(value)) return "Unavailable";
  return valueMode === "price" ? formatPrice(value) : formatUsd(value, { compact: true });
}

function unitLabel(valueMode) {
  if (valueMode === "marketCap") return "implied market cap";
  return valueMode === "fdv" ? "implied FDV" : "price";
}

export default function ExecutionMap({ plan, tokenSymbol, reviewDays, reviewBy, valueMode = "price" }) {
  if (!plan?.quality?.canPlan || !plan.legs?.length) return null;

  const symbol = String(tokenSymbol || "TOKEN").toUpperCase();
  const modeLabel = plan.mode === "adaptive"
    ? "Support-based execution ladder"
    : "Volatility-reference execution ladder";

  return (
    <section className="execution-map" aria-labelledby="execution-map-title">
      <header className="execution-map__header">
        <div>
          <span>Price-trigger execution map</span>
          <h3 id="execution-map-title">B1–B4 buys · S1 target reference · X1 close-below reassess</h3>
        </div>
        <span className="execution-map__window">{reviewDays}-day review</span>
      </header>

      <div className="execution-map__notice">
        <strong>{modeLabel}</strong>
        <span>No buy date is predicted. Values are shown in {unitLabel(valueMode)}; a buy matters only if price enters its band.</span>
      </div>

      <div className="execution-map__buys" aria-label="Potential buy zones">
        {plan.legs.map(leg => (
          <article className="execution-step execution-step--buy" key={leg.id}>
            <span className="execution-step__id">{leg.id}</span>
            <div className="execution-step__main">
              <span>Potential buy zone</span>
              <strong>{formatLevel(leg.lower, leg.valuation?.lower, valueMode, plan)} – {formatLevel(leg.upper, leg.valuation?.upper, valueMode, plan)}</strong>
              <small>{valueMode === "price" ? "" : `${formatPrice(leg.lower)} – ${formatPrice(leg.upper)} · `}{formatPercent(leg.drawdownPct)} from live · {leg.rationale}</small>
            </div>
            <div className="execution-step__amount">
              <strong>{leg.allocationPct}% · {formatUsd(leg.amountUsd)}</strong>
              <span>≈ {formatTokenAmount(leg.tokenAmount)} {symbol}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="execution-map__outcomes">
        <article className="execution-outcome execution-outcome--target">
          <span className="execution-step__id">S1</span>
          <div>
            <span>S1 conditional target reference</span>
            <strong>{formatLevel(plan.targetPrice, plan.target?.valuation, valueMode, plan)} · +{plan.targetPct}% from average</strong>
            <small>{valueMode === "price" ? "" : `${formatPrice(plan.targetPrice)} price · `}active only after planned fills · no sell allocation or executed sale is modeled · position value {formatUsd(plan.targetValue)}</small>
          </div>
        </article>
        <article className="execution-outcome execution-outcome--risk">
          <span className="execution-step__id">X1</span>
          <div>
            <span>X1 close-below manual reassessment</span>
            <strong>{formatLevel(plan.invalidationPrice, plan.reassessment?.valuation, valueMode, plan)}</strong>
            <small>{valueMode === "price" ? "" : `${formatPrice(plan.invalidationPrice)} price · `}selected-timeframe candle CLOSE below X1 required; a wick does not count · manual only, not an automatic stop or executed sale · {formatUsd(plan.reassessment?.capitalAtRiskUsd)} modeled loss at exact X1 after all fills; gaps can lose more</small>
          </div>
        </article>
      </div>

      <footer className="execution-map__footer">
        <span>Monitoring window</span>
        <strong>Review by {reviewBy}</strong>
        <small>Simulation only—no orders are placed. MCAP/FDV levels assume the current reported supply ratio. Recheck sooner if liquidity, pool, or volatility changes materially.</small>
      </footer>
    </section>
  );
}
