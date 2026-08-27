# Shareable public plans — current mechanism and /plan/<id> architecture

## What ships today (no server storage)

A shared plan is a URL hash: `https://<host>/#p=<base64url(JSON)>`.

- Encoded by `src/lib/planUrl.js` (`encodePlan`/`planShareUrl`); decoded on load
  by `decodePlanFromHash` and applied in `App.jsx` once the coin list arrives.
- The payload contains ONLY plan parameters (coinId, capital, freqId, months,
  targetPct, feePct, feeFixed, slippagePct, hybridPct, mode). Never a name,
  photo, or any personal data — the recipient's browser re-runs the simulation
  locally against fresh market data.
- Security: every decoded field is validated (regex for coinId, numeric range
  clamps, enums) before it can touch state. Unknown fields are dropped. The
  hash never reaches the server (fragment), so links leak nothing into logs.
- Revocation: nothing is stored, so there is nothing to revoke — a link simply
  encodes parameters, like a calculator permalink.

## `/plan/<id>` short links — IMPLEMENTED (JSON-file store)

Goal: `cmvng.app/plan/x7Kf2` renders a public page with the plan, key result,
assumptions, model version, CMVNG branding, and a "build your own plan" CTA.

1. **Storage**: a small KV table `plans` keyed by a random 6–8 char id →
   `{ createdAt, modelVersion, config (same validated shape as the hash
   payload), revoked: false, ownerToken }`. `ownerToken` is a random secret
   returned once at creation and kept in the creator's localStorage — it is
   the revocation capability, not an identity.
2. **API**: extend the existing edge function or add `api/plans.js`:
   - `POST /api/plans` body = validated config → `{ id, ownerToken }`,
     rate-limited per IP; reject anything outside the current validation rules.
   - `GET /api/plans?id=` → config (404 if revoked/unknown), cacheable.
   - `DELETE /api/plans?id=&token=` → marks revoked ("allow a user to remove
     their public plan").
3. **Rendering**: the SPA routes `/plan/<id>` (History API; server.js and
   Vercel already SPA-fallback unknown paths to index.html) → fetches the
   config → runs the normal simulation flow read-only, with "create your own
   plan" resetting to the builder. OG tags per plan would need edge-side HTML
   injection (later; requires moving the page render into the edge function).
4. **Privacy rules carried over**: store only plan parameters + timestamps;
   no names, no photos, no IPs beyond transient rate-limiting; ids unguessable
   but treated as public once shared.

Chosen not to build now: every option (Vercel KV, Upstash, a tiny D1/SQLite)
adds a paid/provisioned dependency the owner must consciously adopt. The hash
link delivers the shareable-URL feature today with zero infrastructure.


## Implementation status (2026-08-27)

Built in `api/plans.js` (node-only JSON-file KV, atomic writes, sha256-hashed
owner tokens, validated configs, 10 creates/IP/hour, 5000-plan cap), served by
`server.js` and the vite dev middleware; client in `src/lib/planApi.js`
(localStorage token vault `cmv_plan_tokens`); read-only page header in
`src/components/PublicPlanView.jsx`; SPA route wired in `App.jsx`
(`/plan/<id>` → fetch → apply config → auto-simulate → revoke for owners).
Covered by 9 unit tests + a Playwright lifecycle e2e (create → view →
auto-run → revoke → honest 404).

**One config step to persist plans in production:** the store writes to
`PLANS_DIR` (default `./node_modules/.cache/cmvng-plans`, ephemeral on
Railway). Attach a volume mounted at `/data` and set `PLANS_DIR=/data`.
On static Vercel hosting the endpoint does not exist; the UI detects this and
falls back to hash links with an honest notice.
