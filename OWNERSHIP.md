# OWNERSHIP.md — file ownership per stage (feat/cmvng-v2-upgrade)

Rule: within a stage, every file has exactly one owner. Agents never edit
outside their OWNS set. The orchestrator owns integration and gates.

Context: the repo already contains the v2 feature set (modular engine + tests,
results page, backtest, sharing, saved plans) built earlier on
`claude/project-docs-checkpoint-ywkwop`. This run (a) locks that behaviour,
(b) applies the INSTRUMENT design system (DESIGN.md), (c) adds the missing
pieces (ScenarioRuler, BuyBarcode, share content picker, AssumptionsDrawer,
quick coins, lint). Engine math is frozen — any change requires a
METHODOLOGY CHANGE REQUEST.

## Stage 1 — foundation lock (sequential, orchestrator-owned)
- eslint.config.js, package.json ............................ orchestrator
- src/lib/simulation/behaviorLock.test.js (new) ............. orchestrator
- lint fixes across src/** (mechanical only) ................ orchestrator
- FROZEN this stage and all stages: src/lib/simulation/*.js (except new test),
  api/coins.js, server.js, src/services/api.js

## Stage 2 — INSTRUMENT core (pre-step sequential, then parallel)
Pre-step (single owner, blocks the stage): 
- src/styles/theme.js, src/components/ui.jsx, src/App.jsx,
  src/components/Header.jsx, index.html ..................... orchestrator
Parallel group 2A (disjoint):
- Agent "builder": src/components/{CoinSelector,CapitalInput,
  FrequencySelector,DurationSelector,TargetSelector,AdvancedOptions,
  SchedulePreview,LoadingState,ErrorState}.jsx
- Agent "instruments": src/components/results/{PortfolioChart}.jsx +
  NEW src/components/results/{ScenarioRuler,BuyBarcode}.jsx

## Stage 3 — results + differentiation restyle (parallel, disjoint)
- Agent "results": src/components/results/{ResultsView,MarketSnapshot,
  RealityCheck,MarketConditions,StrategyComparison,RollingWindows,RiskCards,
  DcaTimeline,WaitForDip,MonteCarloCard,Methodology}.jsx
  (may DELETE ScenarioGrid.jsx after wiring ScenarioRuler)
- Orchestrator: integration fixes only after agent returns.

## Stage 4 — growth (single agent + orchestrator)
- Agent "share": src/lib/sharing/shareCard.js,
  src/components/SharePanel.jsx (content picker: plan / reality check /
  dca vs lump sum), src/lib/planUrl.js (read-only unless bug)
- Orchestrator: docs/PUBLIC_PLANS.md (architecture note), analytics wiring
  checks (src/lib/analytics.js read-only).

## Stage 5 — retention + advanced restyle (single agent + orchestrator)
- Agent "retention": src/components/{SavedPlansPanel}.jsx,
  src/components/results/{BacktestView}.jsx,
  NEW src/components/AssumptionsDrawer.jsx
- Orchestrator: ResultsView/App integration of AssumptionsDrawer, docs,
  final gate, FINAL REPORT.

## Always orchestrator-only
.git operations, gates (build/lint/test/smoke), commits, OWNERSHIP.md,
DESIGN.md, docs/*.
