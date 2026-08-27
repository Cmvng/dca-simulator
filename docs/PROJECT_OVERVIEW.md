# CMVNG DCA Simulator — Project Overview (v2)

> **What this is:** a crypto DCA **decision engine** — build a plan, stress-test it against
> realistic market conditions (scenarios, backtests, distributions), compare it with lump-sum
> deployment, and share or track it. Brand: **CMVNG** (`cmvng.app`). Data: CoinGecko via a
> caching Vercel Edge proxy. The app never presents a simulation as a forecast.
>
> *v1 of this document (single-file app) is preserved in git history at commit `18f7647`.*

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 4, inline styles (no CSS framework), custom SVG chart |
| Engine | Pure ES modules in `src/lib/simulation/` — no UI imports, fully unit-tested |
| Tests | `node --test` (Node 20+), zero extra runtime deps; Playwright smoke via `playwright-core` |
| Backend | One Vercel **Edge Function** (`api/coins.js`) proxying CoinGecko with edge caching |
| Hosting | Vercel (not deployed from the v2 branch yet) |

## 2. Repository layout

```
api/coins.js                      Edge proxy: list / history(365d) / price / image
vite.config.js                    + dev middleware that serves /api/coins locally
src/
  main.jsx                        React root
  App.jsx                         orchestration only (state, mode, wiring)
  styles/theme.js                 palette + shared styles + global CSS
  services/api.js                 fetch, localStorage cache, staleness, stale fallback
  hooks/                          useCoins, useMarketData, useSimulation, useSavedPlans
  components/
    Header, CoinSelector, CapitalInput, FrequencySelector, DurationSelector,
    TargetSelector, AdvancedOptions, SchedulePreview, SharePanel, SavedPlansPanel,
    ErrorState, LoadingState, ui.jsx (primitives)
    results/
      ResultsView (assembly), MarketSnapshot, ScenarioGrid, RealityCheck,
      MarketConditions, StrategyComparison, RollingWindows, RiskCards,
      PortfolioChart, DcaTimeline, MonteCarloCard, WaitForDip, BacktestView,
      Methodology
  lib/
    version.js                    MODEL_VERSION (currently 2.0.0)
    simulation/
      dca.js                      schedule, execution (fees/slippage), lump/hybrid, break-even
      historical.js               scaled-window (v1), backtest slices, rolling windows, moves
      scenarios.js                scenario set, reality check, wait-for-dip
      scoring.js                  analyzeMarket (v1 port), explainable market conditions
      statistics.js               avg/std/percentile/drawdown/log-returns
      monteCarlo.js               seeded bootstrap distribution mode
      validate.js                 data-quality gate
      engine.js                   runScenarioSimulation / runBacktest (orchestrators)
      *.test.js                   30 tests incl. v1-equivalence oracle + invariants
    formatting/  money, percentage, dates
    sharing/shareCard.js          canvas cards: X 1200×675, square 1080×1080, story 1080×1920
    planUrl.js                    hash-encoded shareable plan links (validated on decode)
    savedPlans.js                 local plans + live tracking (model-versioned)
    analytics.js                  no-op-safe event layer
docs/                             PROJECT_OVERVIEW (this file), CHECKPOINT, MEMORY
```

## 3. The three simulation modes (kept strictly separate)

1. **Scenario simulation** (default; v1 methodology preserved exactly): the historical window
   matching the plan's duration is scaled so its average sits on the live price; entries are
   sampled evenly across it; every outcome (target/flat/−20%/−50%/derived) is valued from the
   live price. Anchored to now, real volatility shape — a plausible path, never a forecast.
2. **Historical backtest**: actual prices and dates from a chosen completed period, no scaling.
   Includes a same-period DCA-vs-lump comparison.
3. **Statistical (distribution) mode** (Advanced): 10,000 paths bootstrapped from the window's
   daily log returns with a deterministic seed; reports percentiles and the share of paths above
   target, labeled "model-based estimate" with methodology and limitations.

Supporting analyses derived from real (unscaled) history: **Reality Check** (target vs median
absolute plan-length move / largest observed move, deterministic labels), **rolling windows**
(plan re-run over every completed plan-length window → best/median/worst), derived best/worst
scenario cards, drawdown along the path, break-even ladder, and "what if I wait for a dip".

## 4. Engine guarantees

- **v1 equivalence**: `engine.test.js` embeds a verbatim copy of the original `runSim` and
  `analyzeMarket`; with default options the new engine must match them exactly.
- **Invariants tested**: contributions sum to capital; cumulative units never decrease;
  avgEntry = invested/units; value = units × price; fees ≥ 0 and reduce units; hybrid(0%) ≡ DCA,
  hybrid(100%) ≡ lump sum; no NaN/Infinity; Monte Carlo deterministic per seed with ordered
  percentiles; validation rejects garbage and flags cleaned data.
- **Model versioning**: results and saved plans carry `MODEL_VERSION`; bump it whenever a
  calculation changes.

## 5. API proxy (`api/coins.js`)

| Endpoint | Purpose | Edge cache |
|---|---|---|
| `?type=list` | Top 250 (3 pages, stables/wrapped filtered) → `{fetchedAt, coins}` | 12 h |
| `?type=history&id=X` | 365-day daily history → `{prices…, fetchedAt}` | 12 h |
| `?type=price&id=X` | Live price + 24h → `{fetchedAt, data}` | 60 s |
| `?type=image&url=X` | CORS-safe image proxy (CoinGecko CDN allow-list) | 7 d |

Ids validated (`^[a-z0-9-]{1,64}$`); 429s pass through with Retry-After and a human message;
every invocation (≈ edge-cache miss) logs `{type, status, ms}` as JSON. The client
(`services/api.js`) layers a localStorage cache with stale-fallback and surfaces
`fetchedAt`/`stale` so the UI always shows "Updated X ago" and labels stale data.

## 6. Sharing & retention

- **Cards**: three canvas formats with CMVNG branding, plan, headline, scenarios, model label and
  the non-advice footer. Profit color is always by sign, never by market verdict.
- **Links**: `#p=<base64url config>` rebuilds the plan client-side; contains no personal data;
  decode is strictly validated. Server-stored `/plan/<id>` pages are future work (needs a DB).
- **Saved plans** (localStorage, ≤30) store config, headline, seed and model version.
  **Tracking** compares plan vs reality using real daily prices since activation (labeled
  approximation).

## 7. Honesty rules baked into the UI

Targets are "scenarios you choose", never forecasts; historical outputs are "observations, not
probabilities"; the probability-like Monte Carlo number is labeled model-based with disclosed
assumptions; the score is the "CMVNG Model Score (heuristic)" with a how-it-works panel; all
live data is timestamped and stale data labeled; the methodology panel ("How CMVNG calculates
this") covers data source, windows, normalization, schedule, fees, scenarios, score and
limitations.

## 8. Running & validating

```bash
npm install
npm run dev     # /api/coins served locally by vite middleware (same edge handler as prod)
npm test        # 30 engine tests
npm run build   # main bundle ~73KB gzip; share/backtest/MC/saved-plans lazy-loaded
```

Visual/runtime QA: Playwright smoke script (mocked API) drives coin selection → simulation →
share card → save plan → backtest → mobile viewports; see CHECKPOINT for the latest run.

## 9. Status & open items

See `docs/CHECKPOINT.md` (current status, known limitations, next steps) and `docs/MEMORY.md`
(decisions and their reasons). Headlines: not deployed from this branch; no CI yet; no SSR SEO
pages; share links are client-encoded only.

---

*Updated 2026-08-27 during the v2 upgrade on branch `claude/project-docs-checkpoint-ywkwop`.*
