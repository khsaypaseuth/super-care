---
phase: 02-encrypted-data-layer-audit-spine
plan: "01"
subsystem: persistence-crypto-foundation
tags:
  - prisma
  - aes-256-gcm
  - hmac-blind-index
  - tdd
  - key-provider
dependency_graph:
  requires:
    - "01-01: packages/shared types (Currency, Market, OrderState)"
    - "01-04: order.machine.ts TRANSITIONS keys (12 OrderState values)"
  provides:
    - "Prisma 7 schema shell with enums (Market, Currency, Role, OrderState)"
    - "CryptoService AES-256-GCM encrypt/decrypt behind KeyProvider seam"
    - "EnvKeyProvider reading MASTER_KEY_V{n}/INDEX_KEY from env"
    - "HMAC-SHA256 blindIndex with normalizeIdentifier (id/text rules)"
    - "ORDER_STATES canonical tuple + OrderStateValue type in packages/shared"
    - "OrderState drift guard test (machine ↔ tuple ↔ schema)"
    - "Vitest integration project config (separate from DB-free unit run)"
    - "HMR-safe PrismaClient singleton (PrismaPg adapter)"
    - ".env.example with DATABASE_URL/MASTER_KEY_V1/INDEX_KEY placeholders"
    - "USER-SETUP.md: DB creation + key gen + migration instructions"
  affects:
    - "02-02: domain models, migration, repositories (depends on schema shell and crypto)"
    - "All phases: every PII field at rest uses CryptoService.encrypt/blindIndex"
tech_stack:
  added:
    - "prisma@7.8.0 (CLI dev dep in apps/web)"
    - "@prisma/client@7.8.0 (runtime dep in apps/web)"
    - "@prisma/adapter-pg@7.8.0 (Prisma 7 driver adapter)"
    - "pg@8.21.0 (PostgreSQL Node.js client)"
    - "tsx@^4.22.4 (TS seed runner dev dep)"
    - "@types/node in apps/web and packages/shared tsconfig"
  patterns:
    - "Prisma 7 prisma-client generator with explicit ESM output (apps/web/src/generated/prisma)"
    - "prisma.config.ts datasource config (Prisma 7 model — URL in config, not schema.prisma)"
    - "PrismaPg driver adapter for Postgres connection"
    - "KeyProvider seam (constructor injection) — env now, KMS later"
    - "AES-256-GCM envelope: v{n}:{ivB64}:{tagB64}:{ctB64}"
    - "HMAC-SHA256 blind index with normalizeIdentifier (single normalization function)"
    - "TDD RED→GREEN→FIX cycle: test(02-01) commits then feat(02-01) commits"
key_files:
  created:
    - "apps/web/prisma/schema.prisma"
    - "apps/web/prisma.config.ts"
    - "apps/web/src/server/db/client.ts"
    - "apps/web/src/server/crypto/key-provider.ts"
    - "apps/web/src/server/crypto/env-key-provider.ts"
    - "apps/web/src/server/crypto/normalize-identifier.ts"
    - "apps/web/src/server/crypto/crypto.service.ts"
    - "apps/web/src/server/crypto/crypto.service.spec.ts"
    - "packages/shared/src/order/order-states.ts"
    - "packages/shared/src/order/order-states.spec.ts"
    - "vitest.integration.config.ts"
    - ".env.example"
    - ".planning/phases/02-encrypted-data-layer-audit-spine/USER-SETUP.md"
  modified:
    - "apps/web/package.json (+ @prisma/client, @prisma/adapter-pg, pg, prisma dev, tsx, db:* scripts)"
    - "apps/web/tsconfig.json (+ types: [node])"
    - "packages/shared/src/order/index.ts (+ ORDER_STATES re-export)"
    - "packages/shared/tsconfig.json (+ types: [node])"
    - "vitest.config.ts (+ apps/web/src/**/*.spec.ts include)"
    - "package.json (+ pnpm.onlyBuiltDependencies, test:int script)"
    - ".gitignore (+ apps/web/src/generated/)"
decisions:
  - "Prisma 7.8.0 uses prisma-client generator with required explicit output path (not prisma-client-js)"
  - "Datasource URL moved to prisma.config.ts (Prisma 7 requirement) — no url in schema.prisma"
  - "PrismaPg driver adapter required by Prisma 7 for PostgreSQL connections"
  - "prisma.config.ts uses process.env['DATABASE_URL'] directly (not env() helper) so generate works without DB"
  - "normalizeIdentifier: 'id' kind = digits-only (Thai ID); 'text' kind = trim+strip+upper (passport/chassis)"
  - "ORDER_STATES drift test reads schema.prisma as text — no generated client import into packages/shared (purity preserved)"
  - "Integration tests target *.int.spec.ts (separate from *.spec.ts unit glob — no accidental DB inclusion)"
