---
phase: 03-identity-vehicle-capture-fakes
plan: 03
subsystem: api
tags: [ocr, mapper, storage, adapters, encryption, ports, fake-adapters, path-traversal, aes-256-gcm]

# Dependency graph
requires:
  - phase: 03-02
    provides: CryptoService (AES-256-GCM), KeyProvider interface, EnvKeyProvider
  - phase: 03-01
    provides: packages/shared identifier validators (structurally excluded from mapper)

provides:
  - OcrModule port interface + OcrResultRaw Zod schema (shape-only, no normalization)
  - FakeOcrAdapter returning canned raw reg-book dataset (Toyota/Camry/กรุงเทพมหานคร/ขาว; leading whitespace preserved)
  - MapperProvider port interface (ranked suggestions only, never auto-commit)
  - FakeMapperAdapter with hand-rolled normalized Levenshtein ranking (no @super-care/shared/validators import — structural test asserts)
  - StorageProvider port interface (put/get/delete with path-traversal guard contract)
  - LocalFsStorageAdapter (AES-256-GCM encrypted at rest via CryptoService; server-generated UUID refs; double path-traversal guard; .uploads gitignored)
  - registry.ts with import "server-only" selecting providers via OCR_PROVIDER/MAPPER_PROVIDER/STORAGE_PROVIDER env
  - apps/web/.env.example with OCR_PROVIDER, MAPPER_PROVIDER, STORAGE_PROVIDER, UPLOAD_DIR

affects:
  - 03-04+ (intake service wires these adapters)
  - 03-05+ (wizard UI calls registry.getOcrModule/getMapperProvider/getStorageProvider)
  - Phase 10 (real Google Document AI, LLM mapper, S3 adapters drop in via registry env swap)

# Tech tracking
tech-stack:
  added:
    - "zod@4.4.3 added to apps/web dependencies (was only in packages/shared)"
  patterns:
    - "Port + adapter pattern: interface in *.port.ts, fake in fake-*.adapter.ts, real adapter drops in at Phase 10"
    - "Encrypted local storage: base64(bytes) → CryptoService.encrypt() → .enc sidecar file; .mime sidecar for MIME"
    - "Double path-traversal guard: ref-level check (contains '..' or starts with '/') + resolved-path containment assertion"
    - "Structural test: readFileSync the adapter source to assert no import from validators barrel (CMI-04)"
    - "Hand-rolled Levenshtein: Wagner-Fischer DP with bilingual scoring (EN label + Thai labelTh, take min)"
    - "ESLint argsIgnorePattern/varsIgnorePattern '^_' for intentionally unused underscore-prefixed parameters"

key-files:
  created:
    - "apps/web/src/server/adapters/ocr/ocr.port.ts"
    - "apps/web/src/server/adapters/ocr/fixtures/regbook.ts"
    - "apps/web/src/server/adapters/ocr/fake-ocr.adapter.ts"
    - "apps/web/src/server/adapters/ocr/fake-ocr.adapter.spec.ts"
    - "apps/web/src/server/adapters/mapper/mapper.port.ts"
    - "apps/web/src/server/adapters/mapper/fake-mapper.adapter.ts"
    - "apps/web/src/server/adapters/mapper/fake-mapper.adapter.spec.ts"
    - "apps/web/src/server/adapters/storage/storage.port.ts"
    - "apps/web/src/server/adapters/storage/localfs-storage.adapter.ts"
    - "apps/web/src/server/adapters/storage/localfs-storage.adapter.spec.ts"
    - "apps/web/src/server/adapters/registry.ts"
    - "apps/web/.env.example"
  modified:
    - "apps/web/package.json (added zod dependency)"
    - "eslint.config.mjs (added argsIgnorePattern/varsIgnorePattern for underscore-prefixed vars)"
    - "packages/shared/src/schemas/fx-quote.spec.ts (removed now-redundant eslint-disable comment)"

key-decisions:
  - "Hand-rolled Levenshtein (no external dep) instead of fastest-levenshtein — keeps zero new runtime deps in regulated PII app; fake/deterministic anyway"
  - "crypto.randomUUID() (Node built-in, Node 22) for ref generation — no cuid package needed; UUID v4 is collision-safe"
  - "Base64-encode bytes then pass to CryptoService.encrypt(string) — avoids extending CryptoService with encryptBuffer; keeps the single string-based encrypt/decrypt seam"
  - ".enc + .mime sidecar file pair — stores mime in plaintext (not PII); avoids JSON parsing overhead for binary blobs"
  - "ESLint argsIgnorePattern '^_' added globally — standard TS convention for unused interface-implementation params; removed pre-existing redundant eslint-disable comment in fx-quote.spec.ts"

