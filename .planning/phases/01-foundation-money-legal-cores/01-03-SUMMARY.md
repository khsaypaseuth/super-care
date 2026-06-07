---
phase: 01-foundation-money-legal-cores
plan: 03
subsystem: validators
tags: [tdd, validators, thai-national-id, passport, plate, chassis, engine, pure-functions]

requires:
  - "01-01 (monorepo scaffold — TS project refs, Vitest, ESLint, ./validators subpath reserved)"
provides:
  - "isValidThaiNationalId — 13-digit checksum validator with check-digit-0 support (CUST-05)"
  - "isValidPassport — uppercase alphanumeric format validator, 6–9 chars (CUST-06)"
  - "isValidPlate — Thai/Lao/Latin plate validator with multi-script Unicode support (VEH-02)"
  - "isValidChassis — VIN-safe charset [A-HJ-NPR-Z0-9], length 6–17 (VEH-02)"
  - "isValidEngine — alphanumeric+hyphen, length 4–20 (VEH-02)"
  - "validators/index.ts barrel re-exporting all five validators"
affects:
  - "Phase 2+ — identifier fields on Customer (CUST-05/06) and Vehicle (VEH-02) will use these validators at the Zod boundary"
  - "apps/web — import via @super-care/shared/validators subpath"

tech-stack:
  added: []
  patterns:
    - "Pure-function TDD: RED commit (failing spec) → GREEN commit (implementation) per validator"
    - "Data-driven vector-table tests: all edge cases from 01-RESEARCH.md encoded as named test cases"
    - "Multi-script Unicode regex: Thai (U+0E00-0E7F) + Lao (U+0E80-0EFF) in plate validator"
    - "VIN charset exclusion: [A-HJ-NPR-Z0-9] regex excludes I/O/Q — no special-case code needed"

key-files:
  created:
    - packages/shared/src/validators/thai-national-id.ts
    - packages/shared/src/validators/thai-national-id.spec.ts
    - packages/shared/src/validators/passport.ts
    - packages/shared/src/validators/passport.spec.ts
    - packages/shared/src/validators/plate.ts
    - packages/shared/src/validators/plate.spec.ts
    - packages/shared/src/validators/chassis.ts
    - packages/shared/src/validators/chassis.spec.ts
    - packages/shared/src/validators/engine.ts
    - packages/shared/src/validators/engine.spec.ts
    - packages/shared/src/validators/index.ts
  modified: []

key-decisions:
  - "Thai-ID algorithm exactly as in research: (11-(sum%11))%10; final %10 is load-bearing for check-digit-0"
  - "Passport not tied to a single country — [A-Z0-9]{6,9} accepts all-digit foreign passports (P3)"
  - "Plate uses Unicode ranges for Thai (0E00-0E7F) and Lao (0E80-0EFF) rather than Latin-only regex (Pitfall 4)"
  - "Chassis uses [A-HJ-NPR-Z0-9] charset (VIN-standard I/O/Q exclusion) with length 6–17 not hard 17"
  - "Engine uses [A-Z0-9-]{4,20} — hyphen allowed, spaces always rejected [ASSUMED A4]"
  - "Length ranges for passport/plate/chassis/engine are [ASSUMED A4] baselines pending authoritative specs"

requirements-completed: [CUST-05, CUST-06, VEH-02]

duration: ~8min
completed: 2026-06-07
---

# Phase 1 / Plan 03: Identifier Validators Summary

**Five pure deterministic identifier validators — Thai National ID checksum (incl. check-digit-0), passport format, plate (Thai/Lao/Latin script), chassis (VIN-safe charset), and engine number — TDD'd with exhaustive vector tables and exported from a barrel index. No LLM, no I/O.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 3 (each: RED commit → GREEN commit)
- **Tests:** 36 new (validators) + 44 pre-existing = **80 total, all green**
- **Files created:** 11

## Accomplishments

