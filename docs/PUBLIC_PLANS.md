# Shareable public plans — current implementation

## What ships today

The app has two complementary share mechanisms:

1. **Revocable short links:** `/plan/<id>` uses the JSON-file store in
   `api/plans.js`. Each crypto-random id is exactly eight characters. The
   persisted record contains only `{ id, createdAt, modelVersion, config,
   revoked, ownerTokenHash }`; the unhashed owner token is returned once and
   kept in the creator's local storage as the revocation capability.
2. **Infrastructure-free fallback:** `#p=<base64url(JSON)>` encodes only the
   validated plan parameters in the URL fragment. It is used when the plan API
   is unavailable and cannot be revoked because nothing is stored.

Both paths drop unknown fields and validate coin ids, numeric ranges, modes,
and frequencies before applying a shared configuration. They contain no names,
photos, wallet addresses, or other personal profile data. Short-link rate-limit
bookkeeping is memory-only; IP addresses are not written to the plan store.

## Implementation status (2026-08-27)

Built in `api/plans.js` (node-only JSON-file KV, atomic writes, sha256-hashed
owner tokens, validated configs, 10 creates/IP/hour, 5000-plan cap), served by
`server.js` and the vite dev middleware; client in `src/lib/planApi.js`
(localStorage token vault `cmv_plan_tokens`); read-only page header in
`src/components/PublicPlanView.jsx`; SPA route wired in `App.jsx`
(`/plan/<id>` → fetch → apply config → auto-simulate → revoke for owners).
Covered by 9 unit tests + a Playwright lifecycle e2e (create → view →
auto-run → revoke → honest 404).

`/plan/<id>` loads the validated config and runs the established simulation
read-only. Per-plan social-card metadata would require server-side HTML
injection and remains future work.

**One config step to persist plans in production:** the store writes to
`PLANS_DIR` (default `./node_modules/.cache/cmvng-plans`, ephemeral on
Railway). Attach a volume mounted at `/data` and set `PLANS_DIR=/data`.
On static Vercel hosting the endpoint does not exist; the UI detects this and
falls back to hash links with an honest notice.
