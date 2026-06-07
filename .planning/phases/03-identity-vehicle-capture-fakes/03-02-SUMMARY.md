---
phase: 03-identity-vehicle-capture-fakes
plan: "02"
subsystem: persistence
tags: [migration, prisma, repository, encryption, audit, pii, lead, vehicle, ocr, draft-intake]
dependency_graph:
  requires:
    - 02-02-SUMMARY.md  # CryptoService, recordAudit, customer.repo pattern
    - 03-01-SUMMARY.md  # Next.js shell (apps/web runnable)
  provides:
    - lead.repo (createLead, convertLeadToCustomer)
    - vehicle.repo (createVehicle, readVehiclePii, findVehicleByChassisNumber)
    - ocr-result.repo (createOcrResult verbatim)
    - draft-intake.repo (createDraftIntake, updateDraftIntake, getDraftIntake)
    - Prisma migration: Lead→Customer link, verifiedBy/At on Customer+Vehicle, DraftIntake model
  affects:
    - 03-03 (fake adapters can persist OcrResult)
    - 03-04 (intake.service gets its persistence surface)
tech_stack:
  added: []
  patterns:
    - CryptoService AES-256-GCM envelope + HMAC blind-index (reused from Phase 2)
    - recordAudit(tx, ...) in same db.$transaction as data write (reused from Phase 2)
    - ActorContext injected by caller (system/test until Phase 7)
key_files:
  created:
    - apps/web/prisma/migrations/20260607000000_phase3_intake_draft_verify_lead_link/migration.sql
    - apps/web/src/server/modules/lead/lead.repo.ts
    - apps/web/src/server/modules/lead/lead.repo.int.spec.ts
    - apps/web/src/server/modules/ocr-result/ocr-result.repo.ts
    - apps/web/src/server/modules/ocr-result/ocr-result.repo.int.spec.ts
    - apps/web/src/server/modules/vehicle/vehicle.repo.ts
    - apps/web/src/server/modules/vehicle/vehicle.repo.int.spec.ts
    - apps/web/src/server/modules/draft-intake/draft-intake.repo.ts
    - apps/web/src/server/modules/draft-intake/draft-intake.repo.int.spec.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/test/db-harness.ts
decisions:
  - "convertLeadToCustomer inlines the encrypt+blindIndex logic within the transaction (rather than calling createCustomer) so both Lead-CONVERT and Customer-CREATE audit rows land in one db.$transaction"
  - "ocr-result.repo uses `as object` cast for rawPayload to satisfy Prisma's InputJsonValue without introducing any: the cast preserves verbatim storage guarantee"
  - "draft-intake.repo uses Prisma.JsonNull sentinel for nullable mapping column to avoid NullableJsonNullValueInput TS error"
  - "Decimal weight in vehicle.repo read as vehicle.weight.toString() at the boundary — never Float"
metrics:
  duration: "~30 min"
  completed: "2026-06-07"
  tasks: 3
  files: 11
---

# Phase 3 Plan 02: Migration + Repositories (lead, vehicle, ocr-result, draft-intake) Summary

**One-liner:** Prisma migration (Lead→Customer FK, verifiedBy/At, DraftIntake) + four new repos mirroring Phase-2 encrypt+blind-index+audit-in-tx pattern; 62 integration tests green.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Schema edits + [BLOCKING] prisma migrate | 2a012f9 | schema.prisma, migration.sql |
| 2 | lead.repo + ocr-result.repo + integration specs | 479549b | lead.repo.ts, lead.repo.int.spec.ts, ocr-result.repo.ts, ocr-result.repo.int.spec.ts, db-harness.ts |
| 3 | vehicle.repo + draft-intake.repo + integration specs | 9dda90f | vehicle.repo.ts, vehicle.repo.int.spec.ts, draft-intake.repo.ts, draft-intake.repo.int.spec.ts |

## Schema Changes

### Migration applied: `20260607000000_phase3_intake_draft_verify_lead_link`

**Lead model additions:**
- `customerId String? @unique` — FK to Customer (CUST-02 Lead→Customer link)
- `convertedAt DateTime?` — timestamp when conversion completed
- Relation: `customer Customer? @relation(...)` + reverse `convertedFromLead Lead?` on Customer

**Customer model additions:**
- `verifiedBy String?` — actor who completed field verification (CUST-07)
- `verifiedAt DateTime?` — timestamp of verification

**Vehicle model additions:**
- `verifiedBy String?` — actor who verified vehicle identifiers (CUST-07)
- `verifiedAt DateTime?` — timestamp of verification

**DraftIntake model (new, @@map "draft_intakes"):**
- `insuranceCompanyId String?`, `policyMode String?` (Step 1)
- `leadId String?`, `customerId String?` (Steps 2–2b)
- `identityDocumentId String?`, `ocrResultId String?` (Step 3)
- `vehicleId String?` (Step 5)
- `mapping Json?` — opaque mapper suggestions per field
- `verified Json @default("{}")` — per-field human-verified flags (CUST-07 gate)
- `step String @default("insurer")` — current wizard step
- `createdAt/updatedAt`

Migration applied to both `super_care_dev` and `super_care_test` databases.
`prisma migrate status` → "Database schema is up to date!"

## Repository Pattern (all repos mirror Phase-2 exactly)

