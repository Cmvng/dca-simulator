# CHECKPOINT — CMVNG DCA Simulator

> Snapshot of where the project stands right now. Update this file whenever a work session ends,
> so the next session (human or AI) can resume instantly.

**Date:** 2026-08-27 (v2 upgrade session)
**Branch state:** `claude/project-docs-checkpoint-ywkwop` — carries the full v2 product upgrade
(not yet merged to `main`, no PR opened, NOT deployed).
**Model version:** CMVNG Simulation v2.0.0 (`src/lib/version.js`)

---

## ✅ What is DONE and working (v2)

**Foundation (P0)**
- [x] `App.jsx` (was ~1,030 lines) refactored into `components/` + `hooks/` + `lib/` + `services/`
- [x] Pure, tested simulation engine in `src/lib/simulation/` — **30/30 tests pass** (`npm test`),
  including a v1-equivalence oracle (verbatim copy of old `runSim`/`analyzeMarket` compared
  against the new engine) and invariant tests (capital conservation, monotone units, no NaN…)
- [x] Loading skeletons/progress, human-readable error states with retry, staleness labels
- [x] Data-quality gate (`validate.js`) — never silently simulates bad data
- [x] Accessibility pass (labels, roles, aria, focus-visible, prefers-reduced-motion)
- [x] Mobile-first verified via Playwright at 320/375/390/1280px — no horizontal overflow

**Core product (P1)**
- [x] Results page in the Phase-56 hierarchy (plan → market → outcome → scenarios → reality
  check → robustness → comparison → conditions → risk → chart → timeline → share → methodology)
- [x] Interactive SVG portfolio chart (hover/touch tooltips, dual axes, purchase markers)
- [x] Collapsible auditable purchase timeline table
- [x] DCA vs Hybrid vs Lump Sum (same capital, same evaluation price)
- [x] Fees (% + fixed per purchase) and slippage assumption under Advanced options
- [x] Target price card, break-even ladder (0/10/25/50/100% ROI), max simulated drawdown

**Differentiation (P2)**
- [x] Reality Check (deterministic thresholds: typical = median |move| over plan-length windows;
  Modest ≤ typical, Moderate ≤ 2×typical, Ambitious ≤ largest observed gain, else Extreme)
- [x] Rolling windows: plan re-run over every completed plan-length window in the past year
  (real prices) → best/median/worst + count; labeled "historical outcomes, not probabilities"
- [x] Explainable Market Conditions + "CMVNG Model Score (heuristic)" labeling + how-calculated
- [x] "How CMVNG calculates this" methodology panel (8 sections + limitations)

**Growth (P3)**
- [x] Share cards in 3 formats: X 1200×675 (v1 layout preserved), square 1080×1080, story 1080×1920
- [x] Shareable plan URLs (`#p=<base64url>` — config only, validated on decode, no personal data)
- [x] X intent / copy link / native share; post-share "create another plan / compare another coin"
- [x] Analytics event layer (`lib/analytics.js`) — forwards to plausible/gtag when present,
  no-op otherwise; funnel events wired (coin_selected, simulation_started/completed, share…)

**Retention (P4)**
- [x] Saved plans (localStorage, max 30) storing config + headline + **model version** + seed
- [x] Live tracking: plan vs reality using real prices since activation (schedule-following
  approximation, labeled)

**Advanced (P5)**
- [x] Historical backtest mode (real prices/dates, no scaling; incl. DCA-vs-lump for the period)
- [x] Hybrid strategy calculation (0–90% upfront; tested: 0%≡DCA, 100%≡lump)
- [x] Monte Carlo distribution mode (10,000 paths, bootstrap of historical daily returns,
  deterministic seed, percentiles + "model-based estimate" share above target, methodology+limits)
- [x] "What if I wait for a dip?" experiment (labeled as arithmetic, not a strategy)

**API / infra**
- [x] `api/coins.js`: history 120d→365d, `fetchedAt` in payloads, 429 pass-through with
  Retry-After, structured per-invocation logging, dead code removed
- [x] Vite dev middleware serves `/api/coins` locally (v1's "API 404 in dev" gap fixed)
- [x] `npm test` (node:test, zero new prod deps), `.gitignore`, SEO/OG meta + noscript in index.html

## ✔ Validation performed this session

- `npm test` → 30/30 pass · `npm run build` → clean (main bundle 73KB gzip; share/backtest/
  monte-carlo/saved-plans lazy-loaded) · Playwright smoke: 13/13 steps, zero console errors,
  full-page visual QA at desktop + mobile

## 🐛 Known issues / conscious limitations

- [ ] Engine uses floats (v1 parity requirement), not integer cents — covered by invariant tests
- [ ] v1's legacy `flatVal` field = capital (v1 approximation, kept for the oracle test);
  the visible Flat scenario computes precisely (units × unchanged price)
- [ ] "Trending" quick filter = biggest 24h movers (no CoinGecko trending endpoint via proxy)
- [ ] Tracking approximates executions with daily closes (labeled in UI)
- [ ] Share URL is hash-encoded config; server-stored short links (`/plan/<id>`) need a DB
- [ ] No SSR/prerendered SEO landing pages (SPA); meta/OG tags + noscript only
- [ ] No ESLint config yet; no CI workflow
- [ ] Edge-cache hit/miss ratio not measurable from the function itself (hits never invoke it) —
  invocations are logged as effective misses

## 🎯 Suggested next steps

1. Merge/PR this branch after review; deploy preview on Vercel and sanity-check `/api/coins`
   with real CoinGecko data (365d payload size, rate limits)
2. CI: GitHub Action for `npm test` + `npm run build`
3. Server-stored share pages (`/plan/<id>`) — needs KV/DB decision
4. Real SEO landing pages (per-coin calculators) — needs prerendering strategy
5. ESLint + formatting config

## 🔑 Context needed to resume

- Deploy target Vercel; env `COINGECKO_API_KEY` optional. **Do not deploy from this branch
  without the owner's go-ahead** (spec said "do not deploy").
- `npm run dev` now serves the API locally via vite middleware — `vercel dev` no longer required.
- The v1 methodology is intentionally preserved; changing any calculation requires bumping
  `MODEL_VERSION` and keeping the oracle test honest (update it consciously, never casually).
