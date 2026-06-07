---
phase: 01-foundation-money-legal-cores
verified: 2026-06-07T09:10:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 1: Foundation & Money/Legal Cores — Verification Report

**Phase Goal:** Establish the monorepo with a green CI gate and prove every money/legal pure function correct via TDD before any I/O exists.
**Verified:** 2026-06-07
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Gate Commands (Live Results)

| Command | Exit Code | Output |
|---------|-----------|--------|
| `pnpm typecheck` | 0 (clean) | `tsc -b` — 0 errors |
| `pnpm lint` | 0 (clean) | ESLint — 0 violations |
| `pnpm test` | 0 (clean) | 11 test files, **134 tests passed** |

All three gate commands green. TDD discipline confirmed: RED commits precede every GREEN commit across all four plans.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | pnpm monorepo typechecks under strict TS (`any` banned) and CI runs typecheck+lint+tests, red on failure | VERIFIED | `tsconfig.base.json` sets `strict:true`, `noImplicitAny:true`; `eslint.config.mjs` sets `@typescript-eslint/no-explicit-any: error`; `.github/workflows/ci.yml` runs typecheck→lint→test as separate failing steps; human-verify checkpoint confirmed red-on-failure on live CI |
| 2 | `fx.math` passes a vector table: THB→LAK = source rate +15 kips/unit then ceil; no-conversion-on-THB; no float drift | VERIFIED | `fx.math.ts` implements `quote()` with `Big.roundUp`; 7 FX vectors (FX-a/b/c/d, TH-a/b, drift) all green; `MARKUP_KIPS_PER_RATE_UNIT = new Big("15")` applied to rate only; TH path returns `premiumThb` unchanged with null rate fields; 0.1+0.2=0.3 drift case proven |
| 3 | Thai National ID validator passes check-digit-0 vectors + rejects bad shapes; passport and plate/chassis/engine accept Thai/Lao script and foreign passport shapes | VERIFIED | `isValidThaiNationalId` uses `(11-(sum%11))%10` — final `%10` present; V1/V2/V3 (check-digit-0) pass; I6 trap vector fails correctly; `isValidPassport` accepts `[A-Z0-9]{6,9}` incl. all-digit foreign passports; `isValidPlate` uses Unicode ranges U+0E00-0E7F (Thai) and U+0E80-0EFF (Lao); `isValidChassis` uses `[A-HJ-NPR-Z0-9]{6,17}` — C4 (letter O) rejected |
| 4 | `order.state-machine` accepts only legal transitions and throws on illegal ones; refund path reachable only after PAID; all failure states modelled | VERIFIED | `next()` backed by plain `TRANSITIONS` table; `IllegalTransition` class exported; refund reachable from PAID and CERT_FAILED only; 5 pre-PAID refund attempts all throw; 39 order-machine tests green; terminal states (COMPLETED/REFUNDED/CANCELLED) sink — all events throw |
| 5 | `commission.math` passes a tier-ladder table testing both sides of every threshold against the THB base | VERIFIED | `computeCommissionThb()` takes `Big premiumThb`; LADDER has 3 tiers (vol 0/10/50); boundary vectors at 9/10 (tier0→tier1) and 49/50/51 (tier1→tier2) proven; rounding test (23.3331→23.33 via `Big.roundHalfUp`); return type is `Big`; 15 commission tests green |

