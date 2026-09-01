# MEMORY — CMVNG DCA Simulator

> Long-lived facts, decisions, and conventions for this project. Unlike CHECKPOINT.md (which is a
> point-in-time status snapshot), this file holds things that stay true across sessions. Append new
> decisions with a date; don't delete history — strike through and annotate if something changes.

## Project identity

- **Product:** CMVNG DCA Simulator — a plain-language DCA decision engine for supported contract addresses and established CoinGecko assets.
- **Owner/brand:** CMVNG · domain `cmvng.app` · GitHub `cmvng/dca-simulator`
- **Audience:** retail crypto users; share-card virality on X/Instagram/Telegram is a core growth
  mechanic, not an afterthought.
- **Tone:** plain-language, hype-aware but honest — every surface carries
  "Not financial advice · DYOR".

## Architecture decisions (and why)

| Decision | Reason |
|---|---|
| ~~Single-file React app (`src/App.jsx`)~~ Superseded in v2 | The current app is modular across components, hooks, services, pure engines, and route-specific CSS |
| `/contract` is a route-level lazy feature; the established planner stays at `/` | Protects planner/public-plan behavior and keeps the chart dependency out of the default bundle |
| Vercel Edge Function proxy instead of direct CoinGecko calls | Edge caching means ~1 CoinGecko call per cache window no matter how many users; avoids free-tier rate limits; also solves canvas CORS via the image endpoint |
| Cache TTLs: list/history 12 h · live price 60 s · images 7 d | History barely changes; price must feel live |
| localStorage client cache with **stale fallback** | App degrades gracefully offline / when CoinGecko is down |
| Simulation scales historical window prices to the **live price** | Preserves real volatility shape without using stale absolute prices; "honest but anchored to now" |
| Volatility window = chosen DCA duration (3 months → last 90 days) | The risk shown matches the exact period the user plans to invest over |
| Established `/` scenario outcomes are computed from **live price**, not average entry | This is a behavior-locked legacy rule for the Top 250 simulator only. The scheduled `/contract` target is intentionally based on its running simulated average entry |
| Share-card profit color by **profit sign only**, never market verdict | Explicit design rule commented in the code — a positive profit is always green |
| Stablecoins + wrapped/staked assets blacklisted from the picker | DCA-ing into a $1-pegged or wrapper asset is meaningless |
| Established `/` entries are clamped to 4–180 | Behavior-locked Top 250 rule only. The contract scheduler has no hidden count cap and instead blocks a schedule that cannot allocate at least one cent to every intended buy |

## Hard constraints / gotchas

- ~~`/api/coins` does not run under plain Vite.~~ Superseded in v2: Vite middleware now invokes
  the same fetch-style handlers used in production, including the onchain routes added in 2026-08.
- Coin images must go through `?type=image` proxy when drawn to canvas (CORS taint), but plain
  `<img>` tags can use CoinGecko URLs directly.
- The proxy validates coin ids with `/^[a-z0-9-]+$/` and allow-lists only CoinGecko CDN hosts for
  the image endpoint — keep these checks if refactoring.
- Frequencies all cap at 6 months (`maxMonths: 6`); the months slider clamps when frequency changes.
- ~~Share card is fixed 1200×675.~~ Established-asset cards support X, square, and story; the simplified contract flow currently exports square and story scheduled-plan cards.
- localStorage keys are prefixed `cmv_`.

## Conventions

- Feature work uses scoped branches and review before the Railway-tracked branch is changed.
- The current palette and shared typography live in `src/styles/theme.js`; `DESIGN.md` is the design law.
- Established-asset formatting lives under `src/lib/formatting/`; contract formatting is isolated under
  `src/lib/onchain/formatters.js`.

## v2 decisions (2026-08-27 upgrade)

