import React from "react";
import {
  formatPercent,
  formatPrice,
  formatTokenAmount,
  formatUsd,
} from "../lib/onchain/formatters.js";

export default function ExecutionMap({ plan, tokenSymbol, reviewDays, reviewBy }) {
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
          <h3 id="execution-map-title">B1–B4 buys · S1 conditional exit</h3>
        </div>
        <span className="execution-map__window">{reviewDays}-day review</span>
      </header>

      <div className="execution-map__notice">
        <strong>{modeLabel}</strong>
        <span>No buy date is predicted. A buy becomes relevant only if price enters its band.</span>
      </div>

      <div className="execution-map__buys" aria-label="Potential buy zones">
        {plan.legs.map(leg => (
          <article className="execution-step execution-step--buy" key={leg.id}>
            <span className="execution-step__id">{leg.id}</span>
            <div className="execution-step__main">
              <span>Potential buy zone</span>
              <strong>{formatPrice(leg.lower)} – {formatPrice(leg.upper)}</strong>
              <small>{formatPercent(leg.drawdownPct)} from live · {leg.rationale}</small>
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
            <span>Conditional target</span>
            <strong>{formatPrice(plan.targetPrice)} · +{plan.targetPct}% from average</strong>
            <small>Applies only after all planned buys fill · simulated value {formatUsd(plan.targetValue)}</small>
          </div>
        </article>
        <article className="execution-outcome execution-outcome--risk">
          <span className="execution-step__id">X1</span>
          <div>
            <span>Reassess below</span>
            <strong>{formatPrice(plan.invalidationPrice)}</strong>
            <small>{plan.mode === "adaptive" ? "Structural invalidation" : "Scenario floor"} · not an automatic stop order</small>
          </div>
        </article>
      </div>

      <footer className="execution-map__footer">
        <span>Monitoring window</span>
        <strong>Review by {reviewBy}</strong>
        <small>Simulation only—no orders are placed. Recheck sooner if liquidity, pool, or volatility changes materially.</small>
      </footer>
    </section>
  );
}