**Score: 5/5 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tsconfig.base.json` | Strict TS base | VERIFIED | `strict`, `noImplicitAny`, `composite`, `NodeNext` set |
| `eslint.config.mjs` | `any` banned | VERIFIED | `@typescript-eslint/no-explicit-any: error` |
| `vitest.config.ts` | Test runner config | VERIFIED | includes `packages/shared/src/**/*.spec.ts`, no watch mode |
| `.github/workflows/ci.yml` | CI gate: typecheck+lint+test | VERIFIED | 3 separate steps; pnpm setup; Node 22; `--frozen-lockfile` |
| `pnpm-workspace.yaml` | Workspace definition | VERIFIED | `apps/web` + `packages/shared` |
| `packages/shared/package.json` | 9 export subpaths reserved | VERIFIED | `.`, `./money`, `./fx`, `./premium`, `./commission`, `./order`, `./validators`, `./schemas`, `./types` all defined |
| `packages/shared/src/schemas/fx-quote.schema.ts` | Zod boundary rejects float money | VERIFIED | `premiumThb: z.string()` — `safeParse({premiumThb: 1000.0})` returns `success: false` |
| `packages/shared/src/money/money.ts` | Money value object over big.js | VERIFIED | `makeMoney()` rejects JS number at runtime and TS overload; scale enforcement (THB 2dp, LAK 0dp) |
| `packages/shared/src/fx/fx.math.ts` | FX quote with direction rule + ceil | VERIFIED | `quote()` implements `+15kips` on rate, `Big.roundUp`, TH passthrough; no `Math.*` calls |
| `packages/shared/src/premium/premium.ts` | Table-driven Premium returning Big | VERIFIED | `lookupPremiumThb()` returns `new Big(row.premiumThb)`; throws on unknown key; amounts are decimal strings |
| `packages/shared/src/validators/thai-national-id.ts` | Thai-ID checksum incl. check-digit-0 | VERIFIED | `(11-(sum%11))%10` algorithm; final `%10` present; 12 test vectors including V1/V2/V3 (check-digit=0) |
| `packages/shared/src/validators/passport.ts` | Passport format validator | VERIFIED | `/^[A-Z0-9]{6,9}$/` — accepts all-digit foreign passports |
| `packages/shared/src/validators/plate.ts` | Plate: Thai/Lao script support | VERIFIED | Unicode ranges `฀-๿` (Thai) and `຀-໿` (Lao) |
| `packages/shared/src/validators/chassis.ts` | Chassis: VIN-safe charset, O rejected | VERIFIED | `/^[A-HJ-NPR-Z0-9]{6,17}$/` — excludes I, O, Q |
| `packages/shared/src/validators/engine.ts` | Engine number validator | VERIFIED | `/^[A-Z0-9-]{4,20}$/` — hyphen allowed, spaces rejected |
| `packages/shared/src/order/order.machine.ts` | Order SM: illegal throws, refund path | VERIFIED | `next()` throws `IllegalTransition`; PAID→REFUNDING→REFUNDED and CERT_FAILED→REFUNDING→REFUNDED proven; 11 states; 39 tests |
| `packages/shared/src/commission/commission.ts` | Commission tier ladder on THB base | VERIFIED | `computeCommissionThb(partnerVolume, Big premiumThb)`; whole-volume tier selection; `Big.roundHalfUp` at 2dp; 15 boundary tests |
| `apps/web/src/index.ts` | Next.js shell — no business logic | VERIFIED | Shell only: re-exports `Currency`/`Market` types; no runtime Next.js import; no HTTP endpoints, no Prisma |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web` | `@super-care/shared` | TypeScript project reference + workspace:* | VERIFIED | `apps/web/src/index.ts` imports from `@super-care/shared`; `pnpm typecheck` resolves via `tsc -b` project references |
| `fx.math.ts` | `big.js` | `import Big from "big.js"` | VERIFIED | `Big.roundUp` used for ceil; `MARKUP_KIPS_PER_RATE_UNIT = new Big("15")` |
| `commission.ts` | `big.js` | `import Big from "big.js"` | VERIFIED | `Big.roundHalfUp` used; all amounts constructed from decimal strings |
| `order.machine.ts` | `xstate` | `import { createMachine } from "xstate"` | VERIFIED | XState used for visualization export; `next()` backed by plain table (no XState runtime risk) |
| `fxQuoteSchema` | `zod` | `import { z } from "zod"` | VERIFIED | `z.string()` on money fields; float rejection proven by spec |
| CI `typecheck` step | `tsc -b` | `pnpm typecheck` → root `package.json` | VERIFIED | `"typecheck": "tsc -b"` in root `package.json`; composite project references resolve |

