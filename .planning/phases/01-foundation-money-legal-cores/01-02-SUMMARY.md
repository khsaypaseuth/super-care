---
phase: 01-foundation-money-legal-cores
plan: 02
subsystem: money-fx-premium
tags: [big.js, money, fx, premium, tdd, no-float, decimal, vector-table]

requires: ["01-01"]
provides:
  - Money value object over big.js (PLAT-03)
  - FX quote function with direction rule + per-rate markup + ceil (FX-02/FX-03)
  - Table-driven Premium lookup returning Big THB (FX-01)
affects: [01-03, 01-04, phase-2-data-layer, all-later-phases]

tech-stack:
  added: [big.js (active use — Money, FxQuoteResult, lookupPremiumThb)]
  patterns:
    - decimal-money-no-float (Big end-to-end; no JS number for money)
    - tdd-vector-table (RED→GREEN per task; research vectors as test table)
    - fx-direction-rule (TH passthrough; LA markup+ceil at rate boundary only)

key-files:
  created:
    - packages/shared/src/money/money.ts
    - packages/shared/src/money/money.spec.ts
    - packages/shared/src/money/index.ts
    - packages/shared/src/fx/fx.math.ts
    - packages/shared/src/fx/fx.math.spec.ts
    - packages/shared/src/fx/index.ts
    - packages/shared/src/premium/premium.ts
    - packages/shared/src/premium/premium.spec.ts
    - packages/shared/src/premium/index.ts
  modified:
    - (none — only new files)

decisions:
  - "Big.roundUp (= ceil) applied ONCE at the FX boundary (fx.math.ts) — NOWHERE else in the codebase"
  - "MARKUP_KIPS_PER_RATE_UNIT = Big(15) applied to per-THB rate only (never to THB amount or LAK total)"
  - "TH direction rule: premiumThb passes through unchanged; rate fields are null; no markup path exists"
  - "Money construction rejects JS number via runtime guard and TypeScript overload; string or Big only"
  - "LAK has no sub-unit (0 dp); THB has satang (2 dp) — enforced in makeMoney()"
  - "PREMIUM_TABLE amounts are placeholder [ASSUMED A2] — real rate card deferred; shape is locked"

metrics:
  duration: ~15min
  completed: 2026-06-07
  tasks: 3
  files: 9
---

# Phase 1 / Plan 02: Money, FX, and Premium Pure Cores Summary

**Big-backed Money value object, FX quote implementing direction rule + per-rate +15 kips markup + ceil, and table-driven Premium lookup — all pure, exhaustively vector-tested, zero float drift**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 (each RED → GREEN committed individually)
- **Files created:** 9 (3 domains × 3 files each: impl + spec + index)

## Accomplishments

- `packages/shared/src/money/` — `Money { amount: Big; currency: Currency }` value object. Accepts decimal strings and Big; JS number throws at runtime and is excluded from TypeScript overloads. Scale enforcement: THB 2dp (satang), LAK 0dp (whole kip). `addMoney` for same-currency Big addition. No `parseFloat`/`toFixed`/`Math.round` anywhere.

- `packages/shared/src/fx/` — `quote(market, premiumThb, sourceRatePerThb): FxQuoteResult`. LA branch: `adjusted = sourceRate + Big(15)`, `lak = premiumThb × adjusted` then `.round(0, Big.roundUp)`. TH branch (direction rule): returns premiumThb as THB unchanged, rate fields null. Throws on null sourceRate for LA market. `MARKUP_KIPS_PER_RATE_UNIT = Big("15")` defined once, marked with [ASSUMED A1] unit note.

- `packages/shared/src/premium/` — `lookupPremiumThb(coverage, vehicleType): Big`. Static `PREMIUM_TABLE` with 6 placeholder rows (marked [ASSUMED A2] — real rate card deferred). Amounts stored as decimal strings, never JS number literals. Throws with message including both keys on miss.

- **44 tests passing** (38 new + 6 pre-existing from 01-01), typecheck clean, lint clean.

## Task Commits

1. **Task 1 RED** — `1a66355` `test(01-02)`: failing Money spec — float drift, scale, JS number rejection
2. **Task 1 GREEN** — `ddb6002` `feat(01-02)`: Money value object over big.js
3. **Task 2 RED** — `84b268d` `test(01-02)`: failing FX quote spec — full research vector table
4. **Task 2 GREEN** — `2cbe2d8` `feat(01-02)`: FX quote direction rule + markup + ceil
5. **Task 3 RED** — `f9b87de` `test(01-02)`: failing Premium lookup spec
6. **Task 3 GREEN** — `a2d5b38` `feat(01-02)`: Premium table-driven lookup returning Big THB
7. **Auto-fix** — `0eb7c3d` `fix(01-02)`: unused import + ts-expect-error cast fixes (typecheck/lint)

