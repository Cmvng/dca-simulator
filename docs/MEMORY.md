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
| Single-file React app (`src/App.jsx`), inline styles, no CSS framework | Simplicity; whole app fits in one place |
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

- `/api/coins` **does not run under plain `vite` dev** — it's a Vercel Edge Function. Use
  `vercel dev` for full local testing.
- Coin images must go through `?type=image` proxy when drawn to canvas (CORS taint), but plain
  `<img>` tags can use CoinGecko URLs directly.
- The proxy validates coin ids with `/^[a-z0-9-]+$/` and allow-lists only CoinGecko CDN hosts for
  the image endpoint — keep these checks if refactoring.
- Frequencies all cap at 6 months (`maxMonths: 6`); the months slider clamps when frequency changes.
- Share card is fixed 1200×675 (X feed aspect ratio); filename pattern `cmvng-{symbol}-dca-x.png`.
- localStorage keys are prefixed `cmv_`.

## Conventions

- Commit style so far: short file-level messages ("Update App.jsx"); no PR workflow — direct to `main`.
- Color palette lives in the `G` constant in `App.jsx`; primary green `#16A34A`, dark `#052E16`.
- Currency/price/token formatting via `fmtUSD` / `fmtPrice` / `fmtPct` / `fmtTok` — reuse these,
  don't reformat ad hoc.

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
| Floats kept in the engine (not integer cents) | v1 parity requirement outweighed the integer-units guideline; guarded by invariant tests (no NaN/Inf, conservation) |
| Legacy `flatVal` = capital kept for v1 compatibility; visible Flat scenario computes units × unchanged price | v1's "flat = breakeven" was an approximation; both preserved and precise versions exist |
| Share plan links are hash-encoded config (`#p=…`), validated on decode | No server storage exists; zero personal data in links |
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