requirements-completed: [CUST-04, CMI-03, CMI-04, CUST-03]

# Metrics
duration: 20min
completed: 2026-06-07
---

# Phase 03 Plan 03: OCR / Mapper / Storage Ports + Fake Adapters + Registry Summary

**AES-256-GCM encrypted LocalFs storage, verbatim-raw FakeOcrAdapter (canned Thai reg-book dataset), and deterministic bilingual Levenshtein FakeMapperAdapter — all config-selected by env registry with import "server-only", zero validator imports in the mapper (structural test asserts)**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-07T21:07Z
- **Completed:** 2026-06-07T21:17Z
- **Tasks:** 2 of 2
- **Files modified:** 14 (12 created, 2 modified, 2 config updated)

## Accomplishments

- OcrModule port + FakeOcrAdapter: 15 CMI-SPEC fields returned verbatim from canned Thai reg-book fixture; Zod schema validates shape only (no `.trim()`/`.toUpperCase()`); leading whitespace on `ownerName` survives untrimmed (CUST-04/CMI-03 raw contract proven in tests)
- MapperProvider port + FakeMapperAdapter: hand-rolled Wagner-Fischer Levenshtein with bilingual scoring (EN + Thai labelTh, take min); exact normalized match → score 0; structurally cannot import `@super-care/shared/validators` (source-content test asserts this — CMI-04/T-03-09)
- StorageProvider port + LocalFsStorageAdapter: bytes encrypted via `CryptoService.encrypt(base64)` before write; `.enc`+`.mime` sidecar files under UPLOAD_DIR; double path-traversal guard (ref-level + resolved-path containment); refs are server-generated UUIDs, never from user input (T-03-07/T-03-08)
- Registry (`import "server-only"`): `getOcrModule/getMapperProvider/getStorageProvider` config-selected by `OCR_PROVIDER/MAPPER_PROVIDER/STORAGE_PROVIDER` env with clean fallback to fakes; real adapters drop in at Phase 10 with zero consumer changes

## Task Commits

1. **Task 1: OCR + Mapper ports and fake adapters** — `00ec5cd` (feat)
2. **Task 2: Storage port + LocalFs encrypted adapter + registry** — `c49d3c9` (feat)

## Files Created/Modified

- `apps/web/src/server/adapters/ocr/ocr.port.ts` — OcrModule interface + OcrResultRaw type + shape-only Zod schema
- `apps/web/src/server/adapters/ocr/fixtures/regbook.ts` — canned Thai reg-book dataset (seeded master values; leading whitespace on ownerName)
- `apps/web/src/server/adapters/ocr/fake-ocr.adapter.ts` — FakeOcrAdapter returning fixture verbatim
- `apps/web/src/server/adapters/ocr/fake-ocr.adapter.spec.ts` — shape-valid + byte-identical + whitespace survives tests
- `apps/web/src/server/adapters/mapper/mapper.port.ts` — MapperProvider interface (MasterCandidate, Suggestion, map())
- `apps/web/src/server/adapters/mapper/fake-mapper.adapter.ts` — hand-rolled Levenshtein; no validator imports
- `apps/web/src/server/adapters/mapper/fake-mapper.adapter.spec.ts` — ranking tests + structural no-validator-import test
- `apps/web/src/server/adapters/storage/storage.port.ts` — StorageProvider interface with path-traversal guard contract
- `apps/web/src/server/adapters/storage/localfs-storage.adapter.ts` — AES-256-GCM encrypted blobs; UUID refs; double guard
- `apps/web/src/server/adapters/storage/localfs-storage.adapter.spec.ts` — round-trip + encrypted-at-rest + traversal-rejected tests
- `apps/web/src/server/adapters/registry.ts` — server-only provider factory
- `apps/web/.env.example` — OCR_PROVIDER, MAPPER_PROVIDER, STORAGE_PROVIDER, UPLOAD_DIR documented
- `apps/web/package.json` — added zod@4.4.3 as direct dependency
- `eslint.config.mjs` — argsIgnorePattern/varsIgnorePattern for `^_` vars (standard TS convention)
- `packages/shared/src/schemas/fx-quote.spec.ts` — removed now-redundant eslint-disable comment

