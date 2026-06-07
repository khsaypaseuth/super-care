---
phase: 02-encrypted-data-layer-audit-spine
plan: "02"
subsystem: persistence-audit-spine
tags:
  - prisma
  - aes-256-gcm
  - hmac-blind-index
  - audit-in-transaction
  - pii-encryption
  - cmi-master-tables
  - seed-idempotency
dependency_graph:
  requires:
    - "02-01: CryptoService (encrypt/decrypt/blindIndex), KeyProvider/EnvKeyProvider, schema shell + enums, PrismaClient singleton, integration harness config"
  provides:
    - "Full Prisma schema: 16 domain models + 12 CMI master tables + User/Account + audit_logs + idempotency_keys"
    - "Initial committed migration (20260607033936_init_data_layer)"
    - "AuditService.recordAudit() writing audit_logs row in caller transaction (SEC-03)"
    - "customer.repo.ts: encrypt PII + blind-index + audit-in-transaction (createCustomer, findCustomerByNationalId, readCustomerPii)"
    - "identity-document.repo.ts: analogous repo for IdentityDocument"
    - "test/db-harness.ts: createTestDb, deployTestSchema, truncateAll helpers"
    - "prisma/seed.ts: idempotent upsert of CMI inline reference data"
    - "27 integration tests green against local Postgres"
  affects:
    - "02-03: gitleaks CI gate (schema/repos are the codebase surface to scan)"
    - "Phase 4: Order state transition wiring (Order.state column exists)"
    - "Phase 7: User/Account/Role schema ready (no logic yet)"
tech_stack:
  added:
    - "prisma/seed.ts using tsx with explicit .env loading (Pitfall 1 prevention)"
    - "db-harness.ts integration isolation helpers"
  patterns:
    - "Repository-based audit (not Prisma $extends/middleware) — caller-supplied ActorContext, atomic with data op"
    - "CryptoService envelope String for PII at rest (Customer.nationalId/passportNumber, IdentityDocument.documentNumber/documentRef, Vehicle.chassisNumber/engineNumber)"
    - "HMAC-SHA256 blind-index companions (@unique) for equality lookup without decryption"
    - "Decimal @db.Decimal(18,4/8) for all money/rate columns — zero Float/Double"
    - "Prisma $transaction callback pattern — audit row committed atomically with data op"
    - "fileParallelism: false (Vitest 4 API) for serial file execution in integration suite"
    - "Upsert on natural code for idempotent seed (CMI reference tables)"
    - "Parent-first seed ordering for FK hierarchies (provinces → districts → subdistricts, brands → models)"
key_files:
  created:
    - "apps/web/prisma/schema.prisma (extended with all models)"
    - "apps/web/prisma/migrations/20260607033936_init_data_layer/migration.sql"
    - "apps/web/prisma/migrations/migration_lock.toml"
    - "apps/web/prisma/seed.ts"
    - "apps/web/src/server/audit/audit.service.ts"
    - "apps/web/src/server/modules/customer/customer.repo.ts"
    - "apps/web/src/server/modules/identity-document/identity-document.repo.ts"
    - "apps/web/src/server/modules/customer/customer.repo.int.spec.ts"
    - "apps/web/src/server/audit/audit.int.spec.ts"
    - "apps/web/src/server/db/schema.int.spec.ts"
    - "apps/web/src/server/db/seed.int.spec.ts"
    - "apps/web/src/test/db-harness.ts"
  modified:
    - "apps/web/package.json (+ db:migrate:deploy script, prisma.seed config)"
    - "vitest.integration.config.ts (poolOptions → fileParallelism: false, Vitest 4 migration)"
    - "vitest.config.ts (+ exclude *.int.spec.ts from unit run)"
decisions:
  - "Repository-based audit (not $extends/middleware): caller supplies ActorContext, audit row in same $transaction as data op — atomic rollback proven by integration test"
  - "fileParallelism: false (Vitest 4) instead of poolOptions.forks.singleFork (removed in Vitest 4) — prevents concurrent DB access across test files"
  - "beforeEach(truncateAll) pattern for isolation: each test starts with clean DB state regardless of prior file execution order"
  - "[DATA] flag for bulk CMI imports (77 provinces/districts/subdistricts, full nationalities, all brands/models) — inline-seed covers spec examples only"
  - "deployTestSchema() uses execSync against DATABASE_URL (TEST_DATABASE_URL remapped by vitest config) — no separate migration step required in tests"
metrics:
  duration: "~45 minutes"
  completed_date: "2026-06-07"
  tasks_completed: 3
  tests_added: 27
  total_tests: 175
---

# Phase 02 Plan 02: Full Schema + [BLOCKING] Migration + Audit Spine + Seed Summary

**One-liner:** Full Prisma schema (16 domain + 12 CMI master + 4 operational models) committed via `prisma migrate dev`, PII encrypted at rest (AES-256-GCM) with HMAC-SHA256 blind-index lookup, every PII access audit-logged in the same transaction, and CMI reference data seeded idempotently — all proven by 27 integration tests against local Postgres.

