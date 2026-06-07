---
phase: 03-identity-vehicle-capture-fakes
plan: "04"
subsystem: intake-orchestration
tags: [intake, verify-gate, CUST-07, transactional, server-enforced, CMI-02, VEH-01]
dependency_graph:
  requires: ["03-02", "03-03"]
  provides: ["intake.service", "verify-gate"]
  affects: ["03-05", "03-06"]
tech_stack:
  added: []
  patterns:
    - "Server-enforced verify gate (Pattern 3 from 03-RESEARCH): assertVerified runs BEFORE the transaction — gate failure commits nothing (T-03-15)"
    - "TDD RED→GREEN for both unit (verify-gate) and integration (intake.service)"
    - "server-only shim aliased in Vitest configs so server modules load cleanly in Node.js test environment"
    - "DraftIntake.mapping Json used as ephemeral staging area for customer PII draft and vehicle draft before final transactional save"
key_files:
  created:
    - apps/web/src/server/modules/intake/verify-gate.ts
    - apps/web/src/server/modules/intake/verify-gate.spec.ts
    - apps/web/src/server/modules/intake/intake.schema.ts
    - apps/web/src/server/modules/intake/intake.service.ts
    - apps/web/src/server/modules/intake/intake.service.int.spec.ts
    - apps/web/src/test/server-only-shim.ts
  modified:
    - vitest.config.ts
    - vitest.integration.config.ts
decisions:
  - "server-only shim: aliased in both vitest configs; Next.js still enforces the real guard at build time — the shim is test-only"
  - "DraftIntake.mapping.customerDraft stores raw PII draft (server-side only, ephemeral); saveIntake encrypts it via repos in the transaction"
  - "captureCustomer stores customer PII on mapping.customerDraft; setVehicleDraft stores on mapping.vehicleDraft — both materialized in one saveIntake transaction"
  - "assertVerified runs OUTSIDE the transaction (gate-before-write = T-03-15); on failure no rows are written"
metrics:
  duration: "25min"
  completed: "2026-06-07"
  tasks: 2
  files: 8
---

# Phase 03 Plan 04: Intake Service + Verify Gate Summary

**One-liner:** Server-enforced CUST-07 verify gate (pure validator re-check + verified-map check) plus transactional saveIntake that atomically persists Lead→Customer + IdentityDocument + Vehicle with verifiedBy/At + audit rows in one db.$transaction.

## What Was Built

### Task 1: intake.schema + verify-gate (TDD)

**verify-gate.ts**
- `REQUIRED_VERIFY_FIELDS`: 7 fields — nationalId, firstName, lastName, dob, plate, chassisNumber, engineNumber
- `VerifyGateError`: carries `unverifiedFields` + `invalidIdentifiers` lists for precise diagnosis
- `assertVerified(state)`: two-layer gate — (1) checks all required fields are marked `true` in the verified map, (2) re-runs the five Phase-1 pure validators server-side regardless of client flags (Pitfall 5 / T-03-12, T-03-13)
- Handles passport card type (`cardTypeCode = "2"`) by substituting passportNumber for nationalId
- Pure function — no I/O, no Prisma, no CryptoService

**intake.schema.ts**
- `startIntakeInputSchema`: insuranceCompanyId + policyMode (NEW|RENEWAL)
- `customerStepInputSchema`: PII fields with `.refine()` on nationalId/passportNumber using Phase-1 validators; `.superRefine()` enforces correct identifier per card type
- `vehicleStepInputSchema`: plate/chassis/engine with `.refine()` using pure validators
- `verifyMapInputSchema`: `z.record(z.string(), z.boolean())`
- `intakeStepInputSchema`: discriminated union over all wizard steps

**verify-gate.spec.ts** (15 unit tests — all green):
- Gate throws VerifyGateError listing specific unverified fields
- Gate throws when client marks identifier verified=true but value fails server-side validator (Pitfall 5)
- Gate passes when all fields verified and all identifiers valid

### Task 2: intake.service orchestration + transactional saveIntake (TDD integration)

