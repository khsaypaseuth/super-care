---
phase: 01-foundation-money-legal-cores
plan: 04
subsystem: order-state-machine-commission
tags: [xstate, order-machine, commission, big.js, tdd, state-machine, illegal-transitions, refund-path, tier-ladder, boundary-vectors]

requires: ["01-01", "01-02"]
provides:
  - Order state machine pure transition table with throwing next() (ORD-02)
  - Commission tier ladder on THB base returning Big (COMM-01/COMM-02)
affects: [phase-4-order-service, phase-8-commission-payout, all-later-phases]

tech-stack:
  added: [xstate (active use for createMachine visualization export)]
  patterns:
    - plain-transitions-table (TRANSITIONS record backing next() — lowest-risk throw-on-illegal)
    - illegal-transitions-throw (IllegalTransition error class; next() throws for any unmapped event)
    - tdd-red-green (RED → GREEN committed atomically per task)
    - big-commission-on-thb-base (computeCommissionThb takes Big premiumThb; returns Big; no JS number)
    - whole-volume-tier-selection (highest tier with minVolume ≤ partnerVolume; documented decision)
    - boundary-test-vectors (both-sides of every threshold: 9/10, 49/50/51)

key-files:
  created:
    - packages/shared/src/order/order.machine.ts
    - packages/shared/src/order/order.machine.spec.ts
    - packages/shared/src/order/index.ts
    - packages/shared/src/commission/commission.ts
    - packages/shared/src/commission/commission.spec.ts
    - packages/shared/src/commission/index.ts
  modified: []

decisions:
  - "Plain TRANSITIONS table (not XState transition() for throw-on-illegal) — lowest-risk; xstate createMachine still exported for visualization"
  - "Whole-volume tier selection: highest tier with minVolume <= partnerVolume applies to the whole order (not marginal)"
  - "Commission rounding: Big.roundHalfUp at 2dp (THB satang) — documented; distinct from FX ceil (Big.roundUp)"
  - "LADDER tier data is [ASSUMED A3] placeholder — real partner-commission policy deferred; shape and boundary discipline locked"
  - "IllegalTransition is an exported error class with name property — callers can instanceof-check"
  - "Refund reachable ONLY from PAID and CERT_FAILED — not from pre-payment states (T-04-02 mitigated)"

metrics:
  duration: ~8min
  completed: 2026-06-07
  tasks: 2
  files: 6
---

# Phase 1 / Plan 04: Order State Machine + Commission Tier Ladder Summary

**Headless Order state machine (plain table; next() throws IllegalTransition) and commission tier ladder on the Big THB base — both TDD'd with all failure states, refund path, and both-sides-of-threshold boundary vectors proven**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 (each RED → GREEN committed individually)
- **Files created:** 6 (2 domains × 3 files each: impl + spec + index)

## Accomplishments

### Task 1 — Order State Machine (ORD-02)

`packages/shared/src/order/order.machine.ts` — Pure, exhaustively-tested Order lifecycle:

- **Plain TRANSITIONS table** (`Readonly<Record<state, Record<event, target>>>`) backing the `next()` function. Terminal states (COMPLETED, REFUNDED, CANCELLED) have empty event maps → any event throws.
- **`next(stateValue, eventType): string`** — throws `IllegalTransition` for any unmapped event. No XState no-op detection needed; the plain table is the ground truth.
- **`IllegalTransition` error class** — extends `Error`, sets `name = "IllegalTransition"`, message format `"IllegalTransition: ${event} from ${state}"`. Exported so callers can `instanceof`-check.
- **All 11 states** modelled: DRAFT, OCR_FAILED, QUOTED, AWAITING_PAYMENT, PAYMENT_FAILED, PAID, ISSUING_CERTIFICATE, CERT_FAILED, REFUNDING, COMPLETED (final), REFUNDED (final), CANCELLED (final).
- **Refund path**: PAID → REFUNDING → REFUNDED ✓; CERT_FAILED → REFUNDING → REFUNDED ✓; refund from DRAFT/QUOTED/AWAITING_PAYMENT/OCR_FAILED/PAYMENT_FAILED throws ✓.
- **xstate `createMachine`** also exported for visualization tooling (Stately inspector, graph analysis) — not used by `next()`.
- **39 tests** — happy path, both refund paths, all failure states, illegal transitions, terminal state sinks, cancel transitions, self-transitions (OCR_SUCCEEDED on DRAFT, REQUOTE on QUOTED).

### Task 2 — Commission Tier Ladder (COMM-01/COMM-02)

`packages/shared/src/commission/commission.ts` — Pure commission computation:

- **LADDER** — 3 placeholder tiers [ASSUMED A3]: tier0 (5%, vol 0+), tier1 (7%, vol 10+), tier2 (10% + 50 flat THB, vol 50+). Amounts as decimal strings, never JS number literals.
- **`computeCommissionThb(partnerVolume: number, premiumThb: Big): Big`** — whole-volume tier selection; percent applied to Big THB premium; flat THB added via `new Big(tier.flatThb)`; rounded to 2dp with `Big.roundHalfUp`.
- **THB base explicit** (T-04-03) — premiumThb is always the Big THB Premium, never the LAK collected amount.
- **15 tests** — full boundary vector table from research (T0a/T0b/T1a/T1b/T2a/T2b/Tround); both-sides of every threshold (9/10, 49/50/51); rounding case (333.33 @ 7% = 23.3331 → 23.33); return-type-is-Big; flat+percent combination.

