// CMVNG DCA Simulator — app shell and orchestration.
// UI in src/components (INSTRUMENT design system — see DESIGN.md), market
// data in src/hooks + src/services, all calculation in src/lib/simulation.

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { T, SANS, MONO, GLOBAL_CSS, btnPrimary, btnSecondary, btnOption, body } from "./styles/theme.js";
import { Section } from "./components/ui.jsx";
import Header from "./components/Header.jsx";
import CoinSelector from "./components/CoinSelector.jsx";
import CapitalInput from "./components/CapitalInput.jsx";
import FrequencySelector from "./components/FrequencySelector.jsx";
import DurationSelector from "./components/DurationSelector.jsx";
import TargetSelector from "./components/TargetSelector.jsx";
import AdvancedOptions from "./components/AdvancedOptions.jsx";
import SchedulePreview from "./components/SchedulePreview.jsx";
import ErrorState from "./components/ErrorState.jsx";
import { ProgressLoading } from "./components/LoadingState.jsx";
import ResultsView from "./components/results/ResultsView.jsx";
import { useCoins } from "./hooks/useCoins.js";
import { useMarketData } from "./hooks/useMarketData.js";
import { useSimulation } from "./hooks/useSimulation.js";
import { useSavedPlans } from "./hooks/useSavedPlans.js";
import { getFreq, validateCapital } from "./lib/simulation/dca.js";
import { decodePlanFromHash } from "./lib/planUrl.js";
import { track } from "./lib/analytics.js";

const SharePanel = React.lazy(() => import("./components/SharePanel.jsx"));
const SavedPlansPanel = React.lazy(() => import("./components/SavedPlansPanel.jsx"));
const BacktestView = React.lazy(() => import("./components/results/BacktestView.jsx"));

