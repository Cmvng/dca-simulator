import React, { useEffect, useMemo, useRef, useState } from "react";
import DcaChart from "./DcaChart.jsx";
import { buildDcaPlan } from "../lib/onchain/dcaEngine.js";
import { compactAddress, formatPercent, formatPrice, formatTokenAmount, formatUsd } from "../lib/onchain/formatters.js";
import { getPoolCandles, resolveContract } from "../services/onchainApi.js";
import { LogoMark } from "./ui.jsx";
import "../onchain.css";

const TIMEFRAMES = [
  { id: "5m", label: "5M", timeframe: "minute", aggregate: 5, limit: 500 },
  { id: "15m", label: "15M", timeframe: "minute", aggregate: 15, limit: 500 },
  { id: "1h", label: "1H", timeframe: "hour", aggregate: 1, limit: 500 },
  { id: "4h", label: "4H", timeframe: "hour", aggregate: 4, limit: 500 },
  { id: "1d", label: "1D", timeframe: "day", aggregate: 1, limit: 500 },
  { id: "max", label: "MAX", timeframe: "day", aggregate: 1, limit: 1000, title: "Maximum provider window (up to roughly six months)" },
];

const ANALYSIS_TABS = [
  ["plan", "DCA Plan"],
  ["safety", "Token Safety"],
  ["market", "Market Data"],
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

function RiskMeter({ quality }) {
  const tone = quality.score >= 78 ? "good" : quality.score >= 55 ? "warn" : "danger";
  return (
    <div className={`risk-meter risk-meter--${tone}`}>
      <div>
        <span>Analysis data confidence</span>
        <strong>{quality.confidence}</strong>
      </div>
      <div className="risk-meter__score" aria-label={`Data confidence score ${quality.score} out of 100`}>
        {quality.score}<small>/100</small>
      </div>
    </div>
  );
}

export default function OnchainAnalyzer() {
  const [address, setAddress] = useState("");
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
  const [timeframeId, setTimeframeId] = useState("4h");
  const [capital, setCapital] = useState(500);
  const [capitalInput, setCapitalInput] = useState("500");
  const [targetPct, setTargetPct] = useState(50);
  const [activeTab, setActiveTab] = useState("plan");
  const [copied, setCopied] = useState(false);
  const resolveController = useRef(null);
  const candleController = useRef(null);
  const resultsRef = useRef(null);

  const timeframe = useMemo(
    () => TIMEFRAMES.find(item => item.id === timeframeId) || TIMEFRAMES[3],
    [timeframeId],
  );
  const market = useMemo(() => asset?.market || {}, [asset?.market]);
  const plan = useMemo(
    () => buildDcaPlan({ candles, market, capital, targetPct }),
    [candles, market, capital, targetPct],
  );
  const candleReady = candleState === "done";
  const candleLoading = candleState === "idle" || candleState === "loading";
  const planHeading = candleLoading
    ? "Analyzing real pool candles"
    : candleState === "error"
      ? "Candle data unavailable"
      : plan.mode === "blocked"
        ? "Plan unavailable"
        : plan.mode === "adaptive"
          ? "Support-based buy ladder"
          : "Volatility-reference ladder";

  const scan = async event => {
    event?.preventDefault();
    const value = address.trim();
    if (!value) return;

    resolveController.current?.abort();
    candleController.current?.abort();
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
      setAsset(payload.asset);
      setPoolOptions([payload.asset, ...(payload.alternatives || [])]);
      setResolvedAt(payload.asOf || new Date().toISOString());
      setResolveState("done");
      window.setTimeout(() => {
        resultsRef.current?.focus({ preventScroll: true });
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (error) {
      if (error.name === "AbortError") return;
      setResolveError(error.message || "The contract could not be resolved.");
      setResolveState("error");
    }
  };

  useEffect(() => {
    if (!asset) return undefined;
    candleController.current?.abort();
    const controller = new AbortController();
    candleController.current = controller;
    setCandleState("loading");
    setCandleError("");
    setCandles([]);
    setCandlesAt(null);

    getPoolCandles(asset, timeframe, { signal: controller.signal })
      .then(payload => {
        setCandles(payload.candles || []);
        setCandlesAt(payload.asOf || new Date().toISOString());
        setCandleState("done");
      })
      .catch(error => {
        if (error.name === "AbortError") return;
        setCandles([]);
        setCandleError(error.message || "Candles are unavailable for this pool.");
        setCandleState("error");
      });

    return () => controller.abort();
  }, [asset, timeframe, candleRequestVersion]);

  useEffect(() => () => {
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
    const digits = value.replace(/[^0-9]/g, "");
    if (!digits) {
      setCapitalInput("");
      setCapital(1);
      return;
    }
    const next = Math.min(10_000_000, Math.max(1, Number(digits) || 1));
    setCapitalInput(String(next));
    setCapital(next);
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
    if (next) {
      setCandles([]);
      setCandlesAt(null);
      setCandleError("");
      setCandleState("loading");
      setAsset(next);
    }
  };

  const chooseTimeframe = id => {
    if (id === timeframeId) return;
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setTimeframeId(id);
  };

  const retryCandles = () => {
    setCandles([]);
    setCandlesAt(null);
    setCandleError("");
    setCandleState("loading");
    setCandleRequestVersion(version => version + 1);
  };

  const onTabKeyDown = event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = ANALYSIS_TABS.findIndex(([id]) => id === activeTab);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? ANALYSIS_TABS.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + ANALYSIS_TABS.length) % ANALYSIS_TABS.length;
    const nextId = ANALYSIS_TABS[next][0];
    setActiveTab(nextId);
    document.getElementById(`analysis-tab-${nextId}`)?.focus();
  };

  return (
    <div className="onchain-page">
      <header className="onchain-header">
        <a className="onchain-header__brand" href="/" aria-label="CMVNG home">
          <LogoMark size={22} />
          <span>cmvng</span>
        </a>
        <nav aria-label="Product mode">
          <span>Contract analyzer</span>
          <a href="/">Top 250 plans</a>
        </nav>
      </header>
      <main className="onchain-app">
      <section className="contract-hero">
        <div className="eyebrow"><span className="live-dot" /> Onchain DCA Lab</div>
        <h1>Paste a memecoin contract.<br /><span>Map the risk before the buy.</span></h1>
        <p>Real pool candles, liquidity checks and historical DCA references. No generated future candles.</p>

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
              {resolveState === "loading" ? <><span className="button-spinner" /> Scanning</> : "Scan token"}
            </button>
          </div>
          <div className="contract-form__meta">
            <span>Auto-detects the indexed network and strongest exact-match pool.</span>
            <span>Data via GeckoTerminal</span>
          </div>
        </form>

        {resolveError && <div className="inline-alert inline-alert--danger" role="alert">{resolveError}</div>}
        <div className="visually-hidden" role="status" aria-live="polite">
          {resolveState === "loading"
            ? "Resolving the contract and exact pools."
            : resolveState === "done" && asset
              ? `${asset.token.symbol || asset.token.name || "Token"} loaded from ${selectedNetwork}. Loading candles.`
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
                <button className="address-copy" type="button" onClick={copyAddress}>
                  {compactAddress(asset.token.address, 9, 7)} <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
            <div className="token-heading__price">
              <strong>{formatPrice(market.priceUsd)}</strong>
              <span className={hasDayChange ? (dayChange >= 0 ? "positive" : "negative") : ""}>
                {hasDayChange ? `${dayChange >= 0 ? "▲" : "▼"} ${formatPercent(dayChange)} · 24h` : "24h change unavailable"}
              </span>
            </div>
          </div>

          <div className="metrics-strip">
            <Metric label="Market cap" value={market.marketCapUsd ? formatUsd(market.marketCapUsd, { compact: true }) : "Unverified"} />
            <Metric label="Liquidity" value={formatUsd(market.liquidityUsd, { compact: true })} tone={market.liquidityUsd < 50_000 ? "warn" : ""} />
            <Metric label="24h volume" value={formatUsd(market.volume24h, { compact: true })} />
            <Metric label="FDV" value={formatUsd(market.fdvUsd, { compact: true })} />
            <Metric label="24h trades" value={hasTrades ? `${buys} buys · ${sells} sells` : "—"} />
            <Metric label="Pool" value={`${dexName} · ${asset.counterToken?.symbol || "?"}`} />
          </div>

          {poolOptions.length > 1 && (
            <div className={`pool-selector ${uniqueNetworks.size > 1 ? "pool-selector--ambiguous" : ""}`}>
              <div>
                <label htmlFor="pool-source">Chart source</label>
                <span>{uniqueNetworks.size > 1 ? "This address was found on multiple networks. Confirm the intended chain and pool." : "The highest-liquidity pool was selected automatically. You can change it."}</span>
              </div>
              <select id="pool-source" value={selectedPoolKey} onChange={choosePool}>
                {poolOptions.map(option => {
                  const optionDex = typeof option.dex === "string" ? option.dex : option.dex?.name || option.dex?.id || "DEX";
                  const optionNetwork = NETWORK_NAMES[option.network] || option.network;
                  return (
                    <option key={`${option.network}:${option.poolAddress}`} value={`${option.network}:${option.poolAddress}`}>
                      {optionNetwork} · {optionDex} · {formatUsd(option.market?.liquidityUsd, { compact: true })} liquidity
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="workspace-grid">
            <section className="chart-panel">
              <div className="chart-panel__header">
                <span>Chart interval</span>
                <div className="timeframe-control" role="group" aria-label="Chart timeframe">
                  {TIMEFRAMES.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === timeframeId ? "active" : ""}
                      aria-pressed={item.id === timeframeId}
                      title={item.title}
                      onClick={() => chooseTimeframe(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <DcaChart
                candles={candles}
                plan={candleReady ? plan : null}
                symbol={asset.token.symbol}
                loading={candleLoading}
                error={candleError}
              />
            </section>

            <aside className="strategy-panel">
              <div className="strategy-panel__heading">
                <div>
                  <span>Plan settings · {timeframe.label} evidence</span>
                  <strong>{planHeading}</strong>
                </div>
                <span className="simulation-pill">Simulation</span>
              </div>

              <div className="field-grid">
                <label>
                  Total budget
                  <div className="money-input"><span>$</span><input inputMode="numeric" value={capitalInput} onChange={event => onCapitalChange(event.target.value)} onBlur={() => { if (!capitalInput) setCapitalInput("1"); }} aria-label="Total simulation budget in US dollars" /></div>
                </label>
                <label>
                  Goal from avg entry
                  <select value={targetPct} onChange={event => setTargetPct(Number(event.target.value))}>
                    {[10, 25, 50, 100, 200].map(value => <option key={value} value={value}>+{value}%</option>)}
                  </select>
                </label>
              </div>

              {candleLoading && (
                <div className="gate-box gate-box--warning" role="status">
                  <strong>Building this interval's evidence</strong>
                  <p>The previous interval is cleared while real OHLCV is fetched.</p>
                </div>
              )}

              {candleState === "error" && (
                <div className="gate-box gate-box--blocked" role="alert">
                  <strong>Candles could not be loaded</strong>
                  <p>{candleError}</p>
                  <button type="button" onClick={retryCandles}>Retry this interval</button>
                </div>
              )}

              {candleReady && <RiskMeter quality={plan.quality} />}

              {candleReady && plan.quality.blockers.length > 0 && (
                <div className="gate-box gate-box--blocked">
                  <strong>Plan blocked</strong>
                  {plan.quality.blockers.map(item => <p key={item}>× {item}</p>)}
                </div>
              )}

              {candleReady && plan.quality.warnings.length > 0 && (
                <div className="gate-box gate-box--warning">
                  <strong>Risk warnings</strong>
                  {plan.quality.warnings.map(item => <p key={item}>! {item}</p>)}
                </div>
              )}

              {candleReady && plan.targetAlreadyMet && (
                <div className="gate-box gate-box--warning">
                  <strong>Live price is already above this goal line</strong>
                  <p>The goal is calculated exactly from the simulated average entry. Reassess it instead of treating it as an upside forecast.</p>
                </div>
              )}

              {candleReady && plan.quality.canPlan && (
                <div className="plan-summary">
                  <div><span>Simulated avg entry</span><strong>{formatPrice(plan.weightedAverageEntry)}</strong></div>
                  <div><span>Goal line</span><strong className="gold">{formatPrice(plan.targetPrice)}</strong></div>
                  <div><span>Potential target value</span><strong>{formatUsd(plan.targetValue)}</strong></div>
                  <div><span>{plan.mode === "adaptive" ? "Structural invalidation" : "Scenario floor"}</span><strong className="negative">{formatPrice(plan.invalidationPrice)}</strong></div>
                </div>
              )}
            </aside>
          </div>

          <section className="analysis-panel">
            <div className="analysis-tabs" role="tablist" aria-label="Token analysis">
              {ANALYSIS_TABS.map(([id, label]) => (
                <button
                  key={id}
                  id={`analysis-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-controls={`analysis-panel-${id}`}
                  aria-selected={activeTab === id}
                  tabIndex={activeTab === id ? 0 : -1}
                  className={activeTab === id ? "active" : ""}
                  onClick={() => setActiveTab(id)}
                  onKeyDown={onTabKeyDown}
                >
                  {id === "plan" && candleReady && plan.legs.length ? `${label} (${plan.legs.length})` : label}
                </button>
              ))}
            </div>

            <div className="tab-content" id="analysis-panel-plan" role="tabpanel" aria-labelledby="analysis-tab-plan" hidden={activeTab !== "plan"}>
                <div className="tab-intro">
                  <div><strong>{candleLoading ? "Analyzing candles" : candleState === "error" ? "Candle data unavailable" : plan.mode === "blocked" ? "Plan unavailable" : plan.mode === "adaptive" ? "Potential support zones" : "Volatility reference bands"}</strong><span>{candleLoading ? "The plan will appear only after this interval's real OHLCV is ready." : candleState === "error" ? "Retry this interval from the plan settings panel." : plan.mode === "blocked" ? "Resolve the data-quality blockers before using any buy ladder." : plan.mode === "adaptive" ? "Repeated swing lows plus ATR spacing; never a price prediction." : "Insufficient repeated support evidence. These are ATR-spaced scenarios, not predicted entries."}</span></div>
                  <span>{formatUsd(plan.budget)} total</span>
                </div>
                {candleReady && plan.legs.length ? (
                  <div className="dca-legs">
                    {plan.legs.map(leg => (
                      <article className="dca-leg" key={leg.id}>
                        <div className="dca-leg__number">{leg.id}</div>
                        <div className="dca-leg__body">
                          <div><strong>{leg.label}</strong><span>{leg.rationale}</span></div>
                          <p>{formatPrice(leg.lower)} – {formatPrice(leg.upper)} <span>{formatPercent(leg.drawdownPct)} from live</span></p>
                          <small>{leg.supportTouches ? `${leg.supportTouches} clustered historical touches` : "Volatility reference band"}</small>
                        </div>
                        <div className="dca-leg__allocation">
                          <strong>{formatUsd(leg.amountUsd)}</strong>
                          <span>{leg.allocationPct}% · ≈ {formatTokenAmount(leg.tokenAmount)} {asset.token.symbol?.toUpperCase()}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">{candleLoading ? "Analyzing real pool candles…" : candleState === "error" ? "Candle data is unavailable. Retry the selected interval above." : "Resolve the data-quality blockers above before using a buy ladder."}</div>
                )}
            </div>

            <div className="tab-content safety-grid" id="analysis-panel-safety" role="tabpanel" aria-labelledby="analysis-tab-safety" hidden={activeTab !== "safety"}>
                <article className="safety-card">
                  <span className="status-icon status-icon--good">✓</span>
                  <div><strong>Exact pool match</strong><p>The submitted contract is an exact token in the selected pool.</p></div>
                </article>
                <article className={`safety-card ${market.liquidityUsd < 50_000 ? "safety-card--warn" : ""}`}>
                  <span className="status-icon">$</span>
                  <div><strong>Observed liquidity</strong><p>{formatUsd(market.liquidityUsd)} in the selected pool. This does not guarantee execution price.</p></div>
                </article>
                <article className="safety-card safety-card--warn">
                  <span className="status-icon">!</span>
                  <div><strong>Contract security not scanned</strong><p>Honeypot, tax, mint/freeze authority and holder concentration require a security provider.</p></div>
                </article>
                <article className="safety-card safety-card--warn">
                  <span className="status-icon">?</span>
                  <div><strong>Unverified is not unsafe — or safe</strong><p>Market data alone cannot prove that a contract is trustworthy.</p></div>
                </article>
                <div className="safety-disclaimer">
                  Passing these market-data checks never means a token is safe. Memecoins can lose 100%, liquidity can disappear, scanners can miss malicious behaviour, and orders may execute far from the displayed price.
                </div>
            </div>

            <div className="tab-content market-table" id="analysis-panel-market" role="tabpanel" aria-labelledby="analysis-tab-market" hidden={activeTab !== "market"}>
                {[
                  ["Network", selectedNetwork],
                  ["DEX", dexName],
                  ["Pool", compactAddress(asset.poolAddress, 10, 8)],
                  ["Counter token", asset.counterToken?.symbol || "—"],
                  ["Pool created", market.poolCreatedAt ? new Date(market.poolCreatedAt).toLocaleString() : "—"],
                  ["Valid chart candles", candleReady ? plan.quality.candleCount.toLocaleString() : "—"],
                  ["History covered", candleReady ? formatHistorySpan(plan.quality.historyDays) : "—"],
                  ["Plan mode", candleLoading ? "Loading" : candleState === "error" || plan.mode === "blocked" ? "Unavailable" : plan.mode === "adaptive" ? "Support-based" : "Volatility reference"],
                  ["Repeated support zones", candleReady ? String(plan.structuralSupportCount || 0) : "—"],
                  ["ATR / live price", candleReady ? formatPercent(plan.quality.atrPct * 100) : "—"],
                  ["Alternative exact pools", Math.max(0, poolOptions.length - 1).toLocaleString()],
                  ["Pool resolved", resolvedAt ? new Date(resolvedAt).toLocaleString() : "—"],
                  ["Candles fetched", candlesAt ? new Date(candlesAt).toLocaleString() : "—"],
                ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                {poolPageUrl && <a href={poolPageUrl} target="_blank" rel="noreferrer">Open selected pool on GeckoTerminal ↗</a>}
            </div>
          </section>

          <footer className="onchain-footer">
            <span>Automated historical market analysis · Not financial advice · Onchain ladder v1</span>
            <span>Selected pool: {dexName} · {compactAddress(asset.poolAddress)}</span>
          </footer>
        </section>
      )}
      </main>
    </div>
  );
}