---

### Requirement Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| PLAT-01 | pnpm monorepo, strict TS (`any` banned) | SATISFIED | `tsconfig.base.json`: `strict:true`, `noImplicitAny:true`; `eslint.config.mjs`: `no-explicit-any: error`; monorepo: `apps/web` + `packages/shared` under pnpm workspaces |
| PLAT-02 | Zod schemas validate every untrusted boundary | SATISFIED | `fxQuoteSchema` established with decimal-string money fields; `safeParse` rejects JS-number money (6 spec tests); pattern documented for all later phases |
| PLAT-03 | Money is Decimal/big.js, never float | SATISFIED | `makeMoney()` throws `TypeError` on JS number; `computeCommissionThb()` takes `Big`; all premium amounts stored as decimal strings; no `parseFloat`/`Math.*` in production source |
| PLAT-04 | CI gate red on failure | SATISFIED | `.github/workflows/ci.yml` runs typecheck+lint+test as separate failing steps; human-verify checkpoint confirmed: `main` green, planted-failure branch red |
| CUST-05 | Thai National ID 13-digit checksum validator | SATISFIED | `isValidThaiNationalId` with `(11-(sum%11))%10`; V1/V2/V3 check-digit-0 vectors pass; I6 trap vector fails; rejects non-13-length and non-numeric |
| CUST-06 | Passport format validator | SATISFIED | `isValidPassport` — `/^[A-Z0-9]{6,9}$/`; 8 P1–P8 vectors including all-digit foreign passports |
| VEH-02 | Plate / chassis / engine format validators | SATISFIED | `isValidPlate` (Thai/Lao/Latin Unicode); `isValidChassis` (VIN-safe charset, letter O rejected via C4 vector); `isValidEngine` (hyphen allowed, spaces rejected) |
| FX-01 | Table-driven Premium lookup | SATISFIED | `lookupPremiumThb(coverage, vehicleType): Big`; static `PREMIUM_TABLE`; throws on unknown key; amounts as decimal strings |
| FX-02 | FxQuote: THB→LAK at source rate +15 kips/unit, rounded up | SATISFIED | `quote()` in `fx.math.ts`; `adjustedRate = sourceRate.plus(Big("15"))`; `lak = premiumThb.times(adjustedRate).round(0, Big.roundUp)`; FX-b (ceil vs floor) and FX-d (sub-unit ceil) vectors proven |
| FX-03 | FxQuote direction rule: no conversion/markup on THB path | SATISFIED | TH branch returns `premiumThb` unchanged; `sourceRatePerThb: null`, `adjustedRatePerThb: null`; TH-a and TH-b vectors proven; rate ignored even when passed |
| ORD-02 | Order state machine; illegal transitions throw | SATISFIED | `next()` throws `IllegalTransition` for any unmapped event; 11 states; 39 tests covering happy path, all failure states, both refund paths, pre-PAID refund throws, terminal-state sinks |
| COMM-01 | Commission tier-ladder math on THB base | SATISFIED | `computeCommissionThb(partnerVolume, Big premiumThb)`; whole-volume tier selection; percent + flat components; `Big.roundHalfUp` at 2dp |
| COMM-02 | Commission boundary cases both sides of every threshold | SATISFIED | 15 tests covering vol 9/10 (threshold 10) and vol 49/50/51 (threshold 50); both-sides-of-threshold assertion in boundary summary describe block |

**All 13 Phase 1 requirements: SATISFIED**

---

### Scope Discipline Check

