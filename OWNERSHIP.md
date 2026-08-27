# OWNERSHIP.md — CLEAR BLUE finishing run (branch feat/cmvng-clear-blue)

Rule: within a stage every file has exactly one owner; agents never edit
outside their OWNS set; orchestrator does integration + all gates. Engine
files (src/lib/simulation/** except new tests), src/services/api.js and
api/coins.js are FROZEN — behavior-lock outputs must not move. Deploys happen
only after the final gate, by merging into the Railway-tracked branch
feat/cmvng-v2-upgrade (owner's standing "always deploy" instruction).

## Stage A — CLEAR BLUE re-theme
Pre-step (orchestrator, blocks the stage):
- src/styles/theme.js, src/components/ui.jsx, src/App.jsx,
  src/components/Header.jsx, index.html, src/assets/* (logo mark + mascot
  placeholder + README), DESIGN.md, OWNERSHIP.md
Parallel agents (disjoint):
- Agent "builder-A": src/components/{CoinSelector,CapitalInput,
  FrequencySelector,DurationSelector,TargetSelector,AdvancedOptions,
  SchedulePreview,LoadingState,ErrorState}.jsx
- Agent "results-A": src/components/results/{ResultsView,MarketSnapshot,
  RealityCheck,MarketConditions,StrategyComparison,RollingWindows,RiskCards,
  DcaTimeline,WaitForDip,MonteCarloCard,Methodology,PortfolioChart,
  BuyBarcode}.jsx + NEW ScenarioBars.jsx (may DELETE ScenarioRuler.jsx)
- Agent "retention-A": src/components/{SavedPlansPanel,SharePanel,
  AssumptionsDrawer}.jsx, src/components/results/BacktestView.jsx

## Stage B — share cards in CLEAR BLUE
- Agent "cards-B": src/lib/sharing/shareCard.js only

## Stage C — remaining work
- Agent "plans-C": NEW api/plans.js (node store module + handler), server.js,
  vite.config.js (dev middleware for /api/plans), NEW src/lib/planApi.js,
  NEW src/components/PublicPlanView.jsx, NEW api/plans.test.js
- Orchestrator: App.jsx routing + SharePanel link-button integration (after
  plans-C returns), .github/workflows/ci.yml, legacy bridge removal in
  theme.js, integer-money METHODOLOGY CHANGE REQUEST (surfaced, not
  implemented), performance measurements, docs, final gate, merge-to-deploy.

## Always orchestrator-only
git, gates (build/lint/test/smoke), commits, docs/*.