**intake.service.ts** (marked `import "server-only"`)
- `startIntake(db, ctx, input)` → createDraftIntake (CMI-02)
- `captureCustomer(db, ctx, draftId, input, leadId, crypto)` → stores customer PII on draft.mapping.customerDraft + links leadId
- `runOcr(db, ctx, draftId, file, documentType)` → storage.put + ocr.extract + createOcrResult (verbatim) + updates draft
- `suggestMappings(rawValue, candidates)` → mapper.map (suggestions only, no auto-commit)
- `setVerified(db, ctx, draftId, verifyMap)` → updateDraftIntake.verified
- `setVehicleDraft(db, ctx, draftId, input)` → stores vehicle data on draft.mapping.vehicleDraft
- `saveIntake(db, ctx, draftId, crypto)` → assertVerified (gate OUTSIDE tx) → ONE db.$transaction:
  - Create Customer (encrypt nationalId/passportNumber + blindIndex, set verifiedBy/verifiedAt)
  - Link Lead.customerId + Lead.convertedAt
  - Create IdentityDocument (encrypt documentNumber + documentRef)
  - Create Vehicle (encrypt chassisNumber + engineNumber + chassisNumberIdx, set verifiedBy/verifiedAt)
  - Write audit rows for each entity (Customer, Lead/CONVERT, IdentityDocument, Vehicle)
  - Update DraftIntake step to "complete"

**server-only shim** (`apps/web/src/test/server-only-shim.ts`): empty module aliased in both vitest configs so `import "server-only"` in server modules is a no-op under Node.js test environment (Next.js still enforces the real guard at build time).

**intake.service.int.spec.ts** (7 integration tests — all green):
- `startIntake` records insurer + NEW/RENEWAL + audit CREATE row (CMI-02)
- `saveIntake` throws VerifyGateError + persists nothing when chassisNumber unverified (rollback proof)
- `saveIntake` throws VerifyGateError + persists nothing on client-bypass (invalid nationalId, verified=true) — Pitfall 5 proof
- Happy-path: Customer created with verifiedBy/At, Lead.customerId/convertedAt set, IdentityDocument + Vehicle created, audit rows present
- PII stored as CryptoService envelopes (envelope format `v1:...` verified in DB)

## Threat Mitigations Delivered

| Threat ID | Mitigation |
|-----------|-----------|
| T-03-12 | assertVerified re-checks verified map server-side + re-runs pure validators before any write |
| T-03-13 | Gate re-runs isValid* validators regardless of client flags — forged "verified=true" rejected |
| T-03-14 | verifiedBy/verifiedAt stamped on Customer + Vehicle; recordAudit(tx,…) for each entity inside the transaction |
| T-03-15 | assertVerified runs BEFORE db.$transaction — gate failure = zero rows committed |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `server-only` package not installed in Node.js test environment**
- **Found during:** Task 2 integration tests (GREEN phase)
- **Issue:** `import "server-only"` in intake.service.ts threw `Cannot find package 'server-only'` when loaded by Vitest — the package is a Next.js build-time guard not installed as a runtime dep
- **Fix:** Created `apps/web/src/test/server-only-shim.ts` (empty export) and added `resolve.alias` in both `vitest.config.ts` and `vitest.integration.config.ts`. Next.js still enforces the real `server-only` guard at `next build` time; the shim is Vitest-only
- **Files modified:** `vitest.config.ts`, `vitest.integration.config.ts`, `apps/web/src/test/server-only-shim.ts`
- **Commit:** 5ce37ec

**2. [Rule 1 - Bug] Empty plate string not caught by verify-gate**
- **Found during:** Task 1 verify-gate.spec.ts RED→GREEN
- **Issue:** Gate condition `plate !== ""` prevented `isValidPlate("")` from being called; empty string is invalid (length < 2) but gate skipped it
- **Fix:** Removed the empty-string guard for plate; `isValidPlate("")` returns false and the gate throws correctly
- **Files modified:** `verify-gate.ts`
- **Commit:** d23337a

**3. [Rule 1 - Bug] Zod v4 `z.record()` requires two arguments**
- **Found during:** Task 1 typecheck
- **Issue:** `z.record(z.boolean())` is a 2-argument API in Zod v4; the one-argument form is a type error
- **Fix:** Changed to `z.record(z.string(), z.boolean())`
- **Files modified:** `intake.schema.ts`
- **Commit:** d23337a

## Known Stubs

None — all orchestration logic is wired and tested.

## Self-Check

### Files Created Exist
- [x] `apps/web/src/server/modules/intake/verify-gate.ts`
- [x] `apps/web/src/server/modules/intake/verify-gate.spec.ts`
- [x] `apps/web/src/server/modules/intake/intake.schema.ts`
- [x] `apps/web/src/server/modules/intake/intake.service.ts`
- [x] `apps/web/src/server/modules/intake/intake.service.int.spec.ts`
- [x] `apps/web/src/test/server-only-shim.ts`

### Commits Exist
- [x] d23337a — feat(03-04): intake.schema + verify-gate
- [x] 5ce37ec — feat(03-04): intake.service orchestration + transactional saveIntake

### Test Results
- Unit tests: 192 passed (17 test files)
- Integration tests: 69 passed (9 test files)
- Typecheck: clean
- Lint: clean

## Self-Check: PASSED
