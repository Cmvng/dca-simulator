import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OnchainSharePanel from "./OnchainSharePanel.jsx";
import ScheduledDcaChart from "./ScheduledDcaChart.jsx";
import ScheduledPlanSummary from "./ScheduledPlanSummary.jsx";
import {
  buildScheduledDcaPlan,
  SCHEDULED_DCA_FREQUENCIES,
} from "../lib/onchain/scheduledDca.js";
import { compactAddress, formatPercent, formatPrice, formatUsd } from "../lib/onchain/formatters.js";
import { getPoolCandles, resolveContract } from "../services/onchainApi.js";
import { LogoMark } from "./ui.jsx";
import "../onchain.css";

const TIMEFRAMES = [
  { id: "1h", label: "1H", timeframe: "hour", aggregate: 1, seconds: 3_600, limit: 500 },
  { id: "4h", label: "4H", timeframe: "hour", aggregate: 4, seconds: 14_400, limit: 500 },
  { id: "1d", label: "1D", timeframe: "day", aggregate: 1, seconds: 86_400, limit: 500 },
];

const VALUE_MODES = [
  { id: "price", label: "Price" },
  { id: "marketCap", label: "MCAP" },
  { id: "fdv", label: "FDV" },
];

const NETWORK_NAMES = {
  eth: "Ethereum",
  ethereum: "Ethereum",
  solana: "Solana",
  base: "Base",
  bsc: "BNB Chain",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  polygon_pos: "Polygon",
  avax: "Avalanche",
};

const DEFAULT_FREQUENCY_ID = "daily";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finiteNumber = value => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value));

function frequencyById(id) {
  return SCHEDULED_DCA_FREQUENCIES.find(item => item.id === id)
    || SCHEDULED_DCA_FREQUENCIES.find(item => item.id === DEFAULT_FREQUENCY_ID)
    || SCHEDULED_DCA_FREQUENCIES[0];
}

function evidenceTimeframeForFrequency(frequencyId) {
  const frequency = frequencyById(frequencyId);
  if (!frequency || frequency.seconds <= 6 * 3_600) return TIMEFRAMES[0];
  if (frequency.seconds <= 86_400) return TIMEFRAMES[1];
  return TIMEFRAMES[2];
}

function readAnalyzerQuery() {
  const fallback = {
    address: "",
    pool: "",
    amount: 500,
    duration: 30,
    frequency: DEFAULT_FREQUENCY_ID,
    target: 100,
    unit: "marketCap",
  };
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const numberParam = key => {
    const value = params.get(key);
    return value === null ? NaN : Number(value);
  };
  const amount = numberParam("amount");
  const duration = numberParam("duration");
  const target = numberParam("target");
  const requestedFrequency = params.get("frequency") || DEFAULT_FREQUENCY_ID;
  const requestedUnit = params.get("unit") || "marketCap";

  return {
    address: params.get("address") || "",
    pool: params.get("pool") || "",
    amount: finiteNumber(amount) && amount > 0 ? clamp(amount, 1, 10_000_000) : fallback.amount,
    duration: finiteNumber(duration) ? Math.round(clamp(duration, 7, 90)) : fallback.duration,
    frequency: frequencyById(requestedFrequency)?.id || fallback.frequency,
    target: finiteNumber(target) ? clamp(target, 5, 500) : fallback.target,
    unit: VALUE_MODES.some(item => item.id === requestedUnit) ? requestedUnit : fallback.unit,
  };
}

function syncAnalyzerUrl({ address, asset, inputs, valueMode, timeframeId }) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const setOrDelete = (key, value) => {
    if (value === null || value === undefined || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  };

  setOrDelete("address", address);
  setOrDelete("pool", asset ? `${asset.network}:${asset.poolAddress}` : "");
  setOrDelete("amount", inputs.totalUsd);
  setOrDelete("duration", inputs.durationDays);
  setOrDelete("frequency", inputs.frequencyId);
  setOrDelete("target", inputs.targetPct);
  setOrDelete("unit", valueMode);
  // Retained for backward-compatible deep links; this is evidence, not buy cadence.
  setOrDelete("interval", timeframeId);
  url.searchParams.delete("plan");
  url.searchParams.delete("touches");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function TokenLogo({ token }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [token?.address, token?.image]);
  if (!token?.image || failed) {
    return <div className="token-logo token-logo--fallback">{token?.symbol?.slice(0, 2)?.toUpperCase() || "?"}</div>;
  }
  return <img className="token-logo" src={token.image} alt="" onError={() => setFailed(true)} />;
}

