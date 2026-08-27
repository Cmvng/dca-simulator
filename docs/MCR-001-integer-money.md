# METHODOLOGY CHANGE REQUEST — MCR-001: float → integer-minor-unit money

STATUS: **APPROVED by the owner (2026-08-27, \"Do it\") — IMPLEMENTED as MODEL v3.0.0.**

## CURRENT BEHAVIOUR (quoted)

The engine is pure float arithmetic, v1-parity by design:

- `src/lib/simulation/dca.js:46` — `amtPer: capital / entries` (raw float division;
  e.g. $10,000 / 90 = 111.11111111111111)
- `src/lib/simulation/dca.js:61-64` —
  `const fee = amtPer * (feePct / 100) + feeFixed;`
  `const net = Math.max(0, amtPer - fee);`
  `const units = execPrice > 0 ? net / execPrice : 0;`
- `src/lib/simulation/dca.js:72` — `avgEntry: cumUnits > 0 ? cumInvested / cumUnits : 0`

Rounding exists only at the display edge (`src/lib/formatting/money.js` —
`toFixed(2)` / `toLocaleString`), so no float artifact is ever shown to a user.
Correctness is guarded by invariant tests (no NaN/Infinity, capital
conservation, avgEntry consistency) and by `behaviorLock.test.js`, which pins
full-precision outputs (e.g. `amtPer: 111.11111111111111`,
`avgEntry: 104.92835816059969`) at ~1e-12 relative tolerance.

## PROPOSED CHANGE

Represent capital, per-purchase amounts and fees as integer cents (and asset
units as an integer minimal unit, e.g. 1e-8), performing all engine arithmetic
in integers with explicit rounding rules, converting to floats only for
display.

## WHY IT'S NEEDED

Requested as remaining-work item C2 ("Float → integer-safe money") to remove
theoretical float-accumulation artifacts in long fee-bearing schedules.

## IMPACT — why this cannot be done without sign-off

Integer-cent arithmetic necessarily rounds intermediate values that today stay
in full float precision. The very first step already moves a locked number:
`$10,000 / 90` becomes `111.11` (cents-rounded) vs the locked
`111.11111111111111` — a per-buy difference that propagates into units,
avgEntry, every scenario value, and the DCA-vs-lump comparison. Every
behaviour-lock field and the v1-oracle equivalence test would fail; per the
run's own rules that is a red gate, and per `behaviorLock.test.js`'s header the
constants may not be updated without an approved MCR **and** a
`MODEL_VERSION` bump.

There is no "artifact-free but output-identical" middle ground: any rounding
scheme that changes stored precision changes outputs; any scheme that doesn't
is the current float behaviour.

## RECOMMENDATION

Keep the float engine (v1 parity, invariant-guarded, display already rounds)
unless/until a deliberate model-version bump is wanted. If approved later:
implement integer-minor-unit arithmetic behind `MODEL_VERSION = 3.0.0`,
recapture the behaviour-lock constants under the new version, and keep the v2
oracle test against the archived v2 engine for historical attribution of
saved plans.

## DECISION

Approved by the owner on 2026-08-27. Implemented per the recommendation:
- `MODEL_VERSION` bumped to **3.0.0** (new saved plans stamp v3; existing
  saved plans keep their stored v2 attribution).
- Money in integer cents: `allocateCents()` splits capital exactly (remainder
  cents to the earliest purchases); fees rounded to the cent and clamped per
  purchase; money outputs cent-quantized at the engine boundary. Units and
  prices remain continuous. Monte Carlo distribution mode intentionally keeps
  float per-buy amounts (statistical tooling, disclosed methodology).
- `behaviorLock.test.js` constants recaptured under v3 (v2 constants preserved
  in git history, commit 040e560); the v1 oracle test now asserts a documented
  money-quantization tolerance (≤~1e-3 relative) instead of float equality.
- New invariants: totalInvested === capital exactly; every per-buy amount is a
  whole number of cents; allocation exactness locked by a dedicated test.
