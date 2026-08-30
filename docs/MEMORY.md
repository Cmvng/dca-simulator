# MEMORY — CMVNG DCA Simulator

> Long-lived facts, decisions, and conventions for this project. Unlike CHECKPOINT.md (which is a
> point-in-time status snapshot), this file holds things that stay true across sessions. Append new
> decisions with a date; don't delete history — strike through and annotate if something changes.

## Project identity

- **Product:** CMVNG DCA Simulator — "How much could you make DCA-ing into crypto?"
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
| All outcome scenarios computed from **live price**, not avg entry | Target means "coin goes +X% from now" — most intuitive framing |
| Share-card profit color by **profit sign only**, never market verdict | Explicit design rule commented in the code — a positive profit is always green |
| Stablecoins + wrapped/staked assets blacklisted from the picker | DCA-ing into a $1-pegged or wrapper asset is meaningless |
| Entries clamped to 4–180, capital split evenly | Keeps sims sane at extreme frequency/duration combos |

## Hard constraints / gotchas

- ~~`/api/coins` does not run under plain Vite.~~ Superseded in v2: Vite middleware now invokes
  the same fetch-style handlers used in production, including the onchain routes added in 2026-08.
- Coin images must go through `?type=image` proxy when drawn to canvas (CORS taint), but plain
  `<img>` tags can use CoinGecko URLs directly.
- The proxy validates coin ids with `/^[a-z0-9-]+$/` and allow-lists only CoinGecko CDN hosts for
  the image endpoint — keep these checks if refactoring.
- Frequencies all cap at 6 months (`maxMonths: 6`); the months slider clamps when frequency changes.
- ~~Share card is fixed 1200×675.~~ Current cards support X, square, and story formats.
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
| The onchain ladder engine is isolated under `src/lib/onchain/` and does not modify CMVNG Simulation v3 | A price-triggered buy ladder is a different methodology from the behavior-locked time-scheduled simulator |
| Buy areas are ranges derived deterministically from historical candles and true-range ATR | Precise guaranteed entry prices would be false precision |
| Data confidence uses elapsed history as well as candle count; support-based mode needs at least seven days in the selected interval | Hundreds of intraday candles must not receive the same evidence credit as months of history |
| Fewer than two repeated support zones produces a “volatility-reference ladder,” never an “adaptive” or structural claim | ATR fallbacks are scenario references, not discovered market structure |
| Goal price is exactly the chosen percentage above the displayed simulated average entry | Prevents an unannounced live-price floor from changing the user's selected goal |
| The Clear Blue shell remains canonical; only the embedded candlestick instrument may use a dark navy trading canvas | Preserves CMVNG brand cohesion while honoring the owner's Fomo-style chart reference |
| No future candles or projected price path are drawn | The chart displays real historical OHLCV plus horizontal scenario levels only |
| Market-data checks and data confidence are not a contract-security score | Honeypots, taxes, authorities, holder concentration, and executable slippage remain unknown until separate providers are integrated |
| A conservative ladder may render with 20–29 candles only when they span at least 24 hours | ATR needs a usable sample, while withholding structural language prevents a short history from becoming false market-structure evidence |
| Adaptive mode requires at least 30 candles, seven elapsed days, and two repeated support zones | All three conditions are necessary; repeated-looking lows in a 20–29-candle sample remain volatility references |
| Main-chart execution labels are `B1`–`B4` for conditional buys and `S1` for the post-fill goal | Short identifiers make the trigger sequence legible on mobile while the adjacent map carries allocation, range, and risk detail |
| Buy zones are shaded ranges rather than single-price promises | The calculation produces upper/lower bands; showing only a midpoint would imply false fill precision |
| The review window is a user-selected reassessment period, not a forecast horizon or scheduled trade | It gives a stale-plan checkpoint without inventing future candles, dates of fills, or guaranteed execution |
| Mobile contract analysis stays chart-first in both DOM and visual order | Users asked to see the plan immediately, and matching orders preserves keyboard and screen-reader navigation |
| Candle eligibility includes requested-interval density and freshness | A sparse or abandoned pool must not look current merely because 20 old trades span more than 24 hours |
| B1–B4 allocations conserve integer cents and buy bands cannot overlap | Displayed allocations must add to the stated budget, and one market price must not ambiguously trigger several planned tranches |
| Contract, exact pool, and candle interval persist in query parameters | A refreshed or shared analysis must reopen the same evidence context instead of silently changing pools |

### Onchain operational constraints

- Public GeckoTerminal rate-limit documentation currently differs between a dynamic roughly 10 calls/minute and an older 30 calls/minute figure. Budget for the lower allowance, cache responses, and surface `429` states.
- GeckoTerminal documents a provider-limited OHLCV window. The UI reports actual returned history and no longer exposes the old `MAX` control because it duplicated the `1D` request instead of loading a distinct range.
- An address is supported only when an indexed pool contains the exact token, returns usable USD pricing/OHLCV, and passes minimum candle/liquidity gates.
- The base history gate is 20 valid candles spanning at least 24 hours, with at least 20% expected-interval coverage and a latest bar no older than three intervals (minimum one hour). Samples below 30 candles can produce only volatility-reference plans; structural mode remains gated at 30 candles plus seven days and two repeated zones.
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
