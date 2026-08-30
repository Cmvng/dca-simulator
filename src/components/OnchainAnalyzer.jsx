import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DcaChart from "./DcaChart.jsx";
import ExecutionMap from "./ExecutionMap.jsx";
import OnchainSharePanel from "./OnchainSharePanel.jsx";
import PlanOutcome from "./PlanOutcome.jsx";
import PlanProfileSelector from "./PlanProfileSelector.jsx";
import { buildDcaPlans, DCA_PROFILES } from "../lib/onchain/dcaEngine.js";
import {
  buildIllustrativePlanTouches,
} from "../lib/onchain/planTouches.js";
import { compactAddress, formatPercent, formatPrice, formatUsd } from "../lib/onchain/formatters.js";
import { getPoolCandles, resolveContract } from "../services/onchainApi.js";
import { LogoMark } from "./ui.jsx";
import "../onchain.css";

const TIMEFRAMES = [
  { id: "5m", label: "5M", ariaLabel: "5 minute candles", timeframe: "minute", aggregate: 5, seconds: 300, limit: 500 },
  { id: "15m", label: "15M", ariaLabel: "15 minute candles", timeframe: "minute", aggregate: 15, seconds: 900, limit: 500 },
  { id: "1h", label: "1H", ariaLabel: "1 hour candles", timeframe: "hour", aggregate: 1, seconds: 3_600, limit: 500 },
  { id: "4h", label: "4H", ariaLabel: "4 hour candles", timeframe: "hour", aggregate: 4, seconds: 14_400, limit: 500 },
  { id: "1d", label: "1D", ariaLabel: "1 day candles", timeframe: "day", aggregate: 1, seconds: 86_400, limit: 500 },
];

const VALUE_MODES = [
  { id: "price", label: "Price" },
  { id: "marketCap", label: "MCAP" },
  { id: "fdv", label: "FDV" },
];
const TARGET_OPTIONS = [25, 50, 100, 200];
const DURATION_OPTIONS = [7, 14, 30, 45, 60, 90];

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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readAnalyzerQuery() {
  if (typeof window === "undefined") {
    return { address: "", pool: "", timeframe: "4h", amount: 500, duration: 30, profile: "balanced", unit: "marketCap", target: "auto", touches: false };
  }
  const params = new URLSearchParams(window.location.search);
  const requestedTimeframe = params.get("interval") || "4h";
  const requestedProfile = params.get("plan") || "balanced";
  const requestedUnit = params.get("unit") || "marketCap";
  const targetParam = params.get("target") || "auto";
  const amountParam = params.get("amount");
  const durationParam = params.get("duration");
  const parsedAmount = amountParam === null ? NaN : Number(amountParam);
  const parsedDuration = durationParam === null ? NaN : Number(durationParam);
  const parsedTarget = Number(targetParam);
  return {
    address: params.get("address") || "",
    pool: params.get("pool") || "",
    timeframe: TIMEFRAMES.some(item => item.id === requestedTimeframe) ? requestedTimeframe : "4h",
    amount: Number.isFinite(parsedAmount) && parsedAmount > 0 ? clamp(parsedAmount, 1, 10_000_000) : 500,
    duration: Number.isFinite(parsedDuration) ? Math.round(clamp(parsedDuration, 7, 90)) : 30,
    profile: DCA_PROFILES.some(item => item.id === requestedProfile) ? requestedProfile : "balanced",
    unit: VALUE_MODES.some(item => item.id === requestedUnit) ? requestedUnit : "marketCap",
    target: targetParam === "auto" || !Number.isFinite(parsedTarget) ? "auto" : String(clamp(parsedTarget, 5, 500)),
    touches: params.get("touches") === "1",
  };
}

