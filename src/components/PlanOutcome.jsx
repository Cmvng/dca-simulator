import React, { useId, useMemo } from "react";
import {
  formatPercent,
  formatPrice,
  formatTokenAmount,
  formatUsd,
} from "../lib/onchain/formatters.js";

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const finiteNumber = value => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value));

function normalizeValueMode(valueMode) {
  if (valueMode === "marketCap" || valueMode === "mcap") return "marketCap";
  return valueMode === "fdv" ? "fdv" : "price";
}

function readCurrentMarket({ market, currentPrice, currentMarketCap, currentFdv }) {
  return {
    price: finitePositive(currentPrice ?? market?.priceUsd)
      ? Number(currentPrice ?? market?.priceUsd)
      : null,
    marketCap: finitePositive(currentMarketCap ?? market?.marketCapUsd)
      ? Number(currentMarketCap ?? market?.marketCapUsd)
      : null,
    fdv: finitePositive(currentFdv ?? market?.fdvUsd)
      ? Number(currentFdv ?? market?.fdvUsd)
      : null,
  };
}

function projectedValue(price, valueMode, attachedValuation, plan, current) {
  if (!finitePositive(price)) return null;
  const numericPrice = Number(price);
  if (valueMode === "price") return numericPrice;

  const attached = valueMode === "marketCap"
    ? attachedValuation?.marketCapUsd
    : attachedValuation?.fdvUsd;
  if (finitePositive(attached)) return Number(attached);

  const scale = plan?.valuationScales?.[valueMode];
  if (scale?.available && finitePositive(scale.multiplier)) {
    return numericPrice * Number(scale.multiplier);
  }

  const currentValuation = current[valueMode];
  if (finitePositive(current.price) && finitePositive(currentValuation)) {
    return Number(currentValuation) * (numericPrice / Number(current.price));
  }
  return null;
}

function formatPlanValue(value, valueMode) {
  return valueMode === "price" ? formatPrice(value) : formatUsd(value, { compact: true });
}

function valueModeLabel(valueMode) {
  if (valueMode === "marketCap") return "market cap";
  return valueMode === "fdv" ? "FDV" : "price";
}

function mixedUnitLabel(valueMode) {
  const baseLabel = `Zone levels in ${valueModeLabel(valueMode)} · position outcomes in USD`;
  return valueMode === "price"
    ? baseLabel
    : `${baseLabel} · implied from the current valuation-to-price ratio; constant token supply assumed`;
}

function volatilityEnvelopePercentages(volatilityOutlook) {
  const currentPrice = volatilityOutlook?.current?.priceUsd;
  if (!finitePositive(currentPrice)) return { downsidePct: null, upsidePct: null };

  const lowerPrice = volatilityOutlook?.lower?.priceUsd;
  const upperPrice = volatilityOutlook?.upper?.priceUsd;
  return {
    downsidePct: finiteNumber(lowerPrice) && Number(lowerPrice) >= 0
      ? ((Number(lowerPrice) / Number(currentPrice)) - 1) * 100
      : null,
    upsidePct: finitePositive(upperPrice)
      ? ((Number(upperPrice) / Number(currentPrice)) - 1) * 100
      : null,
  };
}

function formatVolatilityEnvelope({ downsidePct, upsidePct }) {
  const downside = finiteNumber(downsidePct)
    ? `${formatPercent(downsidePct, 0)} downside`
    : null;
  const upside = finiteNumber(upsidePct)
    ? `${formatPercent(upsidePct, 0)} upside`
    : null;
  return [downside, upside].filter(Boolean).join(" · ") || "—";
}