metrics:
  duration: "~11 minutes"
  completed_date: "2026-06-07"
  tasks_completed: 3
  tests_added: 14
  total_tests: 148
---

# Phase 02 Plan 01: Prisma 7 Foundation + CryptoService + Drift Guard Summary

**One-liner:** Prisma 7 with prisma-client ESM generator + AES-256-GCM CryptoService behind KeyProvider seam + HMAC-SHA256 blind index + OrderState drift guard, all TDD, zero secrets in code.

## What Was Built

### Task 1: Prisma 7 + Schema Shell + PrismaClient Singleton (commit 1bd2d1b)

Installed Prisma 7.8.0 into `apps/web` only (packages/shared stays pure). Created:

- `apps/web/prisma/schema.prisma`: Prisma 7 `prisma-client` generator with `output = "../src/generated/prisma"` and `moduleFormat = "esm"`. Datasource has no `url` (moved to `prisma.config.ts` per Prisma 7 requirement). Four enums: `Market`, `Currency`, `Role`, and `OrderState` (12 states verbatim from order.machine.ts).

- `apps/web/prisma.config.ts`: New Prisma 7 config file. Datasource URL from `process.env["DATABASE_URL"]` (using direct env access, not the `env()` helper, so `prisma generate` can run without DATABASE_URL during postinstall).

- `apps/web/src/server/db/client.ts`: HMR-safe PrismaClient singleton using `PrismaPg` driver adapter (required by Prisma 7). Cached on `globalThis` to survive Next.js hot reloads.

- `.gitignore` updated: `apps/web/src/generated/` excluded (build artifact).

**Deviation [Rule 3 - Blocking]:** Prisma 7.8.0 introduces two breaking changes vs 6.x:
  1. Datasource `url` no longer allowed in `schema.prisma` — must go in `prisma.config.ts` using `defineConfig`.
  2. PrismaClient requires a driver adapter (`PrismaPg`) — the constructor is `new PrismaClient({ adapter })`.
  Added `@prisma/adapter-pg@7.8.0` + `pg@8.21.0` to resolve.

### Task 2: CryptoService TDD (RED→GREEN commits 7066222, 288ec59)

Built the custom AES-256-GCM crypto module behind a `KeyProvider` seam:

- `key-provider.ts`: `KeyProvider` interface with `currentKeyVersion()`, `encryptionKey(version)`, `indexKey()`.
- `env-key-provider.ts`: `EnvKeyProvider` reading `MASTER_KEY_V{n}`, `MASTER_KEY_CURRENT`, `INDEX_KEY` from `process.env`. Validates 32-byte length. Throws at call time (fail-fast).
- `normalize-identifier.ts`: Single `normalizeIdentifier(value, kind)` function. `"id"` = digits-only (Thai national ID). `"text"` = trim + strip whitespace/dashes + uppercase (passport/chassis). Same function used at write and query time (Pitfall 2 prevention).
- `crypto.service.ts`: `CryptoService` with:
  - `encrypt(plaintext)` → `v{n}:{ivB64}:{tagB64}:{ctB64}` (12-byte random IV, 16-byte GCM tag)
  - `decrypt(envelope)` → throws on tampered auth tag
  - `blindIndex(value, kind)` → HMAC-SHA256(normalize(value), indexKey) as 64 hex chars

12 unit tests green with injected stub keys (no process.env, no DATABASE_URL).

### Task 3: OrderState Drift Guard + Integration Harness + Env Docs (RED→GREEN commits 4110195, c2d8dd8, 6a2697b)

- `order-states.ts`: `ORDER_STATES` readonly tuple (12 states) + `OrderStateValue` union type. Re-exported from order barrel.
- `order-states.spec.ts`: 2 drift guard tests — ORDER_STATES vs TRANSITIONS keys (set equality), schema.prisma OrderState enum vs ORDER_STATES (file-parsed, no generated client import into packages/shared).
- `vitest.integration.config.ts`: Targets `*.int.spec.ts`, serial execution (`singleFork: true`), 30s timeout, maps `TEST_DATABASE_URL` → `DATABASE_URL` for the test run. NOT included in default `pnpm test`.
- `.env.example`: Documents `DATABASE_URL`, `TEST_DATABASE_URL`, `MASTER_KEY_V1`, `MASTER_KEY_CURRENT`, `INDEX_KEY` as placeholders. No real secrets.
- `USER-SETUP.md`: Step-by-step for creating Postgres databases, generating keys, setting up `.env`, running migrations, and Hostinger VPS deployment key rotation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7.8.0 breaking changes: datasource URL + driver adapter**
- **Found during:** Task 1 — `prisma validate` failed with "datasource property `url` no longer supported in schema files"
- **Issue:** Prisma 7.8.0 (current stable) made two breaking changes vs the RESEARCH.md examples:
  (a) Datasource URL must go in `prisma.config.ts`, not `schema.prisma`.
  (b) `new PrismaClient()` without arguments is invalid — requires `{ adapter: PrismaPg({ connectionString }) }`.