## What Was Built

### Task 1: Full Prisma Schema + [BLOCKING] Initial Migration (commit 9e9f7ba)

Extended `apps/web/prisma/schema.prisma` with all domain models (glossary-exact names), CMI master tables, and operational tables:

**Domain models (16):** Lead, Customer, Vehicle, IdentityDocument, OcrResult, Order, Invoice, PaymentAttempt, Payment, Certificate, Renewal, Partner, Commission, Premium, FxQuote, User/Account.

**PII columns (encrypted envelope String):**
- `Customer.nationalId` + `nationalIdIdx @unique` (HMAC blind index)
- `Customer.passportNumber` + `passportNumberIdx @unique`
- `IdentityDocument.documentNumber` + `documentNumberIdx @unique`
- `IdentityDocument.documentRef`
- `Vehicle.chassisNumber` + `chassisNumberIdx @unique`
- `Vehicle.engineNumber`

**Money columns (all Decimal — zero Float/Double):**
- `Premium.amount`, `Invoice.total`, `Payment.amount`, `Commission.amount`
- `FxQuote.sourceRate/markup/resultRate/fromAmount/toAmount`

**Consent capture:** `Customer.consentAt DateTime?`, `Customer.consentVersion String?`

**Auth (schema only):** `User` with `role Role @default(CUSTOMER)`, `passwordHash String?` modelled but unused until Phase 7. `Account` with `@@unique([provider, providerAccountId])`.

**Operational:** `AuditLog @@map("audit_logs")` + `@@index([subjectType, subjectId])`, `IdempotencyKey @@map("idempotency_keys")` + `@@unique([provider, eventId])`.

**12 CMI master tables:** insurance_companies, cmi_policy_types, master_title_names, master_card_types, master_nationalities, master_provinces, master_districts, master_subdistricts, master_car_brands, master_car_models, master_car_colors, master_vehicle_types. Hierarchy FKs with `onDelete: Restrict` (districts→provinces, subdistricts→districts, models→brands).

Migration `20260607033936_init_data_layer` applied. `prisma migrate status` reports clean.

### Task 2: AuditService + Customer/IdentityDocument Repos — Integration Green (commit 314fb6c)

**`audit.service.ts`:** `recordAudit(tx, ctx, params)` writes one `audit_logs` row using the caller's Prisma transaction client. Repository-based, NOT `$extends`/middleware (anti-pattern).

**`customer.repo.ts`** (all methods run inside `db.$transaction`):
- `createCustomer`: encrypt nationalId (kind="id") + passportNumber (kind="text"), compute blind indexes, persist, record CREATE audit.
- `findCustomerByNationalId`: compute `blindIndex(raw, "id")`, query `nationalIdIdx` without decryption, record READ audit if found.
- `readCustomerPii`: load customer, decrypt nationalId/passportNumber ONLY inside this module, record READ audit. Cleartext never returned outside this module.

**`identity-document.repo.ts`:** Analogous pattern (documentNumber/documentRef encrypted, documentNumberIdx blind index, audit on create/read).

**`test/db-harness.ts`:** `createTestDb()`, `deployTestSchema()` (execSync prisma migrate deploy), `truncateAll()` (TRUNCATE ... RESTART IDENTITY CASCADE).

**Integration tests (23):**
- customer.repo.int.spec.ts: 10 tests — envelope storage, round-trip decrypt, blind-index lookup, @unique enforcement, audit row per operation.
- audit.int.spec.ts: 3 tests — CREATE audit row correctness, READ audit row, rollback atomicity (neither data nor audit row persists after transaction failure).
- schema.int.spec.ts: 10 tests — User/Account/Role, 4 roles, Order.state, AuditLog, IdempotencyKey.

**Deviation [Rule 3 - Blocking]:** `poolOptions.forks.singleFork` was removed in Vitest 4. Using the deprecated config caused test files to run concurrently — `beforeEach(truncateAll)` in one file wiped data mid-test in another file. Fixed by switching to `fileParallelism: false` (Vitest 4 top-level API).

### Task 3: Idempotent Seed + Seed Integration Tests (commit 2dd6337)

**`prisma/seed.ts`:** Explicit `.env` loading (Prisma 7 does not auto-load), upsert keyed on natural `code`, parent-first ordering for FK hierarchies.

**Inline data (from CMI-SPEC.md):**
- `master_title_names`: 6 rows (codes 5, 6, 7, 8, 258, 262)
- `master_card_types`: 5 rows (codes 1–5)
- `master_car_colors`: 23 rows (codes 1–999)
- `master_vehicle_types`: 3 rows (1.10, 1.20A, 1.40A)
- `cmi_policy_types`: 2 rows (NEW, RENEWAL)
- `insurance_companies`: 3 example rows
- `master_nationalities`: 10 example rows

**[DATA] follow-up comments in seed.ts:**
- Full ISO-3166 Alpha-3 nationality list (~250 rows)
- All 77 Thai provinces + districts + subdistricts + postal codes
- Full car brand/model lists