function deriveScenarios(plan, budget, currentPrice) {
  if (!plan?.legs?.length) return [];
  let investedUsd = 0;
  let tokenAmount = 0;

  return plan.legs.map((leg, index) => {
    const amountUsd = finiteNumber(leg.amountUsd) ? Number(leg.amountUsd) : 0;
    const legTokens = finitePositive(leg.tokenAmount)
      ? Number(leg.tokenAmount)
      : finitePositive(leg.midpoint) && amountUsd > 0
        ? amountUsd / Number(leg.midpoint)
        : 0;
    investedUsd += amountUsd;
    tokenAmount += legTokens;
    const averageEntry = tokenAmount > 0 ? investedUsd / tokenAmount : null;
    const currentValueUsd = finitePositive(currentPrice) ? tokenAmount * Number(currentPrice) : null;

    return {
      id: `derived-through-${leg.id || index + 1}`,
      filledLegIds: plan.legs.slice(0, index + 1).map((item, itemIndex) => item.id || `B${itemIndex + 1}`),
      investedUsd,
      unusedBudgetUsd: Math.max(0, Number(budget) - investedUsd),
      tokenAmount,
      averageEntry,
      currentValueUsd,
      currentPnlUsd: finiteNumber(currentValueUsd) ? currentValueUsd - investedUsd : null,
      currentPnlPct: finiteNumber(currentValueUsd) && investedUsd > 0
        ? ((currentValueUsd / investedUsd) - 1) * 100
        : null,
    };
  });
}

function scenarioTitle(scenario, index, total) {
  if (scenario?.label || scenario?.title) return scenario.label || scenario.title;
  const ids = Array.isArray(scenario?.filledLegIds) ? scenario.filledLegIds : [];
  const lastId = ids.at(-1) || `B${index + 1}`;
  if (index === total - 1 && total > 1) return `If all zones through ${lastId} fill`;
  return ids.length > 1 ? `If zones through ${lastId} fill` : `If ${lastId} fills`;
}

function SummaryItem({ label, value, detail }) {
  return (
    <div className="cmvng-plan-outcome__summary-item">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </dd>
    </div>
  );
}