## Task Commits

1. **Task 1 RED** — `bc291ab` `test(01-04)`: add failing Order state machine spec (RED — ORD-02)
2. **Task 1 GREEN** — `d9974a6` `feat(01-04)`: implement Order state machine — plain table + next() throws IllegalTransition
3. **Task 2 RED** — `5ffcf74` `test(01-04)`: add failing commission tier ladder spec (RED — COMM-01/COMM-02)
4. **Task 2 GREEN** — `7f42afe` `feat(01-04)`: implement commission tier ladder on THB base returning Big

## Verification Output

```
pnpm typecheck → exit 0 (clean — tsc -b, 0 errors)
pnpm lint      → exit 0 (clean — no-explicit-any: 0 violations)
pnpm test      → 11 test files, 134 tests, all passed

Order machine: 39 tests green
  - Happy path chain: DRAFT → COMPLETED
  - Refund from PAID: PAID → REFUNDING → REFUNDED
  - Refund from CERT_FAILED: CERT_FAILED → REFUNDING → REFUNDED
  - Refund before PAID: 5 cases throw IllegalTransition
  - Illegal transitions: 5 cases throw IllegalTransition
  - Terminal states: 6 events throw IllegalTransition
  - Failure states: OCR_FAILED, PAYMENT_FAILED, CERT_FAILED — reachable and retry-able

Commission: 15 tests green
  - T0a: vol 0 → 50.00 (5%)
  - T0b: vol 9 → 50.00 (tier0 below threshold 10)
  - T1a: vol 10 → 70.00 (tier1 at threshold 10)
  - T1b: vol 49 → 70.00 (tier1 below threshold 50)
  - T2a: vol 50 → 150.00 (tier2 at threshold 50)
  - T2b: vol 51 → 150.00 (tier2 above threshold 50)
  - Tround: vol 10, 333.33 THB → 23.33 (7% = 23.3331 → roundHalfUp)
  - Return type is Big (PLAT-03)
```

## Threat Mitigations Verified

| Threat ID | Mitigation | Test |
|-----------|-----------|------|
| T-04-01 | next() throws on illegal | `PAYMENT_CAPTURED from DRAFT → IllegalTransition`; terminal-state events throw |
| T-04-02 | Refund only after PAID | `DRAFT/QUOTED/AWAITING_PAYMENT + INITIATE_REFUND → throws`; PAID/CERT_FAILED → REFUNDED proven |
| T-04-03 | Commission on explicit THB base, Big not float | premiumThb is Big parameter; no JS number literals; rounding test |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spec test assertion checking pre-rounded intermediate value**
- **Found during:** Task 2 GREEN phase (first test run)
- **Issue:** The "no float drift" test in commission.spec.ts used `result.toFixed(4)` expecting `"23.3331"` — but `computeCommissionThb` returns an already-rounded 2dp value, so `.toFixed(4)` gives `"23.3300"` not `"23.3331"`.
- **Fix:** Split the test into two assertions: (a) `result.toFixed(2) === "23.33"` on the returned Big, and (b) a separate intermediate check `new Big("333.33").times("7").div(100).toFixed(4) === "23.3331"` to prove Big exactness. This correctly validates both the function's output and the no-drift property.
- **Files modified:** `packages/shared/src/commission/commission.spec.ts`
- **Commit:** `7f42afe` (included in GREEN commit)

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| LADDER tier data (5%/7%/10%+50 flat, thresholds 10/50) | `packages/shared/src/commission/commission.ts` | [ASSUMED A3] — placeholder; real partner-commission policy not yet supplied. Shape and boundary discipline are locked; data changes when policy is confirmed (Phase 8+). |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. Both modules are pure in-process functions with no I/O. No new threat surface beyond what the plan's threat model covers.

## Next Phase Readiness

- Phase 1 is now COMPLETE — all 4 plans done: 01-01 (scaffold), 01-02 (money/fx/premium), 01-03 (validators), 01-04 (order machine + commission).
- The `./order` and `./commission` subpaths in `@super-care/shared` are live.
- Phase 2 (data layer / Prisma) can proceed.

---
*Phase: 01-foundation-money-legal-cores*
*Completed: 2026-06-07*

## Self-Check: PASSED

Files verified:
- packages/shared/src/order/order.machine.ts: FOUND
- packages/shared/src/order/order.machine.spec.ts: FOUND
- packages/shared/src/order/index.ts: FOUND
- packages/shared/src/commission/commission.ts: FOUND
- packages/shared/src/commission/commission.spec.ts: FOUND
- packages/shared/src/commission/index.ts: FOUND

Commits verified in git log:
- bc291ab: test(01-04): add failing Order state machine spec (RED — ORD-02)
- d9974a6: feat(01-04): implement Order state machine — plain table + next() throws IllegalTransition
- 5ffcf74: test(01-04): add failing commission tier ladder spec (RED — COMM-01/COMM-02)
- 7f42afe: feat(01-04): implement commission tier ladder on THB base returning Big
