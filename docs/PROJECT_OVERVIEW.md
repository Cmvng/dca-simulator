# CMVNG DCA Simulator — Project Overview

> **What this is:** A single-page web app that lets anyone simulate a Dollar-Cost-Averaging (DCA)
> strategy into any of the top 250 cryptocurrencies, see realistic outcome numbers (profit target,
> flat, -20%, -50% scenarios), and generate a branded, shareable image card for X / Instagram / Telegram.
>
> **Live data source:** CoinGecko (via a caching Vercel Edge proxy)
> **Brand:** CMVNG (`cmvng.app`)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (single component file), inline styles — no CSS framework |
| Build tool | Vite 4 with `@vitejs/plugin-react` |
| Backend | One Vercel **Edge Function** (`api/coins.js`) acting as a caching proxy to CoinGecko |
| Data API | CoinGecko v3 (free tier, optional demo API key via `COINGECKO_API_KEY` env var) |
| Hosting | Vercel (frontend static build + edge function under `/api`) |
| Share card | HTML5 `<canvas>` rendered client-side, exported as PNG data URL |

There are **no other dependencies** — no router, no state library, no CSS files. The entire UI
lives in `src/App.jsx` (~1,030 lines).

## 2. Repository Layout

```
dca-simulator/
├── index.html          # Vite entry — title "DCA Outcome Simulator"
├── package.json        # react, react-dom, vite, @vitejs/plugin-react
├── vite.config.js      # minimal — just the React plugin
├── api/
│   └── coins.js        # Vercel Edge proxy (list / history / price / image endpoints)
└── src/
    ├── main.jsx        # ReactDOM root, StrictMode
    └── App.jsx         # EVERYTHING: constants, cache, API calls, math, canvas card, UI
```

## 3. How the App Works (User Flow)

1. **Load** — the app fetches the top 250 coins (stablecoins and wrapped/staked assets filtered
   out) from `/api/coins?type=list`, with an animated progress bar.
2. **Step 1 — Choose Your Coin** — searchable dropdown (name or symbol, top 40 matches shown).
   Selecting a coin:
   - Starts a **live price poll every 30 seconds** (`?type=price&id=...`, 60s client cache).
   - Fetches **120 days of daily price history** (`?type=history&id=...`, 12h cache).
   - Runs `analyzeMarket()` and shows a verdict banner (Strong / Decent / Mixed / Weak setup)
     plus a trend pill (Uptrend / Downtrend / Ranging).
3. **Step 2 — Build Your Plan** — the user sets:
   - **Capital** (USD, formatted text input, default $500)
   - **Frequency**: every 12h / daily / weekly / bi-weekly (all allow up to 6 months)
   - **Duration**: 1–6 months (slider)
   - **Target gain**: +10 / +25 / +50 / +100 / +200 %
4. **Simulate** — "Show Me the Numbers →" runs `runSim()` (with a staged loading animation,
   ~1.6 s minimum for feel) and renders:
   - **Target result card**: portfolio value, profit, and ROI if the target % is hit — with an
     "aggressive target" warning when the target exceeds 2× the window volatility.
   - **Share panel** (dark green, high-visibility) — see §5.
   - **DCA breakdown**: per-buy amount, number of buys, entry price range, volatility-adjusted
     average entry, tokens accumulated, current value.
   - **Downside scenarios**: flat, -20%, -50% outcomes in plain language.
   - **Market snapshot**: live price, 30/90-day MAs, volatility %, 120-day momentum, trend.
5. A **sticky bottom bar** appears after simulation with "Share Your Card" (smooth-scrolls to the
   share panel) and "Recalculate" buttons.

## 4. Simulation Logic (`runSim` in `src/App.jsx`)

The simulation is deliberately "honest but anchored to now":

- **Entries** = `round((months × 30) / frequency.days)`, clamped to 4–180. Capital is split evenly.
- **Volatility window matches the chosen duration** — planning a 3-month DCA uses exactly the last
  90 days of history, 1 month uses 30 days, etc.
- **Price scaling**: historical window prices are scaled by `livePrice / windowAverage`, so the
  simulation preserves the *shape* of real price movement (dips, peaks, volatility) but centres the
  whole range on today's live price rather than stale absolute prices.
- Entry prices are sampled evenly across the scaled window; tokens accumulated = Σ (amount / price).
- **All outcome values (target / flat / -20% / -50%) are computed from the live price**, not the
  average entry — the target is "coin goes +X% from now".

### Market analysis (`analyzeMarket`)

Scored on three factors over the 120-day history:
- **Trend**: current vs 30-day MA and 30 vs 90-day MA (Uptrend / Downtrend / Ranging) → ±2
- **Momentum**: 120-day % change (>20% → +2, >0 → +1, >-20% → -1, else -2)
- **Position in range**: near the low (+1) vs near the high (-1)

Score ≥3 → "Strong Setup" 🔥 · ≥1 → "Decent Setup" ✅ · ≥-1 → "Mixed Signals" ⚠️ · else "Weak Setup" ❌

## 5. Share Card (`makeCard`)

A 1200×675 canvas PNG (X/Twitter feed aspect ratio):