// Deterministic seed from the plan config → reproducible Monte Carlo runs.
function planSeed(coinId, config) {
  const s = `${coinId}|${config.capital}|${config.freqId}|${config.months}|${config.targetPct}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export default function App() {
  const coinsApi = useCoins();
  const [selected, setSelected] = useState(null);
  const market = useMarketData(selected);
  const simApi = useSimulation();
  const saved = useSavedPlans();

  const [capital, setCapital] = useState(500);
  const [freqId, setFreqId] = useState("daily");
  const [months, setMonths] = useState(3);
  const [targetPct, setTargetPct] = useState(50);
  const [advanced, setAdvanced] = useState({ feePct: 0, feeFixed: 0, slippagePct: 0, hybridPct: 30, monteCarlo: false });
  const [mode, setMode] = useState("scenario"); // scenario | backtest
  const [backtestOffsetMonths, setBacktestOffsetMonths] = useState(6);
  const [showSaved, setShowSaved] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [sharedBanner, setSharedBanner] = useState(false);
  const pendingUrlPlan = useRef(decodePlanFromHash());

  const shareRef = useRef(null);
  const freq = getFreq(freqId);
  const maxMo = freq.maxMonths;
  const safeMo = Math.min(months, maxMo);
  const capitalOk = validateCapital(capital).ok;

  useEffect(() => { if (months > maxMo) setMonths(maxMo); }, [freqId, months, maxMo]);
  useEffect(() => { setPlanSaved(false); }, [selected, capital, freqId, months, targetPct]);

  // Apply a shared plan from the URL once coins are loaded.
  useEffect(() => {
    const p = pendingUrlPlan.current;
    if (!p || coinsApi.coins.length === 0) return;
    const coin = coinsApi.coins.find(c => c.id === p.coinId);
    if (coin) {
      setSelected(coin);
      if (p.capital) setCapital(p.capital);
      if (p.freqId) setFreqId(p.freqId);
      if (p.months) setMonths(p.months);
      if (p.targetPct) setTargetPct(p.targetPct);
      setAdvanced(a => ({
        ...a,
        feePct: p.feePct ?? a.feePct, feeFixed: p.feeFixed ?? a.feeFixed,
        slippagePct: p.slippagePct ?? a.slippagePct, hybridPct: p.hybridPct ?? a.hybridPct,
      }));
      setSharedBanner(true);
      track("shared_plan_opened", { coin: coin.id });
    }
    pendingUrlPlan.current = null;
  }, [coinsApi.coins]);

  const config = useMemo(() => ({
    capital: Number(capital) || 500, freqId, months: safeMo, targetPct,
    feePct: advanced.feePct, feeFixed: advanced.feeFixed,
    slippagePct: advanced.slippagePct, hybridPct: advanced.hybridPct,
  }), [capital, freqId, safeMo, targetPct, advanced]);

  const backtestOffsetDays = backtestOffsetMonths * 30;
  const maxHistoryDays = market.history?.prices?.length || 0;
  const backtestOptions = useMemo(() => {
    const opts = [];
    for (let m = safeMo; m <= 12; m++) {
      if (m * 30 <= maxHistoryDays && m * 30 >= safeMo * 30) opts.push(m);
    }
    return opts;
  }, [safeMo, maxHistoryDays]);
  useEffect(() => {
    if (mode === "backtest" && backtestOptions.length && !backtestOptions.includes(backtestOffsetMonths)) {
      setBacktestOffsetMonths(backtestOptions[Math.min(1, backtestOptions.length - 1)]);
    }
  }, [mode, backtestOptions, backtestOffsetMonths]);

  const handleSim = () => {
    simApi.run({ selected, history: market.history, mode, config, backtestOffsetDays });
  };

  const resetAll = () => {
    setSelected(null); simApi.reset(); setSharedBanner(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const compareCoin = () => {
    setSelected(null); simApi.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSavePlan = () => {
    if (!simApi.sim || !selected) return;
    saved.save({
      coin: selected,
      config,
      mode,
      seed: planSeed(selected.id, config),
      headline: {
        refPrice: simApi.sim.refPrice, targetPrice: simApi.sim.targetPrice,
        targetVal: simApi.sim.targetVal, targetROI: simApi.sim.targetROI,
        units: simApi.sim.units, avgEntry: simApi.sim.avgEntry,
        totalInvested: simApi.sim.totalInvested, entries: simApi.sim.entries,
      },
    });
    setPlanSaved(true);
  };

  const loadSavedPlan = plan => {
    const coin = coinsApi.coins.find(c => c.id === plan.coin.id);
    if (coin) setSelected(coin); else return;
    setCapital(plan.config.capital); setFreqId(plan.config.freqId);
    setMonths(plan.config.months); setTargetPct(plan.config.targetPct);
    setAdvanced(a => ({ ...a, feePct: plan.config.feePct || 0, feeFixed: plan.config.feeFixed || 0, slippagePct: plan.config.slippagePct || 0, hybridPct: plan.config.hybridPct ?? 30 }));
    setShowSaved(false); simApi.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToShare = () => shareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const showSticky = simApi.simState === "done" && (simApi.sim || simApi.backtestResult);
  const canSimulate = selected && market.history && capitalOk && simApi.simState !== "running"
    && (mode !== "backtest" || backtestOptions.length > 0);

  const simView = simApi.sim
    ? { ...simApi.sim, monteCarloOn: advanced.monteCarlo, seed: planSeed(selected?.id || "", config) }
    : null;

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: SANS, color: T.ink, paddingBottom: showSticky ? 96 : 48 }}>
      <style>{GLOBAL_CSS}</style>

      {/* sticky action bar after a simulation — one primary, one secondary */}
      {showSticky && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: T.paper, borderTop: `0.5px solid ${T.line}`,
          padding: "10px 16px", display: "flex", gap: 8, alignItems: "stretch",
        }}>
          {mode === "scenario" && (
            <button onClick={scrollToShare} style={{ ...btnPrimary, flex: 2 }}>
              Share your plan
            </button>
          )}
          <button onClick={handleSim} disabled={simApi.simState === "running"} style={{ ...btnSecondary, flex: 1 }}>
            Recalculate
          </button>
        </div>
      )}

      <Header onOpenSaved={() => setShowSaved(v => !v)} savedCount={saved.plans.length} />

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>

        {sharedBanner && (
          <div role="status" style={{ borderTop: `0.5px solid ${T.line}`, borderBottom: `0.5px solid ${T.line}`, padding: "10px 0", marginBottom: 22, ...body, color: T.blueDeep }}>
            A shared plan was loaded from your link — review it below, then run the simulation.
          </div>
        )}

        {showSaved && (
          <Suspense fallback={null}>
            <SavedPlansPanel
              plans={saved.plans}
              onLoadPlan={loadSavedPlan}
              onRemove={saved.remove}
              onStartTracking={p => saved.startTracking(p.id, { startPrice: market.live?.price || p.headline.refPrice })}
              onStopTracking={saved.stopTracking}
              onClose={() => setShowSaved(false)}
            />
          </Suspense>
        )}

        {/* hero */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: SANS, fontSize: "clamp(26px,5vw,38px)", fontWeight: 500, color: T.ink, margin: 0, lineHeight: 1.15, letterSpacing: "-0.03em" }}>
            Build a crypto DCA plan.<br />Stress-test it against real data.
          </h1>
          <p style={{ ...body, marginTop: 12, marginBottom: 0 }}>
            Pick a coin, set your plan, test scenarios. A decision tool — not a prediction.
          </p>
        </div>

        {/* STEP 1 — coin */}
        <Section label="step 1 · choose your coin" ariaLabel="Step 1: choose your coin">
          {coinsApi.loading ? (
            <ProgressLoading label="Loading top 250 coins…" progress={coinsApi.progress} />
          ) : coinsApi.error ? (
            <ErrorState message={coinsApi.error} onRetry={coinsApi.retry} />
          ) : (
            <CoinSelector coins={coinsApi.coins} selected={selected} onSelect={setSelected} market={market} />
          )}
          {market.histError && selected && (
            <div style={{ marginTop: 10 }}>
              <ErrorState compact message={market.histError} onRetry={market.retryHistory} />
            </div>
          )}
        </Section>

        {/* STEP 2 — plan */}
        <Section label="step 2 · build your plan" ariaLabel="Step 2: build your plan">
          <CapitalInput capital={capital} onChange={setCapital} />
          <FrequencySelector freqId={freqId} months={safeMo} onChange={setFreqId} />
          <DurationSelector months={safeMo} maxMonths={maxMo} onChange={setMonths} />
          <TargetSelector targetPct={targetPct} onChange={setTargetPct} />
          <div style={{ marginTop: 16 }}>
            <AdvancedOptions config={advanced} onChange={setAdvanced} />
          </div>

          {/* mode switch */}
          <div role="radiogroup" aria-label="Simulation mode" style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {[
              { id: "scenario", label: "Scenario simulation", desc: "anchored to the live price" },
              { id: "backtest", label: "Historical backtest", desc: "real past prices and dates" },
            ].map(m => (
              <button key={m.id} role="radio" aria-checked={mode === m.id}
                onClick={() => { setMode(m.id); simApi.reset(); if (m.id === "backtest") track("historical_backtest_opened", {}); }}
                style={{ ...btnOption(mode === m.id), flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 13 }}>{m.label}</span>
                <span style={{ display: "block", fontFamily: MONO, fontSize: 11, letterSpacing: "0.03em", color: T.ink3, marginTop: 3 }}>{m.desc}</span>
              </button>
            ))}
          </div>

          {mode === "backtest" && (
            <div style={{ marginTop: 14 }}>
              <label htmlFor="bt-start" style={{ ...body, color: T.ink, display: "block", marginBottom: 6 }}>
                If I had started my {safeMo * 30}-day plan…
              </label>
              {backtestOptions.length === 0 ? (
                <div style={{ ...body }}>
                  {selected ? "Not enough price history for this coin and duration." : "Select a coin first."}
                </div>
              ) : (
                <select id="bt-start" value={backtestOffsetMonths} onChange={e => setBacktestOffsetMonths(Number(e.target.value))}
                  style={{ width: "100%", padding: "11px 12px", borderRadius: 2, border: `1px solid ${T.line}`, background: T.paper, fontSize: 15, fontFamily: SANS, color: T.ink }}>
                  {backtestOptions.map(m => (
                    <option key={m} value={m}>{m} month{m > 1 ? "s" : ""} ago</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <SchedulePreview selected={selected} capital={config.capital} freqId={freqId} months={safeMo} targetPct={targetPct} mode={mode} />
        </Section>

        {/* simulate — the primary action */}
        {selected && market.history && (
          <div style={{ margin: "22px 0 4px" }}>
            <button onClick={handleSim} disabled={!canSimulate} style={{
              ...btnPrimary,
              opacity: canSimulate || simApi.simState === "running" ? 1 : 0.5,
              cursor: canSimulate ? "pointer" : "not-allowed",
            }}>
              {simApi.simState === "running"
                ? simApi.simMsg
                : simApi.simState === "done"
                  ? "Recalculate"
                  : mode === "backtest" ? "Run historical backtest" : "Show me the numbers"}
            </button>
          </div>
        )}

        {simApi.simError && <ErrorState message={simApi.simError} onRetry={handleSim} />}

        {/* results */}
        {simApi.simState === "done" && mode === "scenario" && simView && selected && market.analysis && (
          <ResultsView
            sim={simView} selected={selected} analysis={market.analysis}
            live={market.live} history={market.history}
            targetPct={targetPct}
            shareRef={shareRef}
            shareSlot={
              <Suspense fallback={null}>
                <SharePanel
                  selected={selected} sim={simView} targetPct={targetPct} months={safeMo}
                  freqLabel={freq.label} analysis={market.analysis} livePrice={market.live}
                  onSavePlan={handleSavePlan} planSaved={planSaved}
                  onNewPlan={resetAll} onCompareCoin={compareCoin}
                />
              </Suspense>
            }
          />
        )}

        {simApi.simState === "done" && mode === "backtest" && simApi.backtestResult && selected && (
          <Suspense fallback={null}>
            <BacktestView bt={simApi.backtestResult} selected={selected} />
          </Suspense>
        )}

        <footer style={{ borderTop: `0.5px solid ${T.line}`, marginTop: 36, paddingTop: 14, paddingBottom: 8, fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", color: T.ink3 }}>
          scenario simulator · not financial advice · dyor · data via coingecko · cmvng
        </footer>
      </main>
    </div>
  );
}