**Seed integration tests (4):** row counts verified, idempotency (double-run = same counts), FK hierarchy integrity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest 4 removed `poolOptions.forks.singleFork` API**
- **Found during:** Task 2 — integration tests were failing intermittently because `beforeEach(truncateAll)` in one file's test ran concurrently with a test body in another file, wiping its data.
- **Issue:** `vitest.integration.config.ts` from Plan 02-01 used `poolOptions: { forks: { singleFork: true } }` (Vitest 3 API). Vitest 4 removed `poolOptions` — tests were running with default parallelism (concurrent files in separate forks but sharing the DB).
- **Fix:** Replaced `poolOptions` with `fileParallelism: false` (Vitest 4 top-level option). This forces strictly sequential file execution, preventing concurrent DB access.
- **Files modified:** `vitest.integration.config.ts`
- **Commit:** 314fb6c

**2. [Rule 2 - Missing] Unit test config missing integration test exclusion**
- **Found during:** Task 3 — `pnpm test` (unit run) was trying to execute `*.int.spec.ts` files, which throw at module load time because `DATABASE_URL` is not set in the unit environment.
- **Fix:** Added `exclude: ["apps/web/src/**/*.int.spec.ts"]` to `vitest.config.ts`.
- **Files modified:** `vitest.config.ts`
- **Commit:** 2dd6337

**3. [Rule 3 - Blocking] Prisma client was stale (no models) after schema extension**
- **Found during:** Task 2 — first test run failed with `tx.customer is undefined`. The generated client from Plan 02-01 had no models (`runtimeDataModel: {models: {}, ...}` in the compiled class).
- **Fix:** Ran `pnpm --filter @super-care/web exec prisma generate` after extending the schema. Client regenerated with all 31 models.
- **Files modified:** `apps/web/src/generated/prisma/` (generated artifact, gitignored)

## Known Stubs

None. All artifacts are fully wired:
- CryptoService encrypt/decrypt/blindIndex are real implementations (from Plan 02-01)
- Repositories use the real DB (not mocks)
- Seed data is real reference data from CMI-SPEC.md
- The `[DATA]` bulk imports are explicitly flagged in seed.ts comments — they are acknowledged missing data, not code stubs that prevent the plan's goal.

## Threat Flags

No new threat surfaces introduced beyond what the plan's threat model covers:
- T-02-06 (audit atomicity): mitigated — rollback test proves both data and audit rows are absent after a failure.
- T-02-07 (PII plaintext): mitigated — integration test asserts stored column is an envelope, not cleartext.
- T-02-08 (equality leakage): mitigated — HMAC with separate INDEX_KEY; @unique enforced.
- T-02-10 (float drift): mitigated — zero Float/Double columns on money fields; grep confirms.
- T-02-11 (secrets in migration): migration SQL contains no keys or connection strings.

## Test Results

```
pnpm typecheck  → clean (0 errors)
pnpm lint       → clean (0 warnings)
pnpm test       → 148 tests passed (13 test files, unit only, no DB)

pnpm test:int   → 27 tests passed (4 test files, integration against super_care_test)
  schema.int.spec.ts:   10 tests (User/Account/Role, Order.state, AuditLog, IdempotencyKey)
  audit.int.spec.ts:     3 tests (PII create audit, PII read audit, rollback atomicity)
  customer.repo.int.spec.ts: 10 tests (envelope, decrypt, blind-index, @unique, audit rows)
  seed.int.spec.ts:      4 tests (row counts, idempotency, FK hierarchies)

prisma migrate status → "Database schema is up to date!" (1 migration applied)
```

## Self-Check: PASSED

Files verified:
- apps/web/prisma/schema.prisma: contains model Customer, model AuditLog @@map("audit_logs"), model IdempotencyKey @@unique([provider,eventId]), all 12 CMI master models
- apps/web/prisma/migrations/20260607033936_init_data_layer/migration.sql: exists
- apps/web/src/server/audit/audit.service.ts: exists, exports recordAudit + ActorContext
- apps/web/src/server/modules/customer/customer.repo.ts: exists, uses ActorContext, calls recordAudit in $transaction
- apps/web/src/server/modules/identity-document/identity-document.repo.ts: exists
- apps/web/prisma/seed.ts: exists, uses upsert on natural code, [DATA] comments present
- apps/web/src/test/db-harness.ts: exists, exports createTestDb/deployTestSchema/truncateAll

Commits verified:
- 9e9f7ba: feat(02-02) full Prisma schema + [BLOCKING] initial migration
- 314fb6c: feat(02-02) AuditService + Customer/IdentityDocument repos — integration green
- 2dd6337: feat(02-02) idempotent reference-data seed + seed integration tests

Anti-pattern checks:
- `grep -rn "$extends|$use" apps/web/src/server/audit apps/web/src/server/modules` → only comments/type definitions, no actual calls
- `grep -E "Float|Double" apps/web/prisma/schema.prisma | grep -E "amount|rate|total"` → returns only doc comments, no column definitions