- **Left green panel (36%)**: CMVNG branding, optional user profile photo (uploaded client-side,
  drawn in a clipped circle with white + green accent rings) and user name, coin logo + symbol +
  live price, 24h change pill, trend badge and setup verdict.
- **Right white panel**: "MY DCA PLAN" summary line, big target value in 84px, profit + ROI pill
  (green when positive, red when negative — *always by profit sign, never by market verdict*),
  three scenario boxes (flat / -20% / -50%), value-at-live-price + average entry bar, and
  "Not financial advice · DYOR" + `cmvng.app` footer.
- Coin logos come from CoinGecko's CDN and are routed through the proxy's `?type=image` endpoint
  to avoid CORS-tainting the canvas.
- Download button saves `cmvng-{symbol}-dca-x.png`.

## 6. The Vercel Proxy (`api/coins.js`)

A single Edge Function with four endpoints, all cached at Vercel's edge via `Cache-Control:
s-maxage` — so CoinGecko is hit roughly once per cache window regardless of user count:

| Endpoint | Purpose | Edge cache |
|---|---|---|
| `?type=list` | Top 250 coins (3 parallel CoinGecko pages, stables/wrapped filtered) | 12 h |
| `?type=history&id=X` | 120-day daily price history | 12 h |
| `?type=price&id=X` | Live price + 24h change | 60 s |
| `?type=image&url=X` | CORS-safe image proxy (CoinGecko CDN URLs only) | 7 days |

Safety measures: coin `id` validated against `/^[a-z0-9-]+$/`; image proxy allow-lists only
`assets.coingecko.com` and `coin-images.coingecko.com`; optional `COINGECKO_API_KEY` env var is
appended as the demo API key. CORS is open (`*`) with an OPTIONS preflight handler.

## 7. Client-Side Caching (in `App.jsx`)

A small `localStorage` wrapper (keys prefixed `cmv_`):
- Coin list & history: 12 h TTL
- Live price: 60 s TTL (per coin, key `lp_<id>`)
- **Stale fallback**: if the network fails, expired cached data is served rather than erroring.

## 8. Stablecoin / Wrapped-Asset Blacklist

Both the frontend and the proxy carry a large `STABLE` set excluding USD/EUR/GBP stablecoins,
wrapped tokens (WBTC, WETH, wrapped AVAX/BNB/etc.) and liquid-staking derivatives (stETH, rETH,
cbETH…), so the picker only offers "real" coins. **Note:** the two lists are duplicated and have
drifted slightly (see Known Issues) — the proxy's filter is the one that actually matters since
the frontend receives an already-filtered list.

## 9. Design System

Green-on-white "money" theme defined in the `G` constant: `#16A34A` primary green, pale green
surfaces (`#F7FDF9` / `#F0FBF4`), dark forest text (`#052E16`), plus red/amber/blue accents for
scenarios and verdicts. Font: Inter/Segoe UI. Cards use 18px radii and soft green shadows.
Layout is a single centred 680px column — mobile-friendly by design.

## 10. Development History (17 commits)

Built incrementally by cmvng: initial Vite/React scaffold → `App.jsx` created and iterated ~8
times (UI polish, simulation logic, share card evolution) → `api/coins.js` proxy added
(moving from direct CoinGecko calls to the cached proxy) → final App/proxy sync. All work is
on `main`; commits are file-level ("Update App.jsx" style).

## 11. Running It

```bash
npm install
npm run dev        # Vite dev server — NOTE: /api/coins will 404 locally (see below)
npm run build      # production build to dist/
```

**Important:** the `/api/coins` proxy is a Vercel Edge Function — it only runs under Vercel.
For a full local experience use `vercel dev`. Plain `vite` dev serves the UI but API calls fail
(the app then falls back to any stale localStorage cache).

Deployment: push to the Vercel-connected repo; no configuration needed beyond the optional
`COINGECKO_API_KEY` environment variable.

## 12. Known Issues & Improvement Ideas

**Bugs / rough edges spotted during review (not yet fixed):**
1. **Duplicated blacklist** — `STABLE` exists in both `App.jsx` and `api/coins.js` and the copies
   have drifted (e.g. `mkr` vs `mkr-governance-token`). The frontend copy is currently dead code.
2. `getCoins()`'s comment says "3 parallel calls" but the frontend now makes one proxy call —
   comment is stale (the 3 calls live in the proxy).
3. `jsonResponse()` computes `origin` but never uses it (always sends `*`).
4. Simulation loading message says "Analysing 120 days of data…" even when the window used is
   shorter (matches chosen months).
5. In the downside scenario labels, drop prices are shown from `avgEntry` (`avgEntry*0.8`) while
   the values are computed from live price (`refPrice*0.8`) — slight display inconsistency.
6. `README.md` is a single line — this document now fills that gap.
7. No tests, no linting, no CI.

**Possible next steps:**
- Import the blacklist from a single shared module.
- `vercel.json` + `vercel dev` docs for local API development.
- Historical backtest mode ("what if you had DCA'd the last N months") alongside the forward sim.
- OG meta tags / social preview for cmvng.app, PWA manifest, analytics.
- Deduplicate scenario math into one helper; unit tests for `runSim` and `analyzeMarket`.

---

*Document generated 2026-08-27 from a full read of the codebase at commit `1a6ae37`.*
