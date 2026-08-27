# CHECKPOINT — CMVNG DCA Simulator

> Snapshot of where the project stands right now. Update this file whenever a work session ends,
> so the next session (human or AI) can resume instantly.

**Date:** 2026-08-27
**Branch state:** `main` at commit `1a6ae37` ("Update App.jsx") — 17 commits total.
**Docs branch:** `claude/project-docs-checkpoint-ywkwop` (this file + PROJECT_OVERVIEW.md + MEMORY.md).

---

## ✅ What is DONE and working

- [x] Vite + React 18 scaffold (`index.html`, `src/main.jsx`, `vite.config.js`, `package.json`)
- [x] Full single-page UI in `src/App.jsx`:
  - [x] Top-250 coin picker with search, logos, live prices, 24h change
  - [x] Stablecoin / wrapped-asset filtering
  - [x] Live price polling (30s interval, 60s cache)
  - [x] 120-day history fetch + market analysis (trend, momentum, volatility, verdict score)
  - [x] DCA plan builder: capital, frequency (12h/daily/weekly/bi-weekly), 1–6 months, target %
  - [x] Simulation engine (`runSim`) — duration-matched volatility window, scaled to live price
  - [x] Results: target outcome, breakdown, flat/-20%/-50% scenarios, market snapshot
  - [x] 1200×675 canvas share card (PFP upload, coin logo, plan + scenarios, CMVNG branding)
  - [x] Sticky bottom bar (Share / Recalculate) after simulation
  - [x] localStorage caching with stale-fallback on network failure
- [x] Vercel Edge proxy `api/coins.js` (list / history / price / image endpoints, edge-cached,
  id validation, image URL allow-list, optional `COINGECKO_API_KEY`)
- [x] Project documentation (`docs/PROJECT_OVERVIEW.md`) — this session

## 🚧 In progress / not started

- [ ] Nothing currently mid-flight — app is feature-complete for v1

## 🐛 Known issues (open, none fixed yet — full detail in PROJECT_OVERVIEW.md §12)

- [ ] `STABLE` blacklist duplicated in `App.jsx` (dead code) and `api/coins.js` (live) — drifted
- [ ] Unused `origin` variable in proxy `jsonResponse()`
- [ ] Stale comments ("3 parallel calls" in `getCoins`, "120 days" in sim loading message)
- [ ] Downside scenario labels use `avgEntry`-based prices while values use live-price basis
- [ ] `README.md` is a one-liner
- [ ] No tests / lint / CI; no `vercel.json`

## 🎯 Suggested next steps (priority order)

1. Fix the scenario label/value basis inconsistency (small, user-visible correctness issue)
2. Expand `README.md` (can borrow from PROJECT_OVERVIEW.md) with `vercel dev` local-run notes
3. Remove dead frontend `STABLE` set or share one list between front/back
4. Add OG/social meta tags to `index.html` for link previews of cmvng.app
5. Unit tests for `runSim` / `analyzeMarket`

## 🔑 Context needed to resume

- App is deployed on **Vercel**; the `/api/coins` function only runs there (or via `vercel dev`) —
  plain `npm run dev` gives a UI with failing API calls.
- Optional env var on Vercel: `COINGECKO_API_KEY` (CoinGecko demo key).
- Brand: **CMVNG**, domain **cmvng.app**, green theme `#16A34A`.
- Everything UI-related lives in one file: `src/App.jsx`. Keep it that way unless the owner asks
  to split it.