| Decision | Reason |
|---|---|
| v1 simulation math preserved bit-for-bit as the default scenario mode | Spec forbade arbitrary methodology changes; enforced by an oracle test comparing against a verbatim copy of v1 `runSim`/`analyzeMarket` |
| All calculation in pure modules under `src/lib/simulation/`, UI never computes | Testability; `npm test` runs on node:test with zero new prod dependencies |
| `MODEL_VERSION` (`src/lib/version.js`) stamped on results & saved plans | A saved result must stay attributable to the methodology that produced it |
| History extended 120d → 365d (proxy) | Enables backtests, rolling windows, reality check; market analysis still uses the last 120d slice to keep v1 verdict semantics |
| Three history uses kept strictly separate & labeled: scenario (scaled), backtest (real), rolling/statistical | Phase 55 rule — never mix historical actuals with synthetic paths unlabeled |
| Reality Check thresholds: typical = median abs plan-length move; Modest ≤ typical < Moderate ≤ 2×typical < Ambitious ≤ max observed gain < Extreme | Deterministic and documented; never phrased as probability |
| Monte Carlo = seeded bootstrap of historical daily log returns (mulberry32) | Reproducible (seed derived from plan config); "% of paths above target" labeled model-based estimate with limitations |
| ~~Floats kept for money outputs~~ Superseded by owner-approved MCR-001 | v3 allocates/rounds money in integer cents while prices and units remain continuous |
| Legacy `flatVal` = capital kept for v1 compatibility; visible Flat scenario computes units × unchanged price | v1's "flat = breakeven" was an approximation; both preserved and precise versions exist |
| Hash links remain supported alongside server-stored `/plan/<id>` links | Public plans use validated configs and hashed owner tokens; hashes remain a zero-storage option |
| Analytics = no-op-safe layer forwarding to plausible/gtag if the owner adds one | No analytics backend exists; never blocks or breaks the app; capital only ever bucketed |
| Local dev API via vite middleware invoking the edge handler | `vercel dev` no longer needed; same code path as production |
| Playwright smoke test with mocked API (playwright-core devDep, preinstalled Chromium) | Visual/runtime QA without hitting CoinGecko |

## Session log

- **2026-08-27** — Claude session: full codebase read; created `docs/PROJECT_OVERVIEW.md`,
  `docs/CHECKPOINT.md`, `docs/MEMORY.md` on branch `claude/project-docs-checkpoint-ywkwop`.
  Identified (not fixed) the open issues listed in CHECKPOINT.md — notably the duplicated/drifted
  `STABLE` blacklist and the scenario label basis inconsistency.
- **2026-08-27 (later)** — Claude session: v2 product upgrade on the same branch. Refactored the
  single-file app into components/hooks/lib/services; extracted a pure, tested engine (30 tests,
  v1-equivalence oracle); added results-page redesign, chart, purchase timeline, DCA vs hybrid vs
  lump sum, fees/slippage, break-even, drawdown, Reality Check, rolling windows, market conditions,
  Monte Carlo, historical backtest mode, wait-for-dip, saved plans + tracking, 3 share-card formats,
  shareable plan URLs, analytics layer, 365-day API history, staleness labels, local dev API,
  a11y/mobile pass, Playwright smoke QA. Not deployed; no PR opened. v1 known issues from the first
  session (blacklist dead code, stale comments, scenario label basis) resolved by the refactor.


## Design + platform decisions (2026-08-27, redesign runs)