## Decisions Made

- **Hand-rolled Levenshtein over fastest-levenshtein:** Zero new external runtime deps in a regulated PII app. The fake mapper is deterministic anyway; a 30-line Wagner-Fischer implementation is transparent and auditable.
- **crypto.randomUUID() for ref generation:** Node 22 built-in; no cuid package needed in the workspace. UUID v4 is collision-safe for blob storage refs.
- **base64 → CryptoService.encrypt(string) for bytes:** Avoids extending CryptoService with a new `encryptBuffer` path; keeps the existing string-based envelope format and test coverage intact.
- **`.enc` + `.mime` sidecar pair:** MIME type is not PII, so storing it in plaintext avoids JSON parsing overhead. The `.enc` file is always the ciphertext; `.mime` is always the media type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added zod to apps/web/package.json**
- **Found during:** Task 1 (OCR port — first test run)
- **Issue:** `ocr.port.ts` imports zod but `apps/web/package.json` did not list zod as a direct dependency; pnpm strict hoisting caused "Cannot find package 'zod'" at test time
- **Fix:** Added `"zod": "4.4.3"` to `apps/web/package.json` dependencies; ran `pnpm install` to update lockfile. Zod is already in the workspace (packages/shared uses it) — no new package legitimacy concern.
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Verification:** All 15 OCR + mapper tests pass after fix
- **Committed in:** `00ec5cd` (Task 1 commit)

**2. [Rule 1 - Bug] Removed redundant eslint-disable-next-line in fx-quote.spec.ts**
- **Found during:** Task 2 (lint pass after adding argsIgnorePattern to ESLint config)
- **Issue:** Adding `varsIgnorePattern: "^_"` to the global ESLint rule config made the existing `// eslint-disable-next-line @typescript-eslint/no-unused-vars` in `fx-quote.spec.ts` redundant, causing an "Unused eslint-disable directive" lint warning
- **Fix:** Removed the now-redundant eslint-disable comment (the `_premiumThb` variable is correctly ignored by the updated rule)
- **Files modified:** `packages/shared/src/schemas/fx-quote.spec.ts`
- **Verification:** `pnpm lint` returns exit 0 with zero errors/warnings
- **Committed in:** `c49d3c9` (Task 2 commit)

**3. [Rule 2 - ESLint Config] Added argsIgnorePattern for underscore-prefixed params**
- **Found during:** Task 2 (lint pass)
- **Issue:** `@typescript-eslint/no-unused-vars` at default settings flagged `_file` in FakeOcrAdapter (intentionally unused interface-impl parameter) and `_version` in storage test KeyProvider
- **Fix:** Added `argsIgnorePattern: "^_"` + `varsIgnorePattern: "^_"` to the ESLint global rule config — standard TypeScript convention for intentionally-unused interface/callback parameters
- **Files modified:** `eslint.config.mjs`
- **Verification:** `pnpm lint` returns exit 0
- **Committed in:** `c49d3c9` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical config)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. The ESLint change is a project-wide improvement that enables the standard `_` prefix convention.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Threat Surface Scan

No new threat surface beyond what the plan's threat model covers (T-03-07 through T-03-11). All mitigations applied:
- T-03-07: encrypted at rest (LocalFsStorageAdapter) — mitigated
- T-03-08: path traversal guard (double-check: ref + resolved path) — mitigated
- T-03-09: mapper has no validator dependency (structural test asserts) — mitigated
- T-03-10: registry.ts marked `import "server-only"` — mitigated
- T-03-11: OcrResultRaw Zod schema shape-only, fixture returned verbatim — mitigated

## User Setup Required

None — the adapter config keys (`OCR_PROVIDER`, `MAPPER_PROVIDER`, `STORAGE_PROVIDER`, `UPLOAD_DIR`) are all optional with sensible defaults. See `apps/web/.env.example` for documentation.

## Next Phase Readiness

- All three adapter ports are ready for the intake service to wire up (Plan 03-04+)
- `getOcrModule()`, `getMapperProvider()`, `getStorageProvider()` are callable server-side from any server action or route handler
- Phase 10 real adapters (Google Document AI, LLM mapper, S3) drop in by changing the env var — zero consumer changes required
- The `.uploads` directory is gitignored; encrypted blobs will be created on first `put()` call

---
*Phase: 03-identity-vehicle-capture-fakes*
*Completed: 2026-06-07*