## Verification Output

```
pnpm typecheck  → exit 0 (clean)
pnpm lint       → exit 0 (clean)
pnpm test       → 4 test files, 44 tests, all passed
```

All research FX vector rows proven:
- FX-a: 1000 × (250+15) = 265000 LAK (exact)
- FX-b: 1000 × (250.0001+15) = 265000.1 → **265001** (ceil, not round/floor)
- FX-c: 333 × 265 = 88245 LAK (exact)
- FX-d: 1 × 265.5 = 265.5 → **266** LAK (sub-unit forces ceil)
- TH-a: 1000 THB → **1000 THB**, rate null (direction rule)
- TH-b: 1499.50 THB → **1499.50 THB** unchanged (satang preserved, no markup)
- drift: 0.1+0.2=0.3 exact as Big; 0.3×25=7.5 → 8 LAK via Big.roundUp

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript unused @ts-expect-error directives in premium.spec.ts**
- **Found during:** Final typecheck (`pnpm typecheck`)
- **Issue:** Two `@ts-expect-error` directives on `"UNKNOWN" as CoverageClass` expressions — the `as CoverageClass` cast made TypeScript accept the expression, leaving the directive unused (TS2578)
- **Fix:** Replaced with `as unknown as CoverageClass` double-cast which properly bypasses the type check at runtime while keeping the intent clear
- **Files modified:** `packages/shared/src/premium/premium.spec.ts`
- **Commit:** `0eb7c3d`

**2. [Rule 1 - Bug] ESLint no-unused-vars on Money import in money.spec.ts**
- **Found during:** `pnpm lint`
- **Issue:** `Money` type was imported in the spec but never referenced (only `makeMoney`/`addMoney` are used)
- **Fix:** Removed the `Money` import
- **Files modified:** `packages/shared/src/money/money.spec.ts`
- **Commit:** `0eb7c3d`

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| PREMIUM_TABLE amounts (645.21, 967.28, 323.14, 2850.00, 3200.00, 1500.00) | `packages/shared/src/premium/premium.ts` | [ASSUMED A2] — placeholder data from research doc. Real insurer rate-card data is deferred to when the insurer partner supplies it. Shape is locked; only the data changes. |
| MARKUP_KIPS_PER_RATE_UNIT = Big("15") | `packages/shared/src/fx/fx.math.ts` | [ASSUMED A1] — "+15 kips per rate unit" magnitude pending rate-feed unit confirmation. The function shape and math are locked. |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All three modules are pure in-process functions with no I/O. Threat model mitigations from PLAN.md are all proven by tests:

| Threat ID | Mitigation | Test |
|-----------|-----------|------|
| T-02-01 | Big.roundUp (ceil) only | FX-b: 265000.1 → 265001 (would be 265000 with floor) |
| T-02-02 | Markup on per-THB rate only; TH passthrough | TH-a/b: amount unchanged, rate null; FX-a: 265000 not 265015 |
| T-02-03 | Big end-to-end; explicit drift cases | 0.1+0.2=0.3 exact; FX drift case |
| T-02-04 | quote throws on null LA rate | `expect(() => quote("LA", ..., null)).toThrow()` |

## Next Phase Readiness

- Plan 01-03 (validators) and 01-04 (order machine + commission) can proceed — they only add files under their own `packages/shared/src/<domain>/` directories.
- The `./money`, `./fx`, and `./premium` subpaths in `@super-care/shared` are now live.

---
*Phase: 01-foundation-money-legal-cores*
*Completed: 2026-06-07*

## Self-Check: PASSED

Files verified:
- packages/shared/src/money/money.ts: FOUND
- packages/shared/src/money/money.spec.ts: FOUND
- packages/shared/src/money/index.ts: FOUND
- packages/shared/src/fx/fx.math.ts: FOUND
- packages/shared/src/fx/fx.math.spec.ts: FOUND
- packages/shared/src/fx/index.ts: FOUND
- packages/shared/src/premium/premium.ts: FOUND
- packages/shared/src/premium/premium.spec.ts: FOUND
- packages/shared/src/premium/index.ts: FOUND

Commits verified in git log:
- 1a66355: test(01-02): add failing Money value object spec (RED)
- ddb6002: feat(01-02): implement Money value object over big.js (GREEN — PLAT-03)
- 84b268d: test(01-02): add failing FX quote spec — full vector table (RED)
- 2cbe2d8: feat(01-02): implement FX quote — direction rule + markup + ceil (GREEN — FX-02/FX-03)
- f9b87de: test(01-02): add failing Premium lookup spec (RED)
- a2d5b38: feat(01-02): implement table-driven Premium lookup returning Big THB (GREEN — FX-01)
- 0eb7c3d: fix(01-02): remove unused Money import, fix ts-expect-error cast in premium spec