export default function PlanOutcome({
  plan,
  budget,
  durationDays,
  valueMode = "price",
  market = {},
  currentPrice,
  currentMarketCap,
  currentFdv,
  tokenSymbol,
}) {
  const reactId = useId().replace(/:/g, "");
  const headingId = `cmvng-plan-outcome-${reactId}`;
  const scenarioHeadingId = `${headingId}-scenarios`;
  const normalizedMode = normalizeValueMode(valueMode);
  const current = readCurrentMarket({ market, currentPrice, currentMarketCap, currentFdv });
  const normalizedBudget = finitePositive(budget ?? plan?.budget) ? Number(budget ?? plan?.budget) : null;
  const normalizedDuration = finitePositive(durationDays ?? plan?.durationDays)
    ? Math.round(Number(durationDays ?? plan?.durationDays))
    : null;
  const profileName = plan?.profile?.name || plan?.profileName || plan?.name || "Selected DCA plan";
  const averageEntry = plan?.weightedAverageEntry ?? plan?.averageEntry;
  const target = plan?.target || {};
  const targetPrice = target.price ?? plan?.targetPrice;
  const reassessment = plan?.reassessment || {};
  const reassessmentPrice = reassessment.price ?? plan?.invalidationPrice;
  const averageValue = projectedValue(averageEntry, normalizedMode, null, plan, current);
  const targetValue = projectedValue(targetPrice, normalizedMode, target.valuation, plan, current);
  const reassessmentValue = projectedValue(
    reassessmentPrice,
    normalizedMode,
    reassessment.valuation,
    plan,
    current,
  );
  const rawScenarios = plan?.scenarios || plan?.fillScenarios || plan?.outlook?.scenarios;
  const scenarios = useMemo(
    () => Array.isArray(rawScenarios) && rawScenarios.length
      ? rawScenarios
      : deriveScenarios(plan, normalizedBudget, current.price),
    [current.price, normalizedBudget, plan, rawScenarios],
  );
  const volatilityEnvelope = volatilityEnvelopePercentages(plan?.volatilityOutlook);
  const hasVolatilityEnvelope = finiteNumber(volatilityEnvelope.downsidePct)
    || finiteNumber(volatilityEnvelope.upsidePct);
  const reassessmentDrawdown = finiteNumber(reassessment.drawdownFromLivePct)
    ? Number(reassessment.drawdownFromLivePct)
    : finitePositive(reassessmentPrice) && finitePositive(current.price)
      ? ((Number(reassessmentPrice) / Number(current.price)) - 1) * 100
      : null;
  const symbol = String(tokenSymbol || market?.symbol || "token").toUpperCase();
  const targetPositionValue = target.valueUsd ?? plan?.targetValue;
  const targetPositionPnl = target.profitUsd ?? plan?.targetProfit;
  const reassessmentPositionValue = reassessment.valueUsd ?? plan?.invalidationValue;
  const reassessmentPositionPnl = reassessment.pnlUsd ?? plan?.invalidationPnl;
  const reassessmentPositionPct = reassessment.pnlPct;

  if (!plan) return null;

  return (
    <section className="cmvng-plan-outcome" aria-labelledby={headingId}>
      <header className="cmvng-plan-outcome__header">
        <div>
          <span className="cmvng-plan-outcome__eyebrow">Your plan</span>
          <h3 id={headingId}>{profileName}</h3>
        </div>
        <span className="cmvng-plan-outcome__unit">{mixedUnitLabel(normalizedMode)}</span>
      </header>

      <dl className="cmvng-plan-outcome__summary">
        <SummaryItem
          label="DCA budget"
          value={formatUsd(normalizedBudget)}
          detail={`${plan?.legs?.length || 0} price-triggered buys`}
        />
        <SummaryItem
          label="Review window"
          value={normalizedDuration ? `${normalizedDuration} days` : "—"}
          detail="Monitoring period, not a fill deadline"
        />
        <SummaryItem
          label="All-fill modeled average"
          value={formatPlanValue(averageValue, normalizedMode)}
          detail={finitePositive(plan?.totalTokens)
            ? `Assumes B1–B4 all fill · ≈ ${formatTokenAmount(plan.totalTokens)} ${symbol} total`
            : "Assumes B1–B4 all fill"}
        />
        <SummaryItem
          label="S1 target reference"
          value={formatPlanValue(targetValue, normalizedMode)}
          detail={finiteNumber(target.gainFromAveragePct ?? plan?.targetPct)
            ? `${formatPercent(target.gainFromAveragePct ?? plan.targetPct)} from modeled average · after all fills`
            : "Conditional after all fills · no sell allocation modeled"}
        />
        <SummaryItem
          label="X1 close-below reassess"
          value={formatPlanValue(reassessmentValue, normalizedMode)}
          detail={reassessmentDrawdown !== null
            ? `${formatPercent(reassessmentDrawdown)} from live · selected-timeframe CLOSE required`
            : "Selected-timeframe CLOSE below X1 required"}
        />
        <SummaryItem
          label="Volatility envelope"
          value={formatVolatilityEnvelope(volatilityEnvelope)}
          detail={hasVolatilityEnvelope ? "ATR-scaled price projections, not a forecast" : "Not available for this sample"}
        />
      </dl>

      <details className="cmvng-plan-outcome__scenario-disclosure">
        <summary>
          <span>
            <strong>Open fill-by-fill outcomes</strong>
            <small>{scenarios.length || plan?.legs?.length || 0} conditional snapshots · USD position values</small>
          </span>
        </summary>
        <div className="cmvng-plan-outcome__scenarios" aria-labelledby={scenarioHeadingId}>
          <div className="cmvng-plan-outcome__section-heading">
            <div>
              <h4 id={scenarioHeadingId}>What could happen</h4>
              <p>Conditional snapshots if each successive fill is followed by a return to today&apos;s quote.</p>
            </div>
          </div>

          {scenarios.length ? (
            <ol className="cmvng-plan-outcome__scenario-list">
              {scenarios.map((scenario, index) => {
                const averageScenarioValue = projectedValue(
                  scenario.averageEntry,
                  normalizedMode,
                  scenario.averageEntryValuation,
                  plan,
                  current,
                );
                const pnlTone = finiteNumber(scenario.currentPnlUsd)
                  ? Number(scenario.currentPnlUsd) >= 0 ? "positive" : "negative"
                  : "";
                return (
                  <li className="cmvng-plan-outcome__scenario" key={scenario.id || `scenario-${index}`}>
                    <div className="cmvng-plan-outcome__scenario-title">
                      <strong>{scenarioTitle(scenario, index, scenarios.length)}</strong>
                      {scenario.description ? <span>{scenario.description}</span> : null}
                    </div>
                    <dl>
                      <div>
                        <dt>Invested</dt>
                        <dd>{formatUsd(scenario.investedUsd)}</dd>
                      </div>
                      <div>
                        <dt>Budget left</dt>
                        <dd>{formatUsd(scenario.unusedBudgetUsd)}</dd>
                      </div>
                      <div>
                        <dt>Average entry</dt>
                        <dd>{formatPlanValue(averageScenarioValue, normalizedMode)}</dd>
                      </div>
                      <div>
                        <dt>If quote returns here</dt>
                        <dd className={pnlTone}>
                          {formatUsd(scenario.currentValueUsd)}
                          {finiteNumber(scenario.currentPnlPct) ? ` · ${formatPercent(scenario.currentPnlPct)}` : ""}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="cmvng-plan-outcome__empty">Scenario rows will appear when valid buy zones can be plotted.</p>
          )}

          <div className="cmvng-plan-outcome__terminal" aria-label="All planned buys filled outcome references">
            <article>
              <span>All fills → return to today&apos;s quote</span>
              <strong>{formatUsd(plan?.currentValue)}</strong>
              <small className={finiteNumber(plan?.currentPnl) ? Number(plan.currentPnl) >= 0 ? "positive" : "negative" : ""}>
                {finiteNumber(plan?.currentPnl) ? `${formatUsd(plan.currentPnl)} vs invested` : "Current quote unavailable"}
              </small>
            </article>
            <article className="cmvng-plan-outcome__terminal--target">
              <span>All fills → S1 target reference</span>
              <strong>{formatUsd(targetPositionValue)}</strong>
              <small>{finiteNumber(targetPositionPnl) ? `${formatUsd(targetPositionPnl)} before costs · no sale modeled` : "Conditional after fills · no sale modeled"}</small>
            </article>
            <article className="cmvng-plan-outcome__terminal--risk">
              <span>All fills → exact-X1 reference</span>
              <strong>{formatUsd(reassessmentPositionValue)}</strong>
              <small className="negative">
                {finiteNumber(reassessmentPositionPnl)
                  ? `${formatUsd(reassessmentPositionPnl)}${finiteNumber(reassessmentPositionPct) ? ` · ${formatPercent(reassessmentPositionPct)}` : ""} · confirmed close or gaps can lose more`
                  : "Exact-level model; confirmed close or gaps can be lower"}
              </small>
            </article>
          </div>
        </div>
      </details>

      <footer className="cmvng-plan-outcome__notes">
        <p>The review window does not guarantee any zone will fill. Prefix-fill P/L assumes price later returns to today&apos;s displayed quote; it is not immediate profit at the fill.</p>
        <p>Figures are before fees, slippage, price impact, and taxes. S1 is a conditional target reference after all planned fills; no sell allocation or executed sale is modeled.</p>
        <p>X1 calls for manual reassessment only after a selected-timeframe candle CLOSES below X1. A wick below does not count, and X1 is not an automatic stop or executed sale.</p>
      </footer>
    </section>
  );
}
