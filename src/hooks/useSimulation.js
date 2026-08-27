// Runs the simulation engine with staged progress messaging.
// The engine itself is synchronous and fast; the short staged delay
// communicates that live data is being re-fetched (it is).

import { useCallback, useState } from "react";
import { runScenarioSimulation, runBacktest } from "../lib/simulation/engine.js";
import { getLivePrice } from "../services/api.js";
import { track } from "../lib/analytics.js";

export function useSimulation() {
  const [simState, setSimState] = useState("idle"); // idle | running | done | error
  const [sim, setSim] = useState(null);
  const [backtestResult, setBacktestResult] = useState(null);
  const [simMsg, setSimMsg] = useState("");
  const [simError, setSimError] = useState(null);

  const run = useCallback(async ({ selected, history, mode, config, backtestOffsetDays }) => {
    if (!history || !selected) return;
    setSimState("running"); setSim(null); setBacktestResult(null); setSimError(null);
    track("simulation_started", { coin: selected.id, mode, freq: config.freqId, months: config.months, capital: config.capital });

    const windowLabel = `${config.months * 30} days`;
    const msgs = mode === "backtest"
      ? ["Loading historical prices…", "Replaying your plan…", "Almost there…"]
      : ["Fetching live price…", `Analysing the last ${windowLabel} of data…`, "Calculating your entries…", "Almost there…"];
    let i = 0; setSimMsg(msgs[0]);
    const iv = setInterval(() => { i = (i + 1) % msgs.length; setSimMsg(msgs[i]); }, 700);

    try {
      let lp = null;
      if (mode !== "backtest") lp = await getLivePrice(selected.id);
      await new Promise(r => setTimeout(r, 1200));

      if (mode === "backtest") {
        const bt = runBacktest({
          capital: config.capital, freqId: config.freqId, months: config.months,
          startOffsetDays: backtestOffsetDays, prices: history.prices,
          feePct: config.feePct, feeFixed: config.feeFixed, slippagePct: config.slippagePct,
        });
        if (!bt.ok) { setSimError(bt.reason); setSimState("error"); return null; }
        setBacktestResult(bt);
        setSimState("done");
        track("simulation_completed", { coin: selected.id, mode });
        return { backtest: bt, live: lp };
      }

      const result = runScenarioSimulation({
        capital: config.capital, freqId: config.freqId, months: config.months,
        targetPct: config.targetPct, prices: history.prices,
        livePrice: lp?.data?.price,
        feePct: config.feePct, feeFixed: config.feeFixed,
        slippagePct: config.slippagePct, hybridPct: config.hybridPct,
      });
      setSim(result);
      setSimState("done");
      track("simulation_completed", { coin: selected.id, mode, target: config.targetPct });
      return { sim: result, live: lp };
    } catch (e) {
      console.error("Simulation failed", e);
      setSimError("The simulation hit an unexpected problem. Please try again.");
      setSimState("error");
      return null;
    } finally {
      clearInterval(iv);
    }
  }, []);

  return { simState, sim, backtestResult, simMsg, simError, run, reset: () => { setSimState("idle"); setSim(null); setBacktestResult(null); } };
}
