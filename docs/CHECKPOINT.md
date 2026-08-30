# CHECKPOINT — CMVNG DCA Simulator

> Current working state. Update this file at the end of each implementation session.

**Date:** 2026-08-30
**Working branch:** `codex/contract-plan-studio`
**Deployment target:** `feat/cmvng-v2-upgrade` (Railway-tracked; Contract Plan Studio v2 is merged and live)
**Remote base for this release:** `6500593733fecf062176f6aa6cd0f8bab0eca0d8`
**Release merge:** PR #4 at `98254613638e5b2c919e7fb3018053a83a261ef7`
**Railway deployment:** `abdd60fe-b704-4093-aa81-1aafdcb18e7a` (`SUCCESS`)
**Core model:** CMVNG Simulation v3.0.0, unchanged
**Onchain methodology:** Contract Plan Studio v2, isolated from the behavior-locked core model

## Outcome

Contract Plan Studio v2 shipped through PR #4 and is live in production. Pasting an exact supported token address now produces three visible price-zone risk profiles, a selectable Price/MCAP/FDV execution chart, amount and monitoring-duration controls, scenario outcomes, and exportable plan cards. The established planner at `/` also has compact modeled `+`, conditional target `−`, and low-water `!` annotations.

Production acceptance passed with STONK resolved to the exact selected Meteora pool and 26 real `1D` candles. The live flow exposed all three profiles; Price, MCAP, and FDV views; `B1`–`B4`, `S1`, and `X1`; persistent URL state across reload; card generation; main-chart annotations; and no app-origin console errors.

## Delivered in Contract Plan Studio v2

- Three deterministic price-zone profiles are always presented when the evidence gates allow a plan: **Deep pullback**, **Balanced**, and **Early entry**. They change allocation and spacing; they are plan-shape/risk profiles, not personal suitability recommendations.
- Budget and 7–90 day duration controls are part of the plan context. Duration is a monitoring/reassessment window, not a promised fill period, holding period, or forecast.
- Automatic volatility-scaled targets plus an explicit custom-target override. A warning is shown when today's quote has already passed the selected target.
- One selected-plan chart with real pool price OHLCV, a left planned-action rail for `B1`–`B4`, `S1`, and `X1`, and optional native chart markers for retrospective level touches.
- Clear event semantics:
  - the planned rail shows conditional levels that may never execute;
  - optional historical touches are retrospective, in-sample intersections and are not fills, trades, or an out-of-sample backtest;
  - `S1` is a conditional scenario target after fills;
  - `X1` is a close-confirmed manual reassessment level, not an automatic or guaranteed stop.
- Price, market-cap, and FDV views use the same real price candles converted by the current valuation-to-price ratio. The MCAP/FDV views carry a constant-supply-ratio disclosure; an unavailable valuation stays unavailable and is never replaced with price or the other valuation.
- B1–B4 allocation/range details, modeled average entry, S1/X1 references, and prefix-fill outcomes. Prefix P/L is shown only for the stated assumption that the quote later returns to today's quote and remains before fees, slippage, taxes, gas, and execution effects.
- Volatility/downside context and all-fill current/S1/X1 terminal references, including an explicit warning that a gap through X1 can produce a larger loss than the exact-level model.
- Dedicated X, square, and story PNG share cards. Cards include the resolved token, selected profile, budget, monitoring duration, value unit, plan levels, evidence quality, timestamp, and selected pool/DEX/counter-token provenance; they are stamped `PLANNED · NOT EXECUTED` and include the principal modeling assumptions.
- Complete share/refresh state in the query string: `address`, `pool`, `interval`, `amount`, `duration`, `plan`, `unit`, `target`, and `touches`.
- Canonical resolved-token state remains separate from the address draft, so editing a new address cannot relabel an old analysis or card before a successful rescan.
- Mobile information flow is now: contract input → amount/duration/target → three profiles → selected chart → outcomes/risk → share card. Unselected profile details collapse on narrow screens to reduce scanning cost.
- The main `/` portfolio chart now labels sampled modeled purchases with `+`, the first conditional target crossing with `−`, and the lowest modeled sample with `!`. These are simulation annotations—not executed trades, an automatic sale, or a stop.
- The established `/`, public `/plan/<id>`, and `#p=` flows remain separate from the lazy-loaded `/contract` implementation.

## Release verification completed

- [x] `npm run lint` — zero warnings/errors
- [x] `npm test` — 82/82 pass, including profile construction, valuation projection, close-confirmed X1 touches, wick-only rejection, share-card fallback/provenance, and the behavior-locked v3 core
- [x] `npm run build`
- [x] `git diff --check`
- [x] Contract browser smoke updated for all three profiles, unit/profile/duration/target/touch query persistence, decimal budgets, and mobile source order
- [x] Main-chart and contract-chart language audited so planned levels, modeled events, and retrospective touches are not described as executions
- [x] PR #4 reviewed and merged into the Railway-tracked branch at `98254613638e5b2c919e7fb3018053a83a261ef7`
- [x] Railway deployment `abdd60fe-b704-4093-aa81-1aafdcb18e7a` completed with `SUCCESS`
- [x] Live STONK acceptance used the exact selected Meteora pool and returned 26 `1D` candles
- [x] Live acceptance covered all three profiles, Price/MCAP/FDV, `B1`–`B4`/`S1`/`X1`, URL persistence across reload, card generation, main-chart annotations, and zero app-origin console errors

## Publication and live acceptance completed

- [x] GitHub PR #4 completed review and merged into `feat/cmvng-v2-upgrade`.
- [x] The merged commit deployed successfully through Railway.
- [x] The production `/contract` flow passed the release acceptance checks listed above.

## Known post-release gaps

- No honeypot, sellability, tax, authority, holder-concentration, deployer-history, or LP lock/burn scan yet.
- No executable buy-and-sell quotes, so route liquidity, price impact, taxes, gas, and slippage remain unknown.
- Arbitrary-address endpoints still need per-IP throttling and in-flight request coalescing before public scale.
- Cross-pool and cross-provider price divergence are not yet blocking risk rules.
- Retrospective touches are in-sample illustrations. No success probabilities should be displayed until rolling or prefix out-of-sample validation exists.
- The three current alternatives are price-zone profiles. Time-scheduled and hybrid DCA plan types are future work.
- GeckoTerminal's public beta allowance is small and variable; production traffic needs stronger shared caching or a paid onchain tier.
- “Any memecoin” means an exact token indexed on a supported network with an active pool, usable USD OHLCV, sufficient dense/fresh history, and acceptable market-data gates—not every chain, bonding curve, or newly created mint.

## Next handoff

1. Monitor the live Contract Plan Studio v2 release and retain the exact-pool and console-error checks in future acceptance runs.
2. Keep the P0 security and executable-quote integrations in `docs/RECOMMENDATIONS.md` as requirements before any trade-ready CTA.
3. Add rate limiting, request coalescing, and stronger shared market-data caching before public scale.
4. Keep retrospective touches descriptive until rolling or prefix out-of-sample validation exists.
