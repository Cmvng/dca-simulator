import React, { useId } from "react";
import { formatPercent, formatPrice, formatUsd } from "../lib/onchain/formatters.js";

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

function normalizeValueMode(valueMode) {
  if (valueMode === "marketCap" || valueMode === "mcap") return "marketCap";
  return valueMode === "fdv" ? "fdv" : "price";
}

function profileDetails(plan, index) {
  const profile = plan?.profile || {};
  return {
    id: String(profile.id || plan?.profileId || plan?.id || `plan-${index + 1}`),
    name: profile.name || plan?.profileName || plan?.name || "DCA plan",
    description: profile.description || plan?.profileDescription || plan?.description || "",
    allocations: profile.allocations || plan?.allocations || plan?.legs?.map(leg => leg.allocationPct) || [],
    recommendedDurationDays: profile.recommendedDurationDays || plan?.recommendedDurationDays || null,
  };
}

function currentMarketValues({ currentPrice, currentMarketCap, currentFdv }) {
  return {
    price: finitePositive(currentPrice) ? Number(currentPrice) : null,
    marketCap: finitePositive(currentMarketCap) ? Number(currentMarketCap) : null,
    fdv: finitePositive(currentFdv) ? Number(currentFdv) : null,
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

function allocationLabel(allocations) {
  const values = allocations.map(Number).filter(Number.isFinite);
  return values.length ? `${values.join(" / ")}%` : "Not plotted";
}

export default function PlanProfileSelector({
  plans = [],
  selectedId,
  onSelect,
  valueMode = "price",
  currentPrice,
  currentMarketCap,
  currentFdv,
}) {
  const reactId = useId().replace(/:/g, "");
  const headingId = `cmvng-plan-picker-${reactId}`;
  const normalizedMode = normalizeValueMode(valueMode);
  const current = currentMarketValues({ currentPrice, currentMarketCap, currentFdv });

  if (!plans.length) return null;

  return (
    <section className="cmvng-plan-picker" aria-labelledby={headingId}>
      <header className="cmvng-plan-picker__header">
        <div>
          <span className="cmvng-plan-picker__eyebrow">Plan style</span>
          <h3 id={headingId}>Choose how to stage the budget</h3>
        </div>
        <span className="cmvng-plan-picker__unit">Shown in {valueModeLabel(normalizedMode)}</span>
      </header>

      <fieldset className="cmvng-plan-picker__list">
        <legend className="visually-hidden">Choose a DCA plan style</legend>
        {plans.map((plan, index) => {
          const details = profileDetails(plan, index);
          const inputId = `cmvng-plan-${reactId}-${details.id}-${index}`;
          const descriptionId = `${inputId}-description`;
          const metricsId = `${inputId}-metrics`;
          const targetPrice = plan?.target?.price ?? plan?.targetPrice;
          const targetValuation = plan?.target?.valuation;
          const reassessment = plan?.reassessment || {};
          const reassessmentPrice = reassessment.price ?? plan?.invalidationPrice;
          const averageEntry = plan?.weightedAverageEntry ?? plan?.averageEntry;
          const averageValue = projectedValue(averageEntry, normalizedMode, null, plan, current);
          const targetValue = projectedValue(targetPrice, normalizedMode, targetValuation, plan, current);
          const reassessmentValue = projectedValue(
            reassessmentPrice,
            normalizedMode,
            reassessment.valuation,
            plan,
            current,
          );
          const hasDrawdownFromLive = reassessment.drawdownFromLivePct !== null
            && reassessment.drawdownFromLivePct !== undefined
            && reassessment.drawdownFromLivePct !== ""
            && Number.isFinite(Number(reassessment.drawdownFromLivePct));
          const drawdownFromLive = hasDrawdownFromLive
            ? Number(reassessment.drawdownFromLivePct)
            : finitePositive(reassessmentPrice) && finitePositive(current.price)
              ? ((Number(reassessmentPrice) / Number(current.price)) - 1) * 100
              : null;
          const isSelected = details.id === selectedId;
          const isDisabled = plan?.mode === "blocked" || plan?.quality?.canPlan === false;

          return (
            <label
              className={`cmvng-plan-card${isSelected ? " cmvng-plan-card--selected" : ""}${isDisabled ? " cmvng-plan-card--disabled" : ""}`}
              htmlFor={inputId}
              key={`${details.id}-${index}`}
            >
              <input
                id={inputId}
                type="radio"
                name={`cmvng-plan-profile-${reactId}`}
                value={details.id}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onSelect?.(details.id)}
                aria-describedby={`${descriptionId} ${metricsId}`}
              />
              <span className="cmvng-plan-card__radio" aria-hidden="true" />
              <span className="cmvng-plan-card__body">
                <span className="cmvng-plan-card__title-row">
                  <strong>{details.name}</strong>
                  <span>
                    {isDisabled
                      ? "Evidence required"
                      : <>{details.recommendedDurationDays ? `${details.recommendedDurationDays}d suggested · ` : ""}{allocationLabel(details.allocations)}</>}
                  </span>
                </span>
                {details.description ? (
                  <span className="cmvng-plan-card__description" id={descriptionId}>{details.description}</span>
                ) : (
                  <span className="visually-hidden" id={descriptionId}>DCA plan profile</span>
                )}
                <span className="cmvng-plan-card__metrics" id={metricsId}>
                  <span>
                    <small>Budget mix</small>
                    <strong>{allocationLabel(details.allocations)}</strong>
                  </span>
                  <span>
                    <small>Modeled average</small>
                    <strong>{formatPlanValue(averageValue, normalizedMode)}</strong>
                  </span>
                  <span>
                    <small>S1 after fills</small>
                    <strong>{formatPlanValue(targetValue, normalizedMode)}</strong>
                  </span>
                  <span>
                    <small>X1 reassess</small>
                    <strong>{formatPlanValue(reassessmentValue, normalizedMode)}</strong>
                    {drawdownFromLive !== null ? <em>{formatPercent(drawdownFromLive)} from live</em> : null}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