| Concern | Expected | Actual | Status |
|---------|----------|--------|--------|
| No Prisma schema | Absent in Phase 1 | No `.prisma` files anywhere in repo | CLEAN |
| No NestJS | Absent — Next.js only | No `nest-cli.json`, no `@nestjs/*` deps; `apps/api` does not exist | CLEAN |
| No HTTP endpoints | Absent in Phase 1 | `apps/web/src/index.ts` is type-only shell; no route handlers | CLEAN |
| No UI | Absent in Phase 1 | No Next.js `app/` or `pages/` directory; shell only | CLEAN |
| No fake/real adapters | Absent in Phase 1 | No OCR/payment/messaging/certificate modules anywhere | CLEAN |
| No float math | Forbidden | No `parseFloat`, `Math.round`, `Math.floor`, `Math.ceil` calls in production source | CLEAN |

---

### Anti-Patterns Found

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `premium.ts` | `[ASSUMED A2]` placeholder data (rate amounts) | INFO | Explicitly flagged, intentional deferral. Shape locked; data replaced when insurer rate card supplied. Not a code-quality stub — the function is fully implemented. |
| `commission.ts` | `[ASSUMED A3]` placeholder tier data | INFO | Explicitly flagged, intentional deferral. Shape and boundary discipline locked; data replaced when partner commission policy confirmed (Phase 8+). |
| `fx.math.ts` | `[ASSUMED A1]` markup magnitude | INFO | "+15 kips per rate unit" magnitude pending rate-feed unit confirmation. The math shape and all vectors are locked. |
| `validators/*.ts` | `[ASSUMED A4]` length ranges | INFO | Passport 6-9, plate 2-20, chassis 6-17, engine 4-20 are pragmatic ICAO/VIN baselines. No blocking concern — correctness-critical checksum and charset logic is not assumed. |

No `TBD`, `FIXME`, or `XXX` markers found in any source file. No empty return stubs. No `return null` / `return {}` / `return []` patterns in production paths.

---

### Human Verification Required

One item was verified by human checkpoint during execution (already confirmed):

1. **CI red-on-failure** — Push a branch with a deliberate failing test; confirm CI check fails and blocks merge.
   - **Result:** Confirmed by developer on 2026-06-07 (throwaway `ci-red-test` branch turned CI red; branch deleted after verification).
   - **Why human:** Requires observing a live CI run — not verifiable by grep.

No remaining human verification items. All other behaviors are proven by the automated test suite.

---

### Deferred Items

The following items are legitimately deferred to later phases (not gaps):

| Item | Deferred To | Evidence |
|------|-------------|----------|
| Real insurer rate-card amounts in `PREMIUM_TABLE` | Phase 4 (Pricing & Order Spine) or when insurer supplies data | ROADMAP Phase 4 wires the premium lookup into Orders; [ASSUMED A2] is documented |
| Real partner commission tier ladder in `LADDER` | Phase 8 (Partners & Commission) | ROADMAP Phase 8 goal: "accrue tier-ladder Commission…"; [ASSUMED A3] documented |
| FX markup unit confirmation | Pre-Phase 4 (requires rate-feed docs) | [ASSUMED A1] documented; math shape locked |
| Validator length-range confirmation | Pre-Phase 3 (real docs may surface edge cases) | [ASSUMED A4] documented; checksum/charset logic locked |

---

## Summary

Phase 1 delivered exactly what the goal required: a green-CI monorepo with all money/legal pure functions TDD'd and proven correct before any I/O exists. All 5 success criteria from ROADMAP.md are observable in the codebase. All 13 requirement IDs (PLAT-01..04, CUST-05/06, VEH-02, FX-01/02/03, ORD-02, COMM-01/02) are satisfied with substantive, wired, tested implementations.

The four `[ASSUMED]` data items (rate card, commission ladder, FX markup magnitude, validator length ranges) are intentional and explicitly documented deferrals — the *shape* and *test discipline* are locked as Phase 1 requires; the *data* changes when external parties supply it. These do not affect correctness of the pure-function contracts that Phase 1 mandates.

The scope boundary held: no Prisma, no NestJS, no HTTP endpoints, no UI, no adapters.

---

_Verified: 2026-06-07T09:10:00Z_
_Verifier: Claude (gsd-verifier)_
