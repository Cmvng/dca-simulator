// Market data for the selected coin: live price (polled every 30s),
// 365-day history (validated), and the CMVNG market analysis over the last
// 120 days. All results carry staleness metadata.

import { useCallback, useEffect, useRef, useState } from "react";
import { getLivePrice, getHistory } from "../services/api.js";
import { validateHistory } from "../lib/simulation/validate.js";
import { analyzeMarket } from "../lib/simulation/scoring.js";

const POLL_MS = 30000;
export const ANALYSIS_DAYS = 120;

export function useMarketData(selected) {
  const [live, setLive] = useState(null);       // {price, change24h, fetchedAt, stale}
  const [loadingLive, setLoadingLive] = useState(false);
  const [history, setHistory] = useState(null); // {prices (cleaned), fetchedAt, stale, issues}
  const [loadingHist, setLoadingHist] = useState(false);
  const [histError, setHistError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const timerRef = useRef(null);
  // Bumped whenever the selected coin changes; in-flight responses for an
  // older generation must not write any state (wrong-coin race).
  const genRef = useRef(0);

  const pollLive = useCallback(async id => {
    const gen = genRef.current;
    setLoadingLive(true);
    const lp = await getLivePrice(id);
    if (gen !== genRef.current) return;
    if (lp) setLive({ ...lp.data, fetchedAt: lp.fetchedAt, stale: lp.stale });
    setLoadingLive(false);
  }, []);

  const loadHistory = useCallback(async id => {
    const gen = genRef.current;
    setLoadingHist(true); setHistError(null);
    try {
      const h = await getHistory(id);
      if (gen !== genRef.current) return;
      const v = validateHistory(h.data.prices);
      if (!v.ok) {
        setHistory(null); setAnalysis(null);
        setHistError(v.issues[v.issues.length - 1] || "Price history is unusable for this coin.");
        console.warn("History validation failed", id, v.issues);
      } else {
        setHistory({ prices: v.cleaned, fetchedAt: h.fetchedAt, stale: h.stale, issues: v.issues });
        setAnalysis(analyzeMarket(v.cleaned.slice(-ANALYSIS_DAYS)));
        if (v.issues.length) console.warn("History cleaned", id, v.issues);
      }
    } catch (e) {
      if (gen !== genRef.current) return;
      setHistory(null); setAnalysis(null);
      setHistError(e.message);
    } finally {
      if (gen === genRef.current) setLoadingHist(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    clearInterval(timerRef.current);
    setLive(null); setHistory(null); setAnalysis(null); setHistError(null);
    pollLive(selected.id);
    timerRef.current = setInterval(() => pollLive(selected.id), POLL_MS);
    loadHistory(selected.id);
    return () => {
      clearInterval(timerRef.current);
      genRef.current += 1;
    };
  }, [selected, pollLive, loadHistory]);

  return {
    live, loadingLive, history, loadingHist, histError, analysis,
    retryHistory: () => selected && loadHistory(selected.id),
    refreshLive: () => selected && pollLive(selected.id),
  };
}
