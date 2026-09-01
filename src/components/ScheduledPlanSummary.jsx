import React, { useId } from "react";
import { formatPercent, formatPrice, formatUsd } from "../lib/onchain/formatters.js";

const finiteNumber = value => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value));

function formatPlanLevel(level, valueMode) {
  if (!level) return "—";
  if (valueMode === "marketCap") {
    return finiteNumber(level.valuation?.marketCapUsd)
      ? formatUsd(level.valuation.marketCapUsd, { compact: true })
      : "Unavailable";
  }
  if (valueMode === "fdv") {
    return finiteNumber(level.valuation?.fdvUsd)
      ? formatUsd(level.valuation.fdvUsd, { compact: true })
      : "Unavailable";
  }
  return finiteNumber(level.priceUsd) ? formatPrice(level.priceUsd) : "—";
}

function rangeCopy(volatility) {
  const lower = volatility?.range?.lower?.priceUsd;
  const current = volatility?.range?.current?.priceUsd;
  const upper = volatility?.range?.upper?.priceUsd;
  if (!finiteNumber(lower) || !finiteNumber(current) || !finiteNumber(upper) || Number(current) <= 0) {
    return "Recent price history did not support a reliable range.";
  }
  const downside = ((Number(lower) / Number(current)) - 1) * 100;
  const upside = ((Number(upper) / Number(current)) - 1) * 100;
  return `${formatPercent(downside, 0)} to ${formatPercent(upside, 0)} illustrative sample range`;
}

function terminalCopy(event) {
  if (!event) return "Neither level was reached in this example path.";
  return event.kind === "target-close"
    ? "An example candle closed at the profit target; no sale is modeled."
    : "An example candle closed at the risk-review level; no sale is modeled.";
}

export default function ScheduledPlanSummary({ plan, valueMode = "price" }) {
  const reactId = useId().replace(/:/g, "");
  const headingId = `scheduled-plan-summary-${reactId}`;
  if (!plan?.canSimulate) return null;

  const schedule = plan.schedule || {};
  const volatility = plan.volatility || {};
  const category = volatility.category || "Measured";
  const dailySwing = finiteNumber(volatility.typicalDailySwingPct)
    ? `~${Number(volatility.typicalDailySwingPct).toFixed(1)}% typical daily swing`
    : "Daily swing unavailable";
  const targetPct = finiteNumber(plan.target?.targetPct)
    ? Number(plan.target.targetPct)
    : finiteNumber(plan.inputs?.targetPct)
      ? Number(plan.inputs.targetPct)
      : null;

  return (
    <section className="scheduled-plan-summary" aria-labelledby={headingId}>
      <header className="scheduled-plan-summary__header">
        <div>
          <span>Your plan at a glance</span>
          <h3 id={headingId}>What to expect from this simulation</h3>
        </div>
        <span className="scheduled-plan-summary__unit">
          {valueMode === "marketCap" ? "Implied market cap" : valueMode === "fdv" ? "Implied FDV" : "Price"}
        </span>
      </header>

      <dl className="scheduled-plan-summary__facts">
        <div>
          <dt>BUY schedule</dt>
          <dd>
            <strong>{schedule.purchaseCount || 0} buys · {formatUsd(schedule.amountPerBuyUsd)} each</strong>
            <span>{plan.frequency?.label || "Selected frequency"} for {schedule.durationDays || plan.inputs?.durationDays || "—"} days</span>
          </dd>
        </div>
        <div>
          <dt>Volatility</dt>
          <dd>
            <strong>{category} · {dailySwing}</strong>
            <span>{rangeCopy(volatility)}</span>
          </dd>
        </div>
        <div className="scheduled-plan-summary__target">
          <dt>PROFIT TARGET</dt>
          <dd>
            <strong>{formatPlanLevel(plan.target, valueMode)}</strong>
            <span>{targetPct === null ? "Chosen conditional target" : `Conditional close at +${targetPct}% from the simulated average buy`}</span>
          </dd>
        </div>
        <div className="scheduled-plan-summary__risk">
          <dt>RISK REVIEW</dt>
          <dd>
            <strong>{formatPlanLevel(plan.review, valueMode)}</strong>
            <span>Pause new buys and review if the simulated candle closes below this level</span>
          </dd>
        </div>
      </dl>

      <p className="scheduled-plan-summary__result">{terminalCopy(plan.terminalEvent)} This is one volatility-based example, not a prediction.</p>
    </section>
  );
}