```
fn(db: PrismaClient, ctx: ActorContext, input, crypto?=defaultCrypto())
  → db.$transaction(async (tx) => {
      encrypt PII fields via crypto.encrypt()
      compute blind-index via crypto.blindIndex()
      tx.model.create({ data: {...} })
      recordAudit(tx, ctx, { action, subjectType, subjectId })
      return row
    })
```

### lead.repo
- `createLead(db, ctx, input)` — writes Lead + 1 audit CREATE in one tx
- `convertLeadToCustomer(db, ctx, leadId, input, crypto)` — creates Customer (encrypt nationalId/passportNumber inline), sets Lead.customerId + convertedAt, audits Lead-CONVERT + Customer-CREATE in **one tx** (rollback leaves neither)

### ocr-result.repo
- `createOcrResult(db, ctx, { identityDocumentId, rawPayload, provider? })` — stores rawPayload **verbatim** (no trim/normalize/uppercase), defaults provider="fake", audit CREATE in tx
- Integration test asserts `stored === input` with leading/trailing whitespace and mixed-case keys preserved

### vehicle.repo
- `createVehicle(db, ctx, input, crypto)` — encrypts chassisNumber+engineNumber, computes chassisNumberIdx, audit CREATE in tx
- `readVehiclePii(db, ctx, vehicleId, crypto)` — decrypts chassis/engine in-module only, audit READ; weight returned as string (Decimal boundary)
- `findVehicleByChassisNumber(db, ctx, rawChassis, crypto)` — blind-index lookup (no decryption), audit READ when found

### draft-intake.repo
- `createDraftIntake(db, ctx, input)` — persists wizard state, audit CREATE in tx
- `updateDraftIntake(db, ctx, id, patch)` — partial update (step/verified map/entity refs), audit UPDATE in tx
- `getDraftIntake(db, id)` — read-only fetch (no audit)

## Verification Results

```
pnpm typecheck  → PASS (0 errors)
pnpm lint       → PASS (0 errors, 0 warnings)
pnpm test       → PASS (13 files, 148 unit tests)
pnpm test:int   → PASS (8 files, 62 integration tests)
prisma migrate status → "Database schema is up to date!"
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-interactive environment blocks `prisma migrate dev`**
- **Found during:** Task 1
- **Issue:** `npx prisma migrate dev` exits with "non-interactive environment" error when stdin is not a TTY
- **Fix:** Used `prisma migrate diff --from-config-datasource --to-schema` to generate the SQL, created migration directory manually, then applied via `prisma migrate deploy` (deterministic, CI-safe approach)
- **Files modified:** `prisma/migrations/20260607000000_phase3_intake_draft_verify_lead_link/migration.sql`

**2. [Rule 1 - Bug] Empty interface lint error in lead.repo**
- **Found during:** Task 2 lint check
- **Issue:** `ConvertLeadInput extends CreateCustomerInput {}` triggers `@typescript-eslint/no-empty-object-type`
- **Fix:** Changed to `type ConvertLeadInput = CreateCustomerInput` (type alias, semantically equivalent)

**3. [Rule 1 - Bug] Decimal type not exported from generated Prisma client**
- **Found during:** Task 3 typecheck
- **Issue:** `import type { Decimal } from "../../../generated/prisma/client.js"` fails — Prisma 7 doesn't re-export Decimal from the client module
- **Fix:** Used `vehicle.weight.toString()` directly (Prisma Decimal objects have `.toString()`)

**4. [Rule 1 - Bug] NullableJsonNullValueInput TS error on draft-intake mapping column**
- **Found during:** Task 3 typecheck
- **Issue:** Passing `null` for a nullable JSON column requires Prisma's `Prisma.JsonNull` sentinel, not a plain `null`
- **Fix:** Import `Prisma` namespace from generated client, use `Prisma.JsonNull` for the mapping field when no value provided

## Known Stubs

None — all repos perform real database operations. The `provider: "fake"` default in ocr-result.repo is intentional (not a stub — it's the correct Phase 3 value per 03-CONTEXT.md; real provider swaps in Phase 10).

## Threat Flags

No new trust boundaries beyond plan scope:
- chassis/engine encryption covers T-03-03 (mitigate — implemented)
- recordAudit in-tx covers T-03-04 (mitigate — implemented)
- verbatim rawPayload covers T-03-05 (mitigate — tested with byte-equality assertion)

## Self-Check: PASSED

Files exist:
- apps/web/prisma/migrations/20260607000000_phase3_intake_draft_verify_lead_link/migration.sql ✓
- apps/web/src/server/modules/lead/lead.repo.ts ✓
- apps/web/src/server/modules/lead/lead.repo.int.spec.ts ✓
- apps/web/src/server/modules/ocr-result/ocr-result.repo.ts ✓
- apps/web/src/server/modules/ocr-result/ocr-result.repo.int.spec.ts ✓
- apps/web/src/server/modules/vehicle/vehicle.repo.ts ✓
- apps/web/src/server/modules/vehicle/vehicle.repo.int.spec.ts ✓
- apps/web/src/server/modules/draft-intake/draft-intake.repo.ts ✓
- apps/web/src/server/modules/draft-intake/draft-intake.repo.int.spec.ts ✓

Commits exist:
- 2a012f9 ✓
- 479549b ✓
- 9dda90f ✓