function formatHistorySpan(days) {
  if (!finiteNumber(days) || days <= 0) return "—";
  if (days < 2) return `${Math.round(days * 24)} hours`;
  return `${days < 10 ? Number(days).toFixed(1) : Math.round(days)} days`;
}

function formatAgeHours(hours) {
  if (!finiteNumber(hours) || hours < 0) return "—";
  if (hours < 1) return "Less than 1 hour";
  if (hours < 48) return `${Math.round(hours)} hours`;
  return formatHistorySpan(hours / 24);
}

function stableSeed(parts) {
  let hash = 2_166_136_261;
  for (const character of parts.join("|").toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function estimatedSchedule({ totalUsd, durationDays, frequencyId }) {
  const frequency = frequencyById(frequencyId);
  const safeAmount = clamp(Number(totalUsd) || 1, 1, 10_000_000);
  const safeDays = Math.round(clamp(Number(durationDays) || 30, 7, 90));
  const purchaseCount = Math.max(1, Math.ceil((safeDays * 86_400) / Math.max(1, frequency?.seconds || 86_400)));
  return {
    purchaseCount,
    amountPerBuyUsd: safeAmount / purchaseCount,
    frequencyLabel: frequency?.label || "Every day",
  };
}

function volatilityLabel(plan, candleLoading) {
  if (candleLoading) return { category: "Calculating", measure: "—", detail: "Reading recent price swings" };
  const volatility = plan?.volatility;
  if (!volatility) return { category: "Unavailable", measure: "—", detail: "Not enough usable market history" };
  return {
    category: volatility.category || "Measured",
    measure: finiteNumber(volatility.typicalDailySwingPct)
      ? `~${Number(volatility.typicalDailySwingPct).toFixed(1)}% daily`
      : "Measured",
    detail: finiteNumber(volatility.typicalDailySwingPct)
      ? `Typical daily swing ${Number(volatility.typicalDailySwingPct).toFixed(1)}%`
      : "Based on recent pool candles",
  };
}

function plainAssumption(value) {
  return String(value)
    .replace("Every B marker", "Every BUY marker")
    .replace("S and X", "TARGET CLOSE and RISK REVIEW");
}

export default function OnchainAnalyzer() {
  const initialQuery = useMemo(() => readAnalyzerQuery(), []);
  const [address, setAddress] = useState(initialQuery.address);
  const [asset, setAsset] = useState(null);
  const [poolOptions, setPoolOptions] = useState([]);
  const [resolveState, setResolveState] = useState("idle");
  const [resolveError, setResolveError] = useState("");
  const [candles, setCandles] = useState([]);
  const [candleState, setCandleState] = useState("idle");
  const [candleError, setCandleError] = useState("");
  const [candleRequestVersion, setCandleRequestVersion] = useState(0);
  const [resolvedAt, setResolvedAt] = useState(null);
  const [candlesAt, setCandlesAt] = useState(null);
  const [valueMode, setValueMode] = useState(initialQuery.unit);
  const [copied, setCopied] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(Boolean(initialQuery.address));
  const [planInputs, setPlanInputs] = useState({
    totalUsd: initialQuery.amount,
    durationDays: initialQuery.duration,
    frequencyId: initialQuery.frequency,
    targetPct: initialQuery.target,
  });
  const [amountInput, setAmountInput] = useState(String(initialQuery.amount));
  const [durationInput, setDurationInput] = useState(String(initialQuery.duration));
  const [frequencyInput, setFrequencyInput] = useState(initialQuery.frequency);
  const [targetInput, setTargetInput] = useState(String(initialQuery.target));

  const resolveController = useRef(null);
  const candleController = useRef(null);
  const resolveRequestId = useRef(0);
  const candleRequestId = useRef(0);
  const initialUrlScanStarted = useRef(false);
  const workspaceRef = useRef(null);
  const planResultRef = useRef(null);
  const technicalDetailsRef = useRef(null);
  const pendingPlanFocus = useRef(false);

  const timeframe = useMemo(
    () => evidenceTimeframeForFrequency(planInputs.frequencyId),
    [planInputs.frequencyId],
  );
  const market = useMemo(() => asset?.market || {}, [asset?.market]);
  const simulationSeed = useMemo(
    () => stableSeed([
      asset?.token?.address || address,
      planInputs.totalUsd,
      planInputs.durationDays,
      planInputs.frequencyId,
      planInputs.targetPct,
    ]),
    [address, asset?.token?.address, planInputs],
  );
  const scheduledPlan = useMemo(() => {
    if (!asset) return null;
    return buildScheduledDcaPlan({
      candles,
      market,
      totalUsd: planInputs.totalUsd,
      frequencyId: planInputs.frequencyId,
      durationDays: planInputs.durationDays,
      targetPct: planInputs.targetPct,
      expectedIntervalSeconds: timeframe.seconds,
      dataAsOf: candlesAt,
      seed: simulationSeed,
    });
  }, [asset, candles, candlesAt, market, planInputs, simulationSeed, timeframe.seconds]);
  const candleReady = candleState === "done";
  const candleLoading = candleState === "idle" || candleState === "loading";
  const canShowPlan = Boolean(hasGenerated && candleReady && scheduledPlan?.canSimulate);
  const generatedFrequency = scheduledPlan?.frequency || frequencyById(planInputs.frequencyId);
  const draftEstimate = useMemo(
    () => estimatedSchedule({
      totalUsd: amountInput,
      durationDays: durationInput,
      frequencyId: frequencyInput,
    }),
    [amountInput, durationInput, frequencyInput],
  );
  const volatility = volatilityLabel(scheduledPlan, candleLoading);
  const selectedNetwork = NETWORK_NAMES[asset?.network] || asset?.network || "Unknown network";
  const dexName = typeof asset?.dex === "string" ? asset.dex : asset?.dex?.name || asset?.dex?.id || "Unknown DEX";
  const selectedPoolKey = asset ? `${asset.network}:${asset.poolAddress}` : "";
  const uniqueNetworks = new Set(poolOptions.map(option => option.network));
  const poolPageUrl = asset
    ? `https://www.geckoterminal.com/${encodeURIComponent(asset.network)}/pools/${encodeURIComponent(asset.poolAddress)}`
    : null;
  const lowLiquidity = finiteNumber(market.liquidityUsd) && Number(market.liquidityUsd) < 50_000;
  const valuationWarnings = useMemo(() => {
    if (
      finiteNumber(market.marketCapUsd)
      && finiteNumber(market.fdvUsd)
      && Number(market.marketCapUsd) > Number(market.fdvUsd) * 1.05
    ) {
      return ["Reported market cap exceeds FDV. Verify the provider values before using valuation projections."];
    }
    return [];
  }, [market.fdvUsd, market.marketCapUsd]);
  useEffect(() => {
    if (!asset) return;
    if (valueMode === "marketCap" && !finiteNumber(market.marketCapUsd)) setValueMode("price");
    else if (valueMode === "fdv" && !finiteNumber(market.fdvUsd)) setValueMode("price");
  }, [asset, market.fdvUsd, market.marketCapUsd, valueMode]);

  useEffect(() => {
    const canonicalAddress = asset?.token?.address
      || (["loading", "error"].includes(resolveState) ? address.trim() : "");
    if (!canonicalAddress) return;
    if (resolveState === "idle" && initialQuery.address === address) return;
    syncAnalyzerUrl({
      address: canonicalAddress,
      asset,
      inputs: planInputs,
      valueMode,
      timeframeId: timeframe.id,
    });
  }, [address, asset, initialQuery.address, planInputs, resolveState, timeframe.id, valueMode]);

  useEffect(() => {
    if (!canShowPlan || !pendingPlanFocus.current) return;
    pendingPlanFocus.current = false;
    const timer = window.setTimeout(() => {
      planResultRef.current?.focus({ preventScroll: true });
      planResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [canShowPlan, scheduledPlan]);

  const cancelCurrentCandles = useCallback(() => {
    candleRequestId.current += 1;
    candleController.current?.abort();
  }, []);

  const scan = useCallback(async input => {
    if (typeof input !== "string") input?.preventDefault();
    const value = (typeof input === "string" ? input : address).trim();
    if (!value) return;
    initialUrlScanStarted.current = true;
    if (typeof input === "string") setAddress(value);
    const existingQuery = readAnalyzerQuery();
    const requestedPool = existingQuery.address === value ? existingQuery.pool : "";

    resolveController.current?.abort();
    cancelCurrentCandles();
    const requestId = resolveRequestId.current + 1;
    resolveRequestId.current = requestId;
    const controller = new AbortController();
    resolveController.current = controller;
    setResolveState("loading");
    setResolveError("");
    setCandleState("idle");
    setCandleError("");
    setCandles([]);
    setAsset(null);
    setResolvedAt(null);
    setCandlesAt(null);
    setHasGenerated(true);

    try {
      const payload = await resolveContract(value, { signal: controller.signal });
      if (requestId !== resolveRequestId.current) return;
      const options = [payload.asset, ...(payload.alternatives || [])];
      const selected = options.find(option => `${option.network}:${option.poolAddress}` === requestedPool) || payload.asset;
      setAsset(selected);
      setPoolOptions(options);
      setResolvedAt(payload.asOf || new Date().toISOString());
      setResolveState("done");
      window.setTimeout(() => {
        if (requestId !== resolveRequestId.current) return;
        workspaceRef.current?.focus({ preventScroll: true });
        workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (error) {
      if (error.name === "AbortError" || requestId !== resolveRequestId.current) return;
      setResolveError(error.message || "The contract could not be resolved.");
      setResolveState("error");
    }
  }, [address, cancelCurrentCandles]);

  useEffect(() => {
    if (initialUrlScanStarted.current || !initialQuery.address) return;
    const timer = window.setTimeout(() => {
      if (initialUrlScanStarted.current) return;
      initialUrlScanStarted.current = true;
      scan(initialQuery.address);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialQuery.address, scan]);

  useEffect(() => {
    if (!asset) return undefined;
    candleController.current?.abort();
    const requestId = candleRequestId.current + 1;
    candleRequestId.current = requestId;
    const controller = new AbortController();
    candleController.current = controller;
    setCandleState("loading");
    setCandleError("");
    setCandles([]);
    setCandlesAt(null);

    getPoolCandles(asset, timeframe, { signal: controller.signal })
      .then(payload => {
        if (requestId !== candleRequestId.current) return;
        setCandles(payload.candles || []);
        setCandlesAt(payload.asOf || new Date().toISOString());
        setCandleState("done");
      })
      .catch(error => {
        if (error.name === "AbortError" || requestId !== candleRequestId.current) return;
        setCandles([]);
        setCandleError(error.message || "Candles are unavailable for this pool.");
        setCandleState("error");
      });

    return () => {
      controller.abort();
      if (requestId === candleRequestId.current) candleRequestId.current += 1;
    };
  }, [asset, candleRequestVersion, timeframe]);

  useEffect(() => () => {
    initialUrlScanStarted.current = false;
    resolveRequestId.current += 1;
    candleRequestId.current += 1;
    resolveController.current?.abort();
    candleController.current?.abort();
  }, []);

  const copyAddress = async () => {
    if (!asset?.token?.address) return;
    try {
      await navigator.clipboard.writeText(asset.token.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_400);
    } catch {
      setCopied(false);
    }
  };

  const choosePool = event => {
    const next = poolOptions.find(option => `${option.network}:${option.poolAddress}` === event.target.value);
    if (!next) return;
    cancelCurrentCandles();
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setAsset(next);
    setHasGenerated(true);
  };

  const retryCandles = () => {
    cancelCurrentCandles();
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setCandleRequestVersion(version => version + 1);
  };

  const generatePlan = event => {
    event.preventDefault();
    const nextInputs = {
      totalUsd: clamp(Number(amountInput) || 1, 1, 10_000_000),
      durationDays: Math.round(clamp(Number(durationInput) || 30, 7, 90)),
      frequencyId: frequencyById(frequencyInput)?.id || DEFAULT_FREQUENCY_ID,
      targetPct: clamp(Number(targetInput) || 100, 5, 500),
    };
    const evidenceTimeframeChanged = evidenceTimeframeForFrequency(nextInputs.frequencyId).id !== timeframe.id;

    setAmountInput(String(nextInputs.totalUsd));
    setDurationInput(String(nextInputs.durationDays));
    setFrequencyInput(nextInputs.frequencyId);
    setTargetInput(String(nextInputs.targetPct));
    setPlanInputs(nextInputs);
    setHasGenerated(true);
    pendingPlanFocus.current = true;

    if (evidenceTimeframeChanged) {
      cancelCurrentCandles();
      setCandles([]);
      setCandlesAt(null);
      setCandleError("");
      setCandleState("loading");
    }
  };

  const openTechnicalDetails = () => {
    if (!technicalDetailsRef.current) return;
    technicalDetailsRef.current.open = true;
    technicalDetailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const quality = scheduledPlan?.quality || {};
  const blockingReasons = scheduledPlan?.blockingReasons || [];
  const planWarnings = scheduledPlan?.warnings || [];
  const assumptions = scheduledPlan?.assumptions || [];
  const generatedSchedule = scheduledPlan?.schedule;
  const hasTrades = finiteNumber(market.transactions24h?.buys) && finiteNumber(market.transactions24h?.sells);

  return (
    <div className="onchain-page onchain-page--scheduled">
      <header className="onchain-header">
        <a className="onchain-header__brand" href="/" aria-label="CMVNG home">
          <LogoMark size={22} />
          <span>cmvng</span>
        </a>
        <nav aria-label="Product mode">
          <span>Contract DCA</span>
          <a href="/">Top 250 plans</a>
        </nav>
      </header>

      <main className="onchain-app onchain-app--simple">
        <section className={`contract-hero ${asset ? "contract-hero--resolved" : ""}`}>
          {!asset && (
            <>
              <div className="eyebrow"><span className="live-dot" /> DCA simulator</div>
              <h1>Paste a token contract.<br /><span>Get one simple DCA plan.</span></h1>
              <p>Choose your amount, buying period, frequency and profit goal. The app uses recent volatility to build an illustrative plan.</p>
            </>
          )}

          <form className="contract-form" onSubmit={scan}>
            <label htmlFor="contract-address">Token contract or mint address</label>
            <div className="contract-form__row">
              <input
                id="contract-address"
                value={address}
                onChange={event => setAddress(event.target.value)}
                placeholder="0x… or a Solana mint address"
                autoComplete="off"
                spellCheck="false"
              />
              <button type="submit" disabled={resolveState === "loading" || !address.trim()}>
                {resolveState === "loading" ? <><span className="button-spinner" /> Scanning</> : asset ? "Change token" : "Analyze token"}
              </button>
            </div>
            {!asset && (
              <div className="contract-form__meta">
                <span>Exact contract match · strongest indexed pool selected</span>
                <span>Market data via GeckoTerminal</span>
              </div>
            )}
          </form>

          {resolveError && <div className="inline-alert inline-alert--danger" role="alert">{resolveError}</div>}
          <div className="visually-hidden" role="status" aria-live="polite">
            {resolveState === "loading"
              ? "Resolving the contract and exact pools."
              : canShowPlan
                ? `Plan ready: ${generatedSchedule?.purchaseCount || 0} planned buys, ${generatedFrequency?.label?.toLowerCase() || "on schedule"}, over ${generatedSchedule?.durationDays || planInputs.durationDays} days.`
                : ""}
          </div>
        </section>

        {asset && (
          <section className="token-workspace token-workspace--simple" ref={workspaceRef} tabIndex={-1} aria-labelledby="onchain-token-title">
            <div className="token-heading token-heading--simple">
              <div className="token-heading__identity">
                <TokenLogo token={asset.token} />
                <div>
                  <div className="token-title-row">
                    <h2 id="onchain-token-title">{asset.token.symbol?.toUpperCase()}</h2>
                    <span className="chain-pill">{selectedNetwork}</span>
                  </div>
                  <p>{asset.token.name}</p>
                  <button className="address-copy" type="button" onClick={copyAddress} aria-label="Copy token contract address">
                    {compactAddress(asset.token.address, 9, 7)} <span aria-live="polite">{copied ? "Copied" : "Copy CA"}</span>
                  </button>
                </div>
              </div>
              <div className="token-heading__price">
                <strong>{formatPrice(market.priceUsd)}</strong>
                <span>{finiteNumber(market.change24h) ? `${Number(market.change24h) >= 0 ? "▲" : "▼"} ${formatPercent(market.change24h)} · 24h` : "Live pool price"}</span>
              </div>
            </div>

            <div className="simple-token-facts" aria-label="Token overview">
              <div>
                <span>Market cap</span>
                <strong>{finiteNumber(market.marketCapUsd) ? formatUsd(market.marketCapUsd, { compact: true }) : "Unavailable"}</strong>
              </div>
              <div>
                <span>FDV</span>
                <strong>{finiteNumber(market.fdvUsd) ? formatUsd(market.fdvUsd, { compact: true }) : "Unavailable"}</strong>
              </div>
              <div className="simple-token-facts__volatility">
                <span>Volatility</span>
                <strong>{volatility.category} · {volatility.measure}</strong>
                <small>{volatility.detail}</small>
              </div>
            </div>

            {lowLiquidity && (
              <div className="simple-risk-alert" role="note">
                <div>
                  <strong>Low-liquidity pool</strong>
                  <span>{formatUsd(market.liquidityUsd)} observed liquidity can cause large slippage.</span>
                </div>
                <button type="button" onClick={openTechnicalDetails}>Check pool</button>
              </div>
            )}
            {uniqueNetworks.size > 1 && (
              <div className="simple-risk-alert" role="note">
                <div>
                  <strong>Confirm the intended network</strong>
                  <span>This address appears on more than one network or pool.</span>
                </div>
                <button type="button" onClick={openTechnicalDetails}>Choose pool</button>
              </div>
            )}

            <section className="simple-plan-builder" id="plan-builder" aria-labelledby="plan-builder-title">
              <header>
                <span>Build your plan</span>
                <h3 id="plan-builder-title">Tell us how you want to DCA</h3>
                <p>We calculate the buy schedule and risk levels from the token&apos;s recent volatility.</p>
              </header>

              <form onSubmit={generatePlan}>
                <div className="simple-plan-fields">
                  <label>
                    Total amount
                    <div className="simple-input-affix">
                      <span>$</span>
                      <input
                        inputMode="decimal"
                        value={amountInput}
                        onChange={event => setAmountInput(event.target.value.replace(/[^0-9.]/g, ""))}
                        aria-label="Total amount to invest in US dollars"
                      />
                    </div>
                  </label>
                  <label>
                    Buy every
                    <select value={frequencyInput} onChange={event => setFrequencyInput(event.target.value)}>
                      {SCHEDULED_DCA_FREQUENCIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Buy for
                    <div className="simple-input-affix simple-input-affix--end">
                      <input
                        type="number"
                        min="7"
                        max="90"
                        step="1"
                        value={durationInput}
                        onChange={event => setDurationInput(event.target.value)}
                        aria-label="DCA duration in days"
                      />
                      <span>days</span>
                    </div>
                  </label>
                  <label>
                    Profit target
                    <div className="simple-input-affix simple-input-affix--end">
                      <input
                        type="number"
                        min="5"
                        max="500"
                        step="5"
                        value={targetInput}
                        onChange={event => setTargetInput(event.target.value)}
                        aria-label="Profit target percentage from simulated average buy"
                      />
                      <span>%</span>
                    </div>
                  </label>
                </div>

                <div className="simple-plan-builder__preview" aria-live="polite">
                  <span>Plan preview</span>
                  <strong>About {draftEstimate.purchaseCount} buys of {formatUsd(draftEstimate.amountPerBuyUsd)} · {draftEstimate.frequencyLabel.toLowerCase()}</strong>
                </div>

                <button className="simple-plan-builder__submit" type="submit" disabled={candleLoading}>
                  {candleLoading ? "Reading market volatility…" : canShowPlan ? "Update DCA plan" : "Generate DCA plan"}
                </button>
              </form>

              {candleState === "error" && (
                <div className="gate-box gate-box--blocked" role="alert">
                  <strong>Market chart could not be loaded</strong>
                  <p>{candleError}</p>
                  <button type="button" onClick={retryCandles}>Try again</button>
                </div>
              )}
              {candleReady && scheduledPlan && !scheduledPlan.canSimulate && (
                <div className="gate-box gate-box--blocked" role="alert">
                  <strong>This pool needs more price history</strong>
                  <ul>{blockingReasons.map(item => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
            </section>

            {canShowPlan && (
              <section className="scheduled-plan-preview" ref={planResultRef} tabIndex={-1} aria-labelledby="scheduled-plan-preview-title">
                <span>Plan ready</span>
                <h3 id="scheduled-plan-preview-title">
                  {formatUsd(planInputs.totalUsd)} over {generatedSchedule.durationDays} days
                </h3>
                <p>
                  <strong>BUY {generatedSchedule.purchaseCount} times</strong> · {formatUsd(generatedSchedule.amountPerBuyUsd)} per buy · {generatedFrequency.label.toLowerCase()}.
                  The dotted future path is one volatility-based example, not a price prediction.
                </p>
              </section>
            )}

            {canShowPlan && (
              <section className="simple-chart-panel" aria-labelledby="scheduled-chart-title">
                <header className="simple-chart-panel__header">
                  <div>
                    <span>Simulated DCA chart</span>
                    <h3 id="scheduled-chart-title">{asset.token.symbol?.toUpperCase()} · your {generatedSchedule.durationDays}-day plan</h3>
                    <p>BUY shows simulated purchases. TARGET CLOSE and RISK REVIEW are conditional references; no sale or order is modeled.</p>
                  </div>
                  <div className="value-mode-control" role="group" aria-label="Chart value unit">
                    {VALUE_MODES.map(item => {
                      const available = item.id === "price"
                        || (item.id === "marketCap" ? finiteNumber(market.marketCapUsd) : finiteNumber(market.fdvUsd));
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={item.id === valueMode ? "active" : ""}
                          aria-pressed={item.id === valueMode}
                          disabled={!available}
                          onClick={() => setValueMode(item.id)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </header>

                <ScheduledDcaChart
                  historyCandles={candles}
                  plan={scheduledPlan}
                  tokenSymbol={asset.token.symbol}
                  valueMode={valueMode}
                  market={market}
                />
              </section>
            )}

            {canShowPlan && <ScheduledPlanSummary plan={scheduledPlan} valueMode={valueMode} />}

            {canShowPlan && (
              <div id="share-plan-card" className="share-plan-section share-plan-section--simple" tabIndex={-1} role="region" aria-labelledby="onchain-share-title">
                <OnchainSharePanel
                  asset={asset}
                  plan={scheduledPlan}
                  dataAsOf={candlesAt}
                  marketDataAsOf={resolvedAt}
                  candleDataAsOf={candlesAt}
                  valuationWarnings={valuationWarnings}
                  warnings={planWarnings}
                  initialValueMode={valueMode}
                />
              </div>
            )}

            <details className="simple-technical-details" ref={technicalDetailsRef}>
              <summary>
                <span>
                  <strong>How this was calculated, pool and safety</strong>
                  <small>Market source, evidence, assumptions and limitations</small>
                </span>
              </summary>
              <div className="simple-technical-details__content">
                <section aria-labelledby="technical-pool-title">
                  <h4 id="technical-pool-title">Selected market</h4>
                  <label htmlFor="pool-source">Exact pool used for this chart</label>
                  <select id="pool-source" value={selectedPoolKey} onChange={choosePool} disabled={poolOptions.length < 2}>
                    {poolOptions.map(option => {
                      const optionDex = typeof option.dex === "string" ? option.dex : option.dex?.name || option.dex?.id || "DEX";
                      const optionNetwork = NETWORK_NAMES[option.network] || option.network;
                      return (
                        <option key={`${option.network}:${option.poolAddress}`} value={`${option.network}:${option.poolAddress}`}>
                          {optionNetwork} · {optionDex} · {option.counterToken?.symbol || "?"} · {compactAddress(option.poolAddress, 6, 4)} · {formatUsd(option.market?.liquidityUsd, { compact: true })}
                        </option>
                      );
                    })}
                  </select>
                  <dl>
                    <div><dt>Network</dt><dd>{selectedNetwork}</dd></div>
                    <div><dt>DEX / pair</dt><dd>{dexName} / {asset.counterToken?.symbol || "?"}</dd></div>
                    <div><dt>Liquidity</dt><dd>{formatUsd(market.liquidityUsd)}</dd></div>
                    <div><dt>24h volume</dt><dd>{formatUsd(market.volume24h)}</dd></div>
                    <div><dt>24h trades</dt><dd>{hasTrades ? `${market.transactions24h.buys} buys · ${market.transactions24h.sells} sells` : "Unavailable"}</dd></div>
                  </dl>
                  {poolPageUrl && <a href={poolPageUrl} target="_blank" rel="noreferrer">Open selected pool on GeckoTerminal ↗</a>}
                </section>

                <section aria-labelledby="technical-method-title">
                  <h4 id="technical-method-title">Calculation evidence</h4>
                  <dl>
                    <div><dt>Buy frequency</dt><dd>{generatedFrequency?.label || frequencyById(planInputs.frequencyId)?.label}</dd></div>
                    <div><dt>Evidence candles</dt><dd>{timeframe.label} · {quality.candleCount || candles.length} valid</dd></div>
                    <div><dt>History covered</dt><dd>{formatHistorySpan(quality.historyDays)}</dd></div>
                    <div><dt>Latest candle age</dt><dd>{formatAgeHours(quality.latestCandleAgeHours)}</dd></div>
                    <div><dt>Data-quality score</dt><dd>{finiteNumber(quality.score) ? `${quality.score}/100` : "Unavailable"}</dd></div>
                    <div><dt>Volatility method</dt><dd>{scheduledPlan?.volatility?.method || "Recent realized pool volatility"}</dd></div>
                    <div><dt>Pool resolved</dt><dd>{resolvedAt ? new Date(resolvedAt).toLocaleString() : "—"}</dd></div>
                    <div><dt>Candles fetched</dt><dd>{candlesAt ? new Date(candlesAt).toLocaleString() : "—"}</dd></div>
                  </dl>
                  {[...planWarnings, ...valuationWarnings].length > 0 && (
                    <div className="simple-technical-details__notes">
                      <strong>Data notes</strong>
                      <ul>{[...planWarnings, ...valuationWarnings].map(item => <li key={item}>{item}</li>)}</ul>
                    </div>
                  )}
                </section>

                <section aria-labelledby="technical-safety-title">
                  <h4 id="technical-safety-title">Safety and assumptions</h4>
                  <ul className="simple-safety-list">
                    <li>Contract security, taxes, mint/freeze authority and holder concentration are not scanned.</li>
                    <li>Real buys can differ because of fees, slippage, price impact, failed transactions and changing liquidity.</li>
                    <li>TARGET CLOSE and RISK REVIEW are simulation references. No sale or order is modeled.</li>
                    <li>MCAP and FDV views use the current reported valuation-to-price ratio.</li>
                    {assumptions.map(item => <li key={item}>{plainAssumption(item)}</li>)}
                  </ul>
                </section>
              </div>
            </details>

            <footer className="onchain-footer onchain-footer--simple">
              <span>Illustrative simulation · Not financial advice · No orders are placed</span>
              <span>Selected pool: {dexName} · {compactAddress(asset.poolAddress)}</span>
            </footer>
          </section>
        )}
      </main>
    </div>
  );
}