function syncAnalyzerUrl({ address, asset, timeframeId, capital, reviewDays, profileId, valueMode, targetChoice, showTouches }) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const setOrDelete = (key, value) => {
    if (value === null || value === undefined || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  };
  setOrDelete("address", address);
  setOrDelete("pool", asset ? `${asset.network}:${asset.poolAddress}` : "");
  setOrDelete("interval", timeframeId);
  setOrDelete("amount", capital);
  setOrDelete("duration", reviewDays);
  setOrDelete("plan", profileId);
  setOrDelete("unit", valueMode);
  setOrDelete("target", targetChoice);
  setOrDelete("touches", showTouches ? "1" : "");
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

function Metric({ label, value, tone = "" }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function formatHistorySpan(days) {
  if (!Number.isFinite(days) || days <= 0) return "—";
  if (days < 2) return `${Math.round(days * 24)} hours`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

function formatAgeHours(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "—";
  if (hours < 1) return "Less than 1 hour";
  if (hours < 48) return `${Math.round(hours)} hours`;
  return formatHistorySpan(hours / 24);
}

function formatUtcDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function valueFromProjection(projection, valueMode) {
  if (!projection) return null;
  if (valueMode === "marketCap") return projection.marketCapUsd;
  if (valueMode === "fdv") return projection.fdvUsd;
  return projection.priceUsd;
}

function formatProjectedValue(projection, valueMode) {
  const value = valueFromProjection(projection, valueMode);
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "Unavailable";
  return valueMode === "price" ? formatPrice(value) : formatUsd(value, { compact: true });
}

function RiskMeter({ quality }) {
  const tone = quality.canPlan
    ? quality.score >= 78 ? "good" : quality.score >= 55 ? "warn" : "danger"
    : "danger";
  const scoreLabel = !quality.canPlan
    ? "Plan requirements not met"
    : quality.score >= 78
      ? "Higher-quality evidence"
      : quality.score >= 55
        ? "Moderate-quality evidence"
        : "Limited-quality evidence";
  return (
    <div className={`risk-meter risk-meter--${tone}`}>
      <div>
        <span>Market-data quality</span>
        <strong>{scoreLabel}</strong>
      </div>
      <div className="risk-meter__score" aria-label={`Market-data quality score ${quality.score} out of 100`}>
        {quality.score}<small>/100</small>
      </div>
    </div>
  );
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
  const [timeframeId, setTimeframeId] = useState(initialQuery.timeframe);
  const [capital, setCapital] = useState(initialQuery.amount);
  const [capitalInput, setCapitalInput] = useState(String(initialQuery.amount));
  const [reviewDays, setReviewDays] = useState(initialQuery.duration);
  const [selectedProfileId, setSelectedProfileId] = useState(initialQuery.profile);
  const [valueMode, setValueMode] = useState(initialQuery.unit);
  const [targetChoice, setTargetChoice] = useState(initialQuery.target);
  const [showIllustrativeTouches, setShowIllustrativeTouches] = useState(initialQuery.touches);
  const [copied, setCopied] = useState(false);
  const resolveController = useRef(null);
  const candleController = useRef(null);
  const resolveRequestId = useRef(0);
  const candleRequestId = useRef(0);
  const initialUrlScanStarted = useRef(false);
  const resultsRef = useRef(null);

  const timeframe = useMemo(
    () => TIMEFRAMES.find(item => item.id === timeframeId) || TIMEFRAMES[3],
    [timeframeId],
  );
  const market = useMemo(() => asset?.market || {}, [asset?.market]);
  const planSet = useMemo(
    () => buildDcaPlans({
      candles,
      market,
      capital,
      durationDays: reviewDays,
      targetPct: targetChoice === "auto" ? null : Number(targetChoice),
      expectedIntervalSeconds: timeframe.seconds,
      dataAsOf: candlesAt,
    }),
    [candles, candlesAt, market, capital, reviewDays, targetChoice, timeframe.seconds],
  );
  const selectedPlan = useMemo(
    () => planSet.profiles.find(item => item.profileId === selectedProfileId) || planSet.profiles[1] || planSet.profiles[0],
    [planSet.profiles, selectedProfileId],
  );
  const selectedProfile = useMemo(
    () => DCA_PROFILES.find(item => item.id === selectedPlan?.profileId) || DCA_PROFILES[1],
    [selectedPlan?.profileId],
  );
  const illustrativeEvents = useMemo(
    () => showIllustrativeTouches && selectedPlan?.quality?.canPlan
      ? buildIllustrativePlanTouches({ candles, plan: selectedPlan })
      : [],
    [candles, selectedPlan, showIllustrativeTouches],
  );
  const reviewBy = formatUtcDate(planSet.monitoringWindow.reviewAt);
  const candleReady = candleState === "done";
  const candleLoading = candleState === "idle" || candleState === "loading";
  const canShowPlan = candleReady && selectedPlan?.quality?.canPlan;
  const planHeading = candleLoading
    ? "Analyzing real pool candles"
    : candleState === "error"
      ? "Candle data unavailable"
      : selectedPlan.mode === "blocked"
        ? "Plans need more evidence"
        : `${selectedPlan.profileName} map ready`;

  useEffect(() => {
    if (!asset) return;
    if (valueMode === "marketCap" && !planSet.valuationScales.marketCap.available) {
      setValueMode("price");
    } else if (valueMode === "fdv" && !planSet.valuationScales.fdv.available) {
      setValueMode("price");
    }
  }, [asset, planSet.valuationScales, valueMode]);

  useEffect(() => {
    const canonicalAddress = asset?.token?.address
      || (["loading", "error"].includes(resolveState) ? address.trim() : "");
    if (!canonicalAddress) return;
    if (resolveState === "idle" && initialQuery.address === address) return;
    syncAnalyzerUrl({
      address: canonicalAddress,
      asset,
      timeframeId,
      capital,
      reviewDays,
      profileId: selectedProfileId,
      valueMode,
      targetChoice,
      showTouches: showIllustrativeTouches,
    });
  }, [address, asset, capital, initialQuery.address, resolveState, reviewDays, selectedProfileId, showIllustrativeTouches, targetChoice, timeframeId, valueMode]);

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
        resultsRef.current?.focus({ preventScroll: true });
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (error) {
      if (error.name === "AbortError" || requestId !== resolveRequestId.current) return;
      setResolveError(error.message || "The contract could not be resolved.");
      setResolveState("error");
    }
  }, [address, cancelCurrentCandles]);

  useEffect(() => {
    if (initialUrlScanStarted.current) return;
    const initialAddress = initialQuery.address;
    if (!initialAddress) return;
    const timer = window.setTimeout(() => {
      if (initialUrlScanStarted.current) return;
      initialUrlScanStarted.current = true;
      scan(initialAddress);
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
  }, [asset, timeframe, candleRequestVersion]);

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
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const onCapitalChange = value => {
    const filtered = value.replace(/[^0-9.]/g, "");
    const [whole = "", ...fractionParts] = filtered.split(".");
    const hasDecimal = filtered.includes(".");
    const fraction = fractionParts.join("").slice(0, 2);
    const nextInput = `${whole}${hasDecimal ? `.${fraction}` : ""}`;
    if (!nextInput || nextInput === ".") {
      setCapitalInput("");
      setCapital(1);
      return;
    }
    const next = clamp(Number(nextInput) || 1, 1, 10_000_000);
    setCapitalInput(nextInput);
    setCapital(next);
  };

  const commitCapital = () => {
    const next = clamp(Number(capitalInput) || 1, 1, 10_000_000);
    setCapital(next);
    setCapitalInput(String(next));
  };

  const hasDayChange = market.change24h !== null
    && market.change24h !== undefined
    && Number.isFinite(Number(market.change24h));
  const dayChange = hasDayChange ? Number(market.change24h) : null;
  const hasTrades = market.transactions24h?.buys !== null
    && market.transactions24h?.buys !== undefined
    && market.transactions24h?.sells !== null
    && market.transactions24h?.sells !== undefined;
  const buys = hasTrades ? Number(market.transactions24h.buys) : null;
  const sells = hasTrades ? Number(market.transactions24h.sells) : null;
  const selectedNetwork = NETWORK_NAMES[asset?.network] || asset?.network || "Unknown network";
  const dexName = typeof asset?.dex === "string" ? asset.dex : asset?.dex?.name || asset?.dex?.id || "Unknown DEX";
  const poolPageUrl = asset
    ? `https://www.geckoterminal.com/${encodeURIComponent(asset.network)}/pools/${encodeURIComponent(asset.poolAddress)}`
    : null;
  const selectedPoolKey = asset ? `${asset.network}:${asset.poolAddress}` : "";
  const uniqueNetworks = new Set(poolOptions.map(option => option.network));

  const choosePool = event => {
    const next = poolOptions.find(option => `${option.network}:${option.poolAddress}` === event.target.value);
    if (!next) return;
    cancelCurrentCandles();
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setAsset(next);
  };

  const chooseTimeframe = id => {
    if (id === timeframeId) return;
    cancelCurrentCandles();
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setTimeframeId(id);
  };

  const retryCandles = () => {
    cancelCurrentCandles();
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setCandleRequestVersion(version => version + 1);
  };

  const scrollTo = id => {
    const destination = document.getElementById(id);
    if (!destination) return;
    destination.focus({ preventScroll: true });
    destination.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const currentProjection = planSet.volatilityOutlook.current;
  return (
    <div className="onchain-page">
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

      <main className="onchain-app">
        <section className={`contract-hero ${asset ? "contract-hero--resolved" : ""}`}>
          {!asset && (
            <>
              <div className="eyebrow"><span className="live-dot" /> Onchain DCA Lab</div>
              <h1>Paste a memecoin contract.<br /><span>See the whole DCA map.</span></h1>
              <p>Choose a plan, see every potential buy and exit zone, then share one clean card. No generated future candles.</p>
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
              : candleState === "done" && asset
                  ? selectedPlan.quality.canPlan
                    ? `Three DCA plans are ready from ${selectedPlan.quality.candleCount} candles.`
                    : `Market chart ready with ${selectedPlan.quality.candleCount} candles. Plans need more evidence.`
                  : ""}
          </div>
        </section>

        {asset && (
          <section className="token-workspace" ref={resultsRef} tabIndex={-1} aria-labelledby="onchain-token-title">
            <div className="token-heading">
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
                <span className={hasDayChange ? (dayChange >= 0 ? "positive" : "negative") : ""}>
                  {hasDayChange ? `${dayChange >= 0 ? "▲" : "▼"} ${formatPercent(dayChange)} · 24h` : "24h change unavailable"}
                </span>
                {canShowPlan && <button type="button" className="token-card-link" onClick={() => scrollTo("share-plan-card")}>Customize share card</button>}
              </div>
            </div>

            <div className="metrics-strip metrics-strip--key" role="region" aria-label="Selected pool market metrics">
              <Metric label="Market cap" value={market.marketCapUsd ? formatUsd(market.marketCapUsd, { compact: true }) : "Unverified"} />
              <Metric label="FDV" value={market.fdvUsd ? formatUsd(market.fdvUsd, { compact: true }) : "Unavailable"} />
              <Metric label="Liquidity" value={formatUsd(market.liquidityUsd, { compact: true })} tone={market.liquidityUsd < 50_000 ? "warn" : ""} />
              <Metric label="24h volume" value={formatUsd(market.volume24h, { compact: true })} />
            </div>

            <details className="market-source">
              <summary>Market source · {dexName} / {asset.counterToken?.symbol || "?"}</summary>
              <div className={`pool-selector ${uniqueNetworks.size > 1 ? "pool-selector--ambiguous" : ""}`}>
                <div>
                  <label htmlFor="pool-source">Chart source</label>
                  <span>{uniqueNetworks.size > 1 ? "This address appears on multiple networks. Confirm the intended pool." : "The highest-liquidity exact-match pool was selected automatically."}</span>
                </div>
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
              </div>
            </details>

            <section className="plan-studio" id="plan-builder" tabIndex={-1} aria-labelledby="plan-builder-title">
              <header className="plan-studio__heading">
                <div>
                  <span>1 · Set the plan</span>
                  <h3 id="plan-builder-title">How much, how long, and what risk style?</h3>
                  <p>Price-trigger buys may never fill. Duration is the monitoring window, not a promised completion date.</p>
                </div>
                <span className="simulation-pill">Planned · not executed</span>
              </header>

              <div className="plan-builder-fields">
                <label>
                  Total DCA amount
                  <div className="money-input"><span>$</span><input inputMode="decimal" value={capitalInput} onChange={event => onCapitalChange(event.target.value)} onBlur={commitCapital} aria-label="Total DCA budget in US dollars" /></div>
                </label>
                <label>
                  Monitoring duration
                  <select value={reviewDays} onChange={event => setReviewDays(Number(event.target.value))}>
                    {!DURATION_OPTIONS.includes(reviewDays) && <option value={reviewDays}>{reviewDays} days</option>}
                    {DURATION_OPTIONS.map(value => <option key={value} value={value}>{value} days</option>)}
                  </select>
                </label>
                <label>
                  Conditional S1 target
                  <select value={targetChoice} onChange={event => setTargetChoice(event.target.value)}>
                    <option value="auto">Auto · from volatility</option>
                    {targetChoice !== "auto" && !TARGET_OPTIONS.includes(Number(targetChoice)) && (
                      <option value={targetChoice}>Custom · +{targetChoice}% from avg</option>
                    )}
                    {TARGET_OPTIONS.map(value => <option key={value} value={value}>Custom · +{value}% from avg</option>)}
                  </select>
                </label>
              </div>

              <div className="plan-builder-status">
                <div>
                  <span>{timeframe.label} evidence</span>
                  <strong>{planHeading}</strong>
                </div>
                {candleReady && <RiskMeter quality={selectedPlan.quality} />}
              </div>

              {candleLoading && (
                <div className="gate-box gate-box--warning">
                  <strong>Building this interval’s evidence</strong>
                  <p>The plan appears only after the selected pool’s real OHLCV is ready.</p>
                </div>
              )}
              {candleState === "error" && (
                <div className="gate-box gate-box--blocked" aria-label="Candle loading controls">
                  <strong>Candles could not be loaded</strong>
                  <p>{candleError}</p>
                  <button type="button" onClick={retryCandles}>Retry this interval</button>
                </div>
              )}
              {candleReady && selectedPlan.quality.blockers.length > 0 && (
                <div className="gate-box gate-box--blocked" role="alert">
                  <strong>Plans need more evidence</strong>
                  <ul>{selectedPlan.quality.blockers.map(item => <li key={item}>{item}</li>)}</ul>
                  {timeframeId !== "4h" && (selectedPlan.quality.candleCount < 20 || selectedPlan.quality.historyHours < 24) && (
                    <button type="button" onClick={() => chooseTimeframe("4h")}>Use 4H evidence</button>
                  )}
                </div>
              )}
              {candleReady && selectedPlan.quality.warnings.length > 0 && (
                <details className="plan-warnings">
                  <summary>{selectedPlan.quality.warnings.length} data and volatility note{selectedPlan.quality.warnings.length === 1 ? "" : "s"}</summary>
                  <ul>{selectedPlan.quality.warnings.map(item => <li key={item}>{item}</li>)}</ul>
                </details>
              )}
              {candleReady && planSet.valuationWarnings.length > 0 && (
                <div className="gate-box gate-box--warning" role="status">
                  <strong>Verify the reported valuation data</strong>
                  <ul>{planSet.valuationWarnings.map(item => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
              {canShowPlan && selectedPlan.targetAlreadyMet && (
                <div className="gate-box gate-box--warning" role="note">
                  <strong>Today’s quote is already above S1</strong>
                  <p>S1 is active only after the planned buys fill. This is not a current sell signal.</p>
                </div>
              )}

              <PlanProfileSelector
                plans={planSet.profiles}
                selectedId={selectedPlan.profileId}
                onSelect={setSelectedProfileId}
                valueMode={valueMode}
                currentPrice={market.priceUsd}
                currentMarketCap={market.marketCapUsd}
                currentFdv={market.fdvUsd}
              />
            </section>

            <section className="chart-panel chart-panel--studio" aria-labelledby="selected-chart-title">
              <div className="chart-studio-toolbar">
                <div>
                  <span>2 · Read the selected map</span>
                  <h3 id="selected-chart-title">{selectedPlan.profileName} · {asset.token.symbol?.toUpperCase()} / {valueMode === "price" ? "USD" : valueMode === "marketCap" ? "MCAP" : "FDV"}</h3>
                  <p><strong>{formatProjectedValue(currentProjection, valueMode)} current</strong> · Hollow rail markers are planned levels, not completed buys or sells.</p>
                </div>
                <div className="chart-studio-toolbar__controls">
                  <div className="value-mode-control" role="group" aria-label="Chart value unit">
                    {VALUE_MODES.map(item => {
                      const available = item.id === "price" || planSet.valuationScales[item.id]?.available;
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
                  <div className="timeframe-control" role="group" aria-label="Chart timeframe">
                    {TIMEFRAMES.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === timeframeId ? "active" : ""}
                        aria-pressed={item.id === timeframeId}
                        aria-label={item.ariaLabel}
                        onClick={() => chooseTimeframe(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <label className="touch-toggle">
                    <input type="checkbox" checked={showIllustrativeTouches} onChange={event => setShowIllustrativeTouches(event.target.checked)} />
                    <span>Past level touches</span>
                  </label>
                </div>
              </div>

              <DcaChart
                candles={candles}
                plan={candleReady ? selectedPlan : null}
                symbol={asset.token.symbol}
                loading={candleLoading}
                error={candleError}
                valueMode={valueMode}
                valuationScales={planSet.valuationScales}
                illustrativeEvents={illustrativeEvents}
                showIllustrativeTouches={showIllustrativeTouches}
              />

              {canShowPlan && (
                <details className="execution-details">
                  <summary>Open the full B1–B4 execution stages</summary>
                  <ExecutionMap
                    plan={selectedPlan}
                    tokenSymbol={asset.token.symbol}
                    reviewDays={reviewDays}
                    reviewBy={reviewBy}
                    valueMode={valueMode}
                  />
                </details>
              )}
            </section>

            {canShowPlan && (
              <PlanOutcome
                plan={selectedPlan}
                budget={capital}
                durationDays={reviewDays}
                valueMode={valueMode}
                market={market}
                tokenSymbol={asset.token.symbol}
              />
            )}

            {canShowPlan && (
              <section className="volatility-outlook" aria-labelledby="volatility-outlook-title">
                <header>
                  <div>
                    <span>Volatility context</span>
                    <h3 id="volatility-outlook-title">What this {reviewDays}-day window could expose</h3>
                  </div>
                  <span>{selectedPlan.targetSource === "volatility" ? `S1 auto · +${selectedPlan.targetPct}%` : `S1 custom · +${selectedPlan.targetPct}%`}</span>
                </header>
                <div className="outlook-range">
                  <div><span>Lower scenario</span><strong className="negative">{formatProjectedValue(planSet.volatilityOutlook.lower, valueMode)}</strong></div>
                  <div><span>Current reference</span><strong>{formatProjectedValue(planSet.volatilityOutlook.current, valueMode)}</strong></div>
                  <div><span>Upper scenario</span><strong className="positive">{formatProjectedValue(planSet.volatilityOutlook.upper, valueMode)}</strong></div>
                </div>
                <p>{planSet.volatilityOutlook.caveat} MCAP and FDV use the current reported supply ratio.</p>
              </section>
            )}

            <section className="analysis-accordions" aria-label="Safety and market details">
              <details>
                <summary>Safety limits</summary>
                <div className="safety-grid">
                  <article className="safety-card">
                    <span className="status-icon status-icon--good">✓</span>
                    <div><strong>Exact pool match</strong><p>The submitted contract is an exact token in the selected pool.</p></div>
                  </article>
                  <article className={`safety-card ${market.liquidityUsd < 50_000 ? "safety-card--warn" : ""}`}>
                    <span className="status-icon">$</span>
                    <div><strong>Observed liquidity</strong><p>{formatUsd(market.liquidityUsd)} in this pool. This does not guarantee execution price.</p></div>
                  </article>
                  <article className="safety-card safety-card--warn">
                    <span className="status-icon">!</span>
                    <div><strong>Contract security not scanned</strong><p>Honeypot, tax, mint/freeze authority and holder concentration need a security provider.</p></div>
                  </article>
                  <article className="safety-card safety-card--warn">
                    <span className="status-icon">?</span>
                    <div><strong>Unverified is not safe or unsafe</strong><p>Market data alone cannot prove that a contract is trustworthy.</p></div>
                  </article>
                  <div className="safety-disclaimer">Memecoins can lose 100%, liquidity can disappear, and real orders may execute far from the displayed levels.</div>
                </div>
              </details>

              <details>
                <summary>Market data and methodology</summary>
                <div className="market-table">
                  {[
                    ["Network", selectedNetwork],
                    ["DEX", dexName],
                    ["Pool", compactAddress(asset.poolAddress, 10, 8)],
                    ["Counter token", asset.counterToken?.symbol || "—"],
                    ["24h trades", hasTrades ? `${buys} buys · ${sells} sells` : "—"],
                    ["Valid chart candles", candleReady ? selectedPlan.quality.candleCount.toLocaleString() : "—"],
                    ["History covered", candleReady ? formatHistorySpan(selectedPlan.quality.historyDays) : "—"],
                    ["Expected candle coverage", candleReady && selectedPlan.quality.coverageRatio !== null ? formatPercent(selectedPlan.quality.coverageRatio * 100) : "—"],
                    ["Latest candle age", candleReady ? formatAgeHours(selectedPlan.quality.latestCandleAgeHours) : "—"],
                    ["ATR / live price", candleReady ? formatPercent(selectedPlan.quality.atrPct * 100) : "—"],
                    ["Monitoring review", reviewBy],
                    ["Pool resolved", resolvedAt ? new Date(resolvedAt).toLocaleString() : "—"],
                    ["Candles fetched", candlesAt ? new Date(candlesAt).toLocaleString() : "—"],
                  ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                  {poolPageUrl && <a href={poolPageUrl} target="_blank" rel="noreferrer">Open selected pool on GeckoTerminal ↗</a>}
                </div>
              </details>
            </section>

            {canShowPlan && (
              <div id="share-plan-card" className="share-plan-section" tabIndex={-1} role="region" aria-labelledby="onchain-share-title">
                <OnchainSharePanel
                  asset={asset}
                  plan={selectedPlan}
                  profile={selectedProfile}
                  reviewDays={reviewDays}
                  timeframeLabel={timeframe.label}
                  dataAsOf={candlesAt}
                  marketDataAsOf={resolvedAt}
                  candleDataAsOf={candlesAt}
                  valuationWarnings={planSet.valuationWarnings}
                  initialValueMode={valueMode}
                />
              </div>
            )}

            <footer className="onchain-footer">
              <span>Simulation only · Not financial advice · Planned B1–B4 / conditional S1 / manual X1</span>
              <span>Selected pool: {dexName} · {compactAddress(asset.poolAddress)}</span>
            </footer>

            {canShowPlan && (
              <div className="plan-sticky-actions" aria-label="Plan actions">
                <button type="button" onClick={() => scrollTo("share-plan-card")}>Customize card</button>
                <button type="button" onClick={() => scrollTo("plan-builder")}>Edit plan</button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