- **Thai National ID (CUST-05):** `isValidThaiNationalId` implements the exact research algorithm
  `check = (11 - (sum % 11)) % 10` with 12 vector-table tests. The critical check-digit-0 cases
  (V1: 1102000000000, V2: 1000000000050, V3: 1000000000190) pass; the I6 trap
  (`1101700230705` → computed check is 8, not 5) and all wrong-shape inputs fail.
  The final `% 10` is confirmed present via `grep`.

- **Passport (CUST-06):** `isValidPassport` accepts `[A-Z0-9]{6,9}` — not tied to one country;
  all-digit foreign passports (P3: `123456789`) accepted; 8 P1–P8 vectors green.

- **Plate (VEH-02):** `isValidPlate` uses Unicode ranges for Thai (U+0E00–U+0E7F) and Lao
  (U+0E80–U+0EFF) alongside Latin A–Z; Thai-script plate `กข 1234` (PL1), Lao-script `ກຂ 0123`
  (PL3) accepted; empty and symbol-only rejected. 6 PL1–PL6 vectors green.

- **Chassis (VEH-02):** `isValidChassis` uses regex `[A-HJ-NPR-Z0-9]{6,17}` — I, O, Q excluded
  per VIN convention; the critical C4 vector (`1HGCM82633A0O4352` containing letter O) rejected;
  shorter regional chassis (C3: `ABC123456`, 9 chars) accepted. 6 C1–C6 vectors green.

- **Engine (VEH-02):** `isValidEngine` uses `[A-Z0-9-]{4,20}` — hyphen allowed, spaces always
  rejected; E4 (`K20A 1234` with embedded space) correctly invalid. 4 E1–E4 vectors green.

- **Barrel:** `validators/index.ts` re-exports all five validators; consumed via
  `@super-care/shared/validators` subpath (reserved in 01-01).

- **Quality gates:** `pnpm typecheck` clean; `pnpm lint` clean (no `any`); `pnpm exec vitest run`
  → 80/80 tests pass across 9 spec files.

## Task Commits (TDD RED → GREEN)

| Task | Gate | Commit | Files |
|------|------|--------|-------|
| 1: Thai National ID | RED | `e67b9ba` | thai-national-id.spec.ts |
| 1: Thai National ID | GREEN | `e9e4146` | thai-national-id.ts |
| 2: Passport | RED | `e672cd7` | passport.spec.ts |
| 2: Passport | GREEN | `342e352` | passport.ts |
| 3: Plate/Chassis/Engine | RED | `a3c60ae` | plate.spec.ts, chassis.spec.ts, engine.spec.ts |
| 3: Plate/Chassis/Engine | GREEN | `85b85d1` | plate.ts, chassis.ts, engine.ts, index.ts |

## TDD Gate Compliance

- RED gates: `e67b9ba`, `e672cd7`, `a3c60ae` (all confirmed — `test(01-03):` commits)
- GREEN gates: `e9e4146`, `342e352`, `85b85d1` (all confirmed — `feat(01-03):` commits)
- All RED commits existed with failing tests BEFORE the GREEN implementation commits.

## Deviations from Plan

None — plan executed exactly as written.

All vector tables from 01-RESEARCH.md (V1–V6, I1–I6, P1–P8, PL1–PL6, C1–C6, E1–E4) are
encoded as named test cases. No functionality was added beyond the plan scope.

## Known Stubs

None. All five validators are fully implemented; no placeholder return values or TODOs in
production paths.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. All five
validators are pure functions with no I/O — structurally incapable of routing identifiers
through an LLM (T-03-02 mitigated). The final `% 10` step is present in the implementation
(T-03-01 mitigated). Thai/Lao-script plates and foreign passports are accepted (T-03-03
mitigated via vector table proof).

## Assumed Baselines [ASSUMED A4]

Length ranges are pragmatic baselines from 01-RESEARCH.md — no single authoritative spec
for Lao/Thai plates and regional engine numbers. Flagged for confirmation:

- Passport: 6–9 chars (ICAO Doc 9303 Part 3 upper bound = 9)
- Plate: 2–20 chars
- Chassis: 6–17 chars (ISO 3779 standard = 17; regional/older = shorter)
- Engine: 4–20 chars

---
*Phase: 01-foundation-money-legal-cores*
*Completed: 2026-06-07*