| Decision | Reason |
|---|---|
| Design law lives in DESIGN.md; current system = "CLEAR BLUE" (light, shades-of-blue, soft floating cards, pills, Plus Jakarta Sans, one #2E6BF0 accent, semantic up/down only; amber #F7A23B only as the mid scenario-bar) | Owner-provided spec; replaced the interim "INSTRUMENT" look the same day (both green-theme and instrument styles are retired) |
| theme.js keeps stable export names across re-themes (T, monoLabel, monoFigure, body, card, btnPrimary…) | 29 consumers migrate mechanically; a re-skin never breaks the build mid-stage |
| Engine outputs frozen by behaviorLock.test.js + v1 oracle; visual runs never bump MODEL_VERSION | Saved plans stay attributable; redesigns provably change zero numbers |
| MCR-001 implemented with owner approval; current model is v3.0.0 | Cent allocation and rounding are behavior-locked; future numerical changes need another explicit methodology decision |
| /plan/<id> public pages: JSON-file KV in api/plans.js, sha256-hashed owner tokens, validated configs, PLANS_DIR env (Railway volume at /data) | Zero external dependencies; single-instance file store is right-sized; swap to hosted KV only if replicas ever exist |
| Mascot: placeholder SVG at src/assets/mascot.svg, allowed ONLY in empty/loading states + share-card avatar/corner, never behind data | Brand green clashes with the blue UI; official artwork should replace the file (same path) |
| Railway service `web` tracks `feat/cmvng-v2-upgrade` | Side-branch work is not deployment authorization; review and explicit merge direction come first |
| Repo gate harnesses: tools/smoke.mjs (13-step UI smoke) + tools/plans-e2e.mjs (public-plan lifecycle); CI = lint+test+build via GitHub Actions | Every gate is reproducible by anyone, not just this session |

## Session log (continued)

- **2026-08-27 (afternoon)** — INSTRUMENT redesign run (orchestrated, 5 gates): modular re-skin,
  ScenarioRuler/BuyBarcode, eslint baseline, behaviorLock test, smoke harness. Deployed to Railway
  (project cmvng-dca-simulator) at web-production-84b5c.up.railway.app after owner said
  "always deploy".
- **2026-08-27 (evening)** — CLEAR BLUE finishing run (gates A/B/C on feat/cmvng-clear-blue,
  merged to feat/cmvng-v2-upgrade → auto-deploy): full re-skin per new DESIGN.md, scenario bars
  replace the ruler, share cards re-skinned (mascot avatar), /plan/<id> public pages implemented
  (+9 tests → 40/40), CI added, legacy bridge removed, perf measured, MCR-001 raised and left
  open. Railway volume plans-data mounted at /data with PLANS_DIR=/data. Live traffic verified
  (real CoinGecko 200s, new bundle served).

## Onchain contract analyzer decisions (2026-08-30)

| Decision | Reason |
|---|---|
| `/contract` is a separate, lazy-loaded product route; `/`, `/plan/<id>`, and `#p=` keep the established-asset app | Protects public/shared-plan behavior and keeps Lightweight Charts out of the default bundle |
| Canonical identity is network + exact token address + selected pool address + token side | Symbols, names, and logos are not safe onchain identifiers; the same address can have several networks or pools |
| GeckoTerminal Public API is the keyless discovery/OHLCV baseline | It supports exact cross-network pool relationships and real pool candles without requiring credentials |
| Provider responses are normalized in `api/`; UI never consumes raw GeckoTerminal shapes | Makes pool choice, error behavior, and future provider substitution testable |
| The legacy onchain ladder engine is isolated under `src/lib/onchain/` and does not modify CMVNG Simulation v3 | It is no longer mounted in the primary contract flow; if revived, it must remain a separately labelled advanced price-zone strategy |
| ~~Primary buy areas are ranges derived from candles and ATR~~ Superseded by simple scheduled DCA | Price-zone bands remain legacy advanced methodology; the primary product now places simulated buys on an exact time calendar |
| Data confidence uses elapsed history as well as candle count; support-based mode needs at least seven days in the selected interval | Hundreds of intraday candles must not receive the same evidence credit as months of history |
| Fewer than two repeated support zones produces a “volatility-reference ladder,” never an “adaptive” or structural claim | ATR fallbacks are scenario references, not discovered market structure |
| Goal price is exactly the chosen percentage above the displayed simulated average entry | Prevents an unannounced live-price floor from changing the user's selected goal |
| The Clear Blue shell remains canonical; only the embedded candlestick instrument may use a dark navy trading canvas | Preserves CMVNG brand cohesion while honoring the owner's Fomo-style chart reference |
| ~~No future candles or projected price path are drawn~~ Superseded by the scheduled redesign | The new chart draws muted real history plus a visually distinct bright, seeded illustrative sample. It must always say that the sample is synthetic and not a forecast |
| Market-data checks and data confidence are not a contract-security score | Honeypots, taxes, authorities, holder concentration, and executable slippage remain unknown until separate providers are integrated |
| A conservative ladder may render with 20–29 candles only when they span at least 24 hours | ATR needs a usable sample, while withholding structural language prevents a short history from becoming false market-structure evidence |
| Adaptive mode requires at least 30 candles, seven elapsed days, and two repeated support zones | All three conditions are necessary; repeated-looking lows in a 20–29-candle sample remain volatility references |
| ~~Primary execution labels are `B1`–`B4`, `S1`, and `X1`~~ Superseded by scheduled DCA | The primary chart now uses grouped `B` simulated-buy markers, `S · target close`, and `! · risk review`; legacy zone identifiers are advanced-only history |
| ~~Primary buy zones are shaded ranges~~ Superseded by scheduled DCA | The current primary product is time scheduled. Price-zone bands may return only in a clearly separate advanced mode |
| ~~Duration is only a price-zone reassessment window~~ Superseded by scheduled DCA | Duration now defines the exact end-exclusive calendar and illustrative-sample horizon from 7 through 90 whole days |
| ~~Mobile contract analysis stays chart-first in both DOM and visual order~~ Superseded by Contract Plan Studio v2 | The current mobile decision path is input/settings → profiles → selected chart → outcomes/risk → share; DOM and visual order still match for keyboard and screen-reader navigation |
| Candle eligibility includes requested-interval density and freshness | A sparse or abandoned pool must not look current merely because 20 old trades span more than 24 hours |
| ~~B1–B4 allocations conserve integer cents and buy bands cannot overlap~~ Legacy advanced rule | The current scheduler conserves the total in cents across every intended timestamp; it has no zone-overlap concept |
| Contract, exact pool, evidence interval, amount, duration, frequency, value unit, and target persist in query parameters | New URLs delete legacy `plan` and `touches` parameters; refresh/share must restore the complete scheduled-plan context |

## Contract Plan Studio v2 decisions (2026-08-30, historical and superseded)

This table records the shipped v2 price-zone studio. That interface was later removed from the primary route because it did not match the owner’s intended time-scheduled DCA workflow. Its B1–B4/profile methodology is retained only for a possible future advanced mode.

| Decision | Reason |
|---|---|
| Always expose three price-zone profiles—Deep pullback, Balanced, and Early entry—when the evidence gates allow a plan | Users can compare meaningfully different allocation/spacing shapes without hiding alternatives; these are risk-shape choices, not investor suitability recommendations or financial advice |
| A selected duration of 7–90 days is a monitoring/reassessment window | Price-triggered zones may fill immediately, later, or never; duration must not be described as a promised fill schedule, holding period, or price forecast |
| Automatic targets scale with observed volatility; a user may explicitly override the target | Keeps the default internally consistent with the evidence while preserving user intent and preventing a hidden target change |
| Price is the source series; MCAP and FDV are implied views created with the current valuation-to-price ratio | Historical supply changes are not available from the candle provider. The UI and cards disclose the constant-supply-ratio assumption, never call the transformed data real valuation OHLCV, and never substitute price, MCAP, or FDV for a missing requested value |
| The planned action rail, retrospective touch markers, and modeled/executed events are distinct concepts | The rail is the current conditional plan. Historical touches are retrospective and in-sample—the levels were not known at those historical times—and are not fills, trades, or a backtest. Actual executions do not exist in the product |
| `X1` triggers only after an interval close below the reassessment level | A wick alone does not trigger it. `X1` is a manual review cue, not an automatic or guaranteed stop; gaps and execution effects can cause a larger loss than the exact-level scenario |
| `S1` and `X1` terminal values assume all four buys fill | Makes the scenario denominator explicit and avoids presenting a partially filled plan as fully deployed |
| Prefix-fill P/L is conditional on the quote later returning to today's quote | Without that explicit terminal-price assumption, the values could be mistaken for immediate profit. All outcomes remain before fees, slippage, taxes, gas, and route impact |
| Contract share cards have a dedicated model and renderer in X, square, and story formats | Each export carries the selected profile, budget, duration, unit, B/S/X levels, evidence quality, timestamp, selected pool/DEX/counter-token provenance, `PLANNED · NOT EXECUTED`, and the material modeling assumptions |
| Full contract-plan URL state is `address`, `pool`, `interval`, `amount`, `duration`, `plan`, `unit`, `target`, and `touches` | Refreshes and shares must reproduce both the market evidence and the user's selected plan presentation |
| Address draft state is separate from canonical resolved-token state | Typing a new address must not relabel an already resolved analysis, card, or share link before the new scan succeeds |
| The main simulator chart uses `+`, `−`, and `!` only as modeled annotations | `+` marks sampled modeled scheduled purchases, `−` marks a conditional target crossing with no sale modeled, and `!` marks the lowest modeled sample rather than an exit or stop |
| Mobile Plan Studio order is input/settings → profile choices → selected chart → outcomes/risk → share | The user can understand and choose the assumptions before interpreting the chart, then inspect consequences before exporting; unselected profile detail may collapse to keep the comparison scannable |

## Simple scheduled contract DCA decisions (2026-08-30)

| Decision | Reason |
|---|---|
| The primary `/contract` flow is CA → volatility → amount/frequency/duration/target → one chart → summary → card | This directly matches the owner’s mental model and removes the profile cards, evidence jargon, duplicate outcome grids, and B1/S1/X1 terminology that made v2 hard to understand |
| Buy cadence has exactly five primary options: 1 hour, 6 hours, 12 hours, daily, and weekly | These are the owner-requested scheduling choices and remain distinct from the automatically selected candle-evidence interval |
| Duration is an integer from 7 through 90 days and defines an end-exclusive schedule | The first buy is at the start; later buys are exactly one cadence apart; excluding the end makes a 30-day daily plan exactly 30 intended buys |
| The contract scheduler has no hidden purchase-count cap | A 90-day hourly plan produces 2,160 intended buys. If the budget has fewer cents than buys, the plan blocks instead of silently changing cadence/count or creating zero-cent purchases |
| Every intended buy receives an integer-cent allocation and all cents are conserved | Reuses the behavior-tested cent allocator without inheriting the established simulator’s 180-entry cap |
| Evidence timeframe is derived from cadence | 1-hour/6-hour buying uses `1H` evidence, 12-hour/daily uses `4H`, and weekly uses `1D`; the evidence interval stays technical rather than appearing as another user frequency |
| User-facing volatility is close-to-close realized log-return volatility | The UI shows a category plus a measurable typical daily swing. Categories are Stable-like below 2%, Moderate below 5%, High below 10%, Very high below 20%, and Extreme at 20% or above |
| “Stable-like” is observed behavior, not token identity | A flat recent sample cannot prove that an asset is a stablecoin, that a peg exists, or that it will hold |
| The bright sample is a seeded centered historical-return bootstrap anchored to the current quote | The same token/data/inputs produce the same illustration. Centering avoids projecting the sample’s historical drift, while explicit copy states that the path is synthetic, illustrative, `forecast: false`, and not an expected price |
| The bootstrap samples return/wick shapes independently | It intentionally does not claim to preserve historical trends, autocorrelation, volatility clustering, tail dependence, or a probability distribution of outcomes |
| Running average, target, and risk-review lines move after every simulated buy | The target is the user’s percentage above the running average. The review floor is one chosen-duration realized-volatility move below that average, bounded to a 3%–90% buffer |
| A target/review condition requires a simulated candle close and stops only later simulated buys | The terminal event preserves unused budget but does not execute or model a token sale, stop order, fill price, or guaranteed downside limit |
| Dense buy markers may be grouped visually, never numerically | The chart caps visual buy groups at 48 and uses `B×n`; the exact schedule/arithmetic remains intact and accessible buy data is provided below the chart |
| Price is the source; MCAP and FDV are implied current-ratio views | MCAP/FDV values use the provider’s current valuation-to-price ratio and are not historical valuation candles. Missing requested valuation falls back to Price and is never substituted with the other valuation |
| Technical evidence is secondary but not deleted | Pool choice, network ambiguity, liquidity, evidence coverage/freshness, provider timestamps, warnings, methodology, and safety assumptions live in one collapsed disclosure; blocking states remain visible |
| Scheduled contract share cards are square/story exports | Cards carry amount, cadence, duration, count, per-buy amount, volatility, target/review, exact token/pool provenance, timestamps, and simulation/not-forecast disclaimers |
| Legacy Deep pullback/Balanced/Early entry and B1–B4 UI is not mounted in the primary route | The source can support a later advanced price-zone mode only if it remains optional, separately named, and separately tested; it must not re-clutter the simple flow |

### Onchain operational constraints

- Public GeckoTerminal rate-limit documentation currently differs between a dynamic roughly 10 calls/minute and an older 30 calls/minute figure. Budget for the lower allowance, cache responses, and surface `429` states.
- GeckoTerminal documents a provider-limited OHLCV window. The UI reports actual returned history and no longer exposes the old `MAX` control because it duplicated the `1D` request instead of loading a distinct range.
- An address is supported only when an indexed pool contains the exact token, returns usable USD pricing/OHLCV, and passes minimum candle/liquidity gates.
- The scheduled-plan base gate is 20 valid candles spanning at least 24 hours, with at least 20% expected-interval coverage and a latest bar no older than three intervals (minimum one hour). The older 30-candle/seven-day/repeated-support structural gate applies only if the legacy price-zone analyzer is revived as an advanced mode.
- Market cap and FDV remain separate. Missing market cap is “unverified,” not zero and not FDV.
- The analyzer context displays network, pool, DEX, counter token, provider timestamps, and the onchain engine label; the pure calculation result intentionally contains only calculation inputs/outputs.

## Session log (continued — 2026-08-30)

- Contract-address milestone built on `codex/memecoin-dca-chart`, rebased from legacy `main` onto
  the current Railway-tracked `feat/cmvng-v2-upgrade` application. Added exact token/pool search,
  real OHLCV, pool selection, a TradingView-style chart, deterministic buy-zone/reference logic,
  durable route/engine tests, and product documentation. The established v3 simulation engine was
  intentionally left unchanged.
- PR #1 passed CI, Vercel preview, code review, and security review, then was squash-merged into
  `feat/cmvng-v2-upgrade` at `3e67f2f` after explicit owner approval. Railway auto-deployed it to
  `web-production-84b5c.up.railway.app`. Live browser verification confirmed the original planner
  at `/` and a populated `/contract` PEPE analysis with the exact Uniswap V2 pool, 500 real 4-hour
  candles, four buy zones, weighted entry, goal, and invalidation.
- **2026-08-30 (execution-map completion)** — Replaced the 30-candle all-or-nothing rule with a
  two-tier evidence contract: 20 candles plus 24 hours can show a conservative volatility-reference
  plan, while adaptive structure still requires 30 candles, seven days, and two repeated supports.
  The main experience now exposes shaded `B1`–`B4` trigger bands, `S1`, allocation/range details,
  invalidation, and a review window without predicting future candles. Mobile order is chart-first
  and the full six-metric context remains visible. Follow-up hardening added non-overlapping bands,
  exact-cent allocation, density/freshness gates, stale-response IDs, and refreshable URL context.
- PR #2 passed CI and independent test/React reviews, then was squash-merged into
  `feat/cmvng-v2-upgrade` at `ba5b621`. Railway production deployment
  `166f7b38-2830-4aee-8f7b-e4575379e1a4` reached `SUCCESS`. Live STONK verification used the exact
  Meteora pool and 26 daily candles: the chart displayed `B1`–`B4`, `S1`, and `X1`; the execution
  map showed all allocations and the review date; address/pool/interval survived reload; decimal
  budget input remained exact; and no app-origin console errors were present.
- **2026-08-30 (Contract Plan Studio v2 working tree)** — Expanded the single onchain ladder into
  three visible price-zone profiles with amount, monitoring-duration, target, and Price/MCAP/FDV
  controls. Added a Fomo-inspired planned-action rail, explicitly in-sample historical touches,
  close-confirmed manual X1 reassessment, conditional prefix/all-fill outcome math, three onchain
  share-card formats with market-source provenance, and complete query-state restoration. The main
  simulator chart also gained honest modeled purchase/target/low annotations. Mobile order now
  follows inputs and profiles into the selected chart, outcomes, risk context, and sharing. Local
  lint, 82 tests, build, and diff checks passed before publication.
- **2026-08-30 (Contract Plan Studio v2 release)** — PR #4 was merged into the Railway-tracked
  `feat/cmvng-v2-upgrade` branch at `98254613638e5b2c919e7fb3018053a83a261ef7`. Railway deployment
  `abdd60fe-b704-4093-aa81-1aafdcb18e7a` reached `SUCCESS`. Live production acceptance resolved
  STONK to the exact selected Meteora pool with 26 `1D` candles and verified all three profiles,
  Price/MCAP/FDV views, `B1`–`B4`/`S1`/`X1`, URL-state restoration across reload, card generation,
  main-chart annotations, and no app-origin console errors.
- **2026-08-30 (simple scheduled-DCA redesign working tree)** — Replaced the primary price-zone
  studio with the owner-requested scheduled flow: exact CA, plain volatility, amount, five buy
  cadences, 7–90-day duration, target, one Fomo-style chart, compact outcome, and scheduled-plan
  share card. Added `scheduledDca.js`, `ScheduledDcaChart`, and `ScheduledPlanSummary`; preserved
  exact-pool/data gates and moved market methodology/safety behind one disclosure. The exact-cent,
  end-exclusive scheduler has no hidden count cap; its seeded centered-return sample is explicitly
  illustrative and not a forecast; moving target/review close events stop only future simulated
  buys and never model a sale. Local lint, 100 tests, build, and diff checks passed. The updated
  browser smoke is code-complete but could not run locally because no usable Chromium binary was
  available. Publication, Railway deployment, and production browser acceptance remain pending.
- **2026-08-30 (simple scheduled-DCA production release)** — [PR #6](https://github.com/Cmvng/dca-simulator/pull/6)
  was merged into the Railway-tracked `feat/cmvng-v2-upgrade` branch at
  `c957777e9ab9bc7a9963c8eb792ba7a5a54a3cfd`. Railway deployment
  `d82b8a50-10ec-43b6-8f35-f128bbdedf73` reached `SUCCESS` at
  [web-production-84b5c.up.railway.app](https://web-production-84b5c.up.railway.app). Release gates
  passed full lint, 100/100 tests, production build, and diff check. Live STONK acceptance confirmed
  the resolved token and plain volatility, four plan inputs, all five cadence choices, one scheduled
  chart, Price/MCAP/FDV modes, grouped `B` markers, moving average entry, target-close and risk-review
  references, compact summary, plan-card section, and collapsed calculation/pool/safety disclosure.
  Card-generation, reload-restoration, and console interaction checks were not recorded in that
  initial acceptance pass; they were completed in the production-hardening follow-up below.
- **2026-08-30 (scheduled-DCA live hardening and final acceptance)** — The follow-up live STONK
  check verified that reload preserved amount `$123.45`, every-6-hours cadence, 7-day duration, 50%
  target, derived `1H` evidence, and all 28 scheduled buys. Price, FDV, and MCAP selections persisted.
  Generating a card produced the STONK scheduled-DCA PNG preview with **Download PNG** and
  **Copy live link** actions. Console review exposed a Lightweight Charts `unexpected base` error;
  [PR #7](https://github.com/Cmvng/dca-simulator/pull/7) added an explicit `1e18` price-format base
  and a smoke regression, then merged at `dd24717efac45163e78aa8ae17aac4fb1e11fd05`.
  Railway deployment `a5d32f46-606d-4fec-bcc6-e2ee49b9e284` reached `SUCCESS`. Fresh-tab retesting
  across Price, FDV, and MCAP had zero app-origin console errors, and the established root route
  loaded with zero app-origin errors. Local smoke execution remained unavailable because the
  environment had no usable Chromium binary, but equivalent live-browser acceptance passed.