- **Fix:** Created `prisma.config.ts` using `defineConfig({ datasource: { url: process.env["DATABASE_URL"] } })`. Removed url from schema.prisma datasource. Added `@prisma/adapter-pg@7.8.0` + `pg@8.21.0` to apps/web deps. Updated `client.ts` to construct `PrismaPg` adapter.
- **Files modified:** `apps/web/prisma/schema.prisma`, `apps/web/prisma.config.ts` (new), `apps/web/src/server/db/client.ts`, `apps/web/package.json`

**2. [Rule 1 - Bug] MASTER_KEY_CURRENT env var name**
- **Found during:** Task 2 — RESEARCH.md uses `MASTER_KEY_CURRENT` but it doesn't exist in any read_first materials
- **Resolution:** Used `MASTER_KEY_CURRENT` as documented in RESEARCH.md EnvKeyProvider example (consistent throughout)

**3. [Rule 2 - Missing] Node types in packages/shared and apps/web tsconfigs**
- **Found during:** Final typecheck — `node:fs`, `node:path`, `node:url` imports in order-states.spec.ts caused TS2591
- **Fix:** Added `"types": ["node"]` to both `packages/shared/tsconfig.json` and `apps/web/tsconfig.json`

**4. [Rule 1 - Bug] TypeScript Set literal type mismatch in drift spec**
- **Found during:** Typecheck — `EXPECTED_STATES.has(state)` failed because EXPECTED_STATES was `Set<const literals>` and `state` was `string`
- **Fix:** Changed `EXPECTED_STATES` type to `ReadonlySet<string>` instead of `Set<const literals>`

## Known Stubs

None. All plan artifacts are fully wired and functional:
- CryptoService is fully implemented with real AES-256-GCM (not a stub)
- KeyProvider is a real interface with a real EnvKeyProvider implementation
- ORDER_STATES is the canonical tuple (not placeholder data)
- Integration config targets real test pattern (*.int.spec.ts files added in 02-02)

The PrismaClient `db` singleton will throw at runtime if `DATABASE_URL` is not set — this is intentional (fail-fast, not a stub).

## Threat Flags

None. All crypto code is under `apps/web/src/server/**` (server-only). No new network endpoints introduced. No keys in source.

## Test Results

```
pnpm typecheck  → clean (0 errors)
pnpm lint       → clean (0 warnings)
pnpm test       → 148 tests passed (13 test files)
  - 134 from Phase 1 (packages/shared)
  - 12 new: CryptoService (crypto.service.spec.ts)
  - 2 new: OrderState drift guard (order-states.spec.ts)
```

Integration tests (pnpm test:int) require DATABASE_URL — deferred to 02-02.

## Self-Check: PASSED

Files verified:
- apps/web/prisma/schema.prisma: exists, contains enum OrderState with 12 states
- apps/web/prisma.config.ts: exists
- apps/web/src/server/db/client.ts: exists, exports `db`
- apps/web/src/server/crypto/key-provider.ts: exists, exports `KeyProvider` interface
- apps/web/src/server/crypto/env-key-provider.ts: exists, exports `EnvKeyProvider`
- apps/web/src/server/crypto/normalize-identifier.ts: exists, exports `normalizeIdentifier`
- apps/web/src/server/crypto/crypto.service.ts: exists, exports `CryptoService`
- packages/shared/src/order/order-states.ts: exists, exports `ORDER_STATES`
- vitest.integration.config.ts: exists, targets *.int.spec.ts
- .env.example: exists, no real secrets
- .planning/phases/02-encrypted-data-layer-audit-spine/USER-SETUP.md: exists

Commits verified:
- 1bd2d1b: feat(02-01) Prisma 7 install
- 7066222: test(02-01) RED crypto tests
- 288ec59: feat(02-01) GREEN crypto impl
- 4110195: test(02-01) RED drift tests
- c2d8dd8: feat(02-01) GREEN drift + env docs
- 6a2697b: fix(02-01) node types + Set literal fix
