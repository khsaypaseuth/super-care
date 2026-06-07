---
phase: 01-foundation-money-legal-cores
plan: 01
subsystem: infra
tags: [pnpm, typescript, vitest, eslint, zod, prettier, github-actions, monorepo]

requires: []
provides:
  - pnpm-workspace monorepo (apps/web Next.js shell + packages/shared) with TS project references
  - strict TypeScript base config (noImplicitAny, composite, NodeNext) with `any` banned via lint
  - ESLint flat config + Prettier + Vitest (run mode, v8 coverage)
  - "@super-care/shared package with 9 reserved export subpaths for Wave 1 cores"
  - Zod boundary-schema pattern (fxQuoteSchema) that rejects JS-number money
  - GitHub Actions CI gate (typecheck + lint + test, red on failure — verified on GitHub)
affects: [01-02, 01-03, 01-04, phase-2-data-layer, all-later-phases]

tech-stack:
  added: [typescript@6, vitest@4, "@vitest/coverage-v8", eslint@10, typescript-eslint@8, prettier@3, zod@4, big.js (reserved for 01-02)]
  patterns: [pnpm-workspaces-with-project-references, zod-boundary-validation, decimal-money-no-float, ci-gate-red-on-failure]

key-files:
  created:
    - pnpm-workspace.yaml
    - tsconfig.base.json
    - tsconfig.json
    - eslint.config.mjs
    - vitest.config.ts
    - .github/workflows/ci.yml
    - packages/shared/package.json
    - packages/shared/src/schemas/fx-quote.schema.ts
    - packages/shared/src/schemas/fx-quote.spec.ts
    - packages/shared/src/types/index.ts
    - apps/web/package.json
  modified:
    - .gitignore

key-decisions:
  - "Backend = Next.js + Prisma (no NestJS); apps/web only, no apps/api (per 2026-06-07 architecture decision)"
  - "Plain pnpm workspaces + TS project references (no Turborepo/Nx)"
  - "Money never float — Zod boundary rejects JS-number money fields (Decimal/big.js only)"
  - "tsc -b is the canonical typecheck for project-reference repos"

patterns-established:
  - "Pattern 1: @super-care/shared exposes pure logic via reserved export subpaths; apps consume via workspace:* "
  - "Pattern 2: Zod schema at every untrusted boundary; money fields are decimal-safe strings, never z.number"
  - "Pattern 3: CI runs typecheck + lint + test as separate failing steps (red blocks merge)"

requirements-completed: [PLAT-01, PLAT-02, PLAT-04]

duration: ~7min
completed: 2026-06-07
---

# Phase 1 / Plan 01: Foundation Scaffold Summary

**pnpm-workspace monorepo (Next.js + packages/shared) with strict TS, `any` banned, Vitest, the Zod float-money-rejecting boundary pattern, and a GitHub Actions CI gate proven to go red on failure**

## Performance

- **Duration:** ~7 min
- **Tasks:** 3 automated + 1 human-verify checkpoint (approved)
- **Files modified:** 19 (+ pnpm-lock.yaml)

## Accomplishments
- pnpm workspace with `apps/web` (Next.js shell) + `packages/shared`, wired via TypeScript project references; `pnpm typecheck/lint/test` all green.
- Strict TS base (`noImplicitAny`, `composite`, `NodeNext`); ESLint flat config sets `@typescript-eslint/no-explicit-any: error` (a planted `: any` fails lint).
- `@super-care/shared` exports map reserves the nine Wave-1 subpaths (`.`, `./money`, `./fx`, `./premium`, `./commission`, `./order`, `./validators`, `./schemas`, `./types`).
- Zod `fxQuoteSchema` boundary pattern established and tested — **rejects JS-number money fields** (6/6 specs: 2 valid parses + 4 rejections).
- GitHub Actions CI gate (typecheck + lint + test as separate failing steps), **verified live: `main` green, a planted failing branch turned the check red** (PLAT-04).

## Task Commits

1. **Task 1: Scaffold workspace, strict-TS project refs, Next.js app shell** — `a2510af` (feat)
2. **Task 2: ESLint (ban any) + Prettier + Vitest + Zod boundary schema** — `4908e67` (feat, TDD)
3. **Task 3: GitHub Actions CI gate** — `6f4b1c6` (feat)
4. **Task 4: Human-verify checkpoint (CI red-on-failure)** — approved 2026-06-07 (main green, throwaway `ci-red-test` branch red, then deleted)

State checkpoint commit: `9ccfcf6`.

## Files Created/Modified
- `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `tsconfig.json` — workspace + strict TS spine
- `eslint.config.mjs`, `.prettierrc`, `vitest.config.ts` — quality tooling
- `.github/workflows/ci.yml` — CI gate
- `packages/shared/*` — `@super-care/shared` skeleton, `types/index.ts` (Currency/Market), Zod `fx-quote` schema + spec
- `apps/web/*` — Next.js app TS shell (no runtime yet)
- `.gitignore` — build/coverage/env/prisma ignores

## Decisions Made
- Retargeted from the original NestJS+Next monorepo to **Next.js + Prisma, no NestJS** (architecture decision 2026-06-07). Dropped `apps/api`; API will be Next.js route handlers / server actions in later phases.
- Otherwise followed the plan as written.

## Deviations from Plan
None beyond the pre-approved architecture retarget (apps/api removed before execution; plan + CONTEXT already updated to match).

## Issues Encountered
None.

## User Setup Required
None — no external service configuration in Phase 1.

## Next Phase Readiness
- Wave 1 (plans 01-02 money/FX/premium, 01-03 validators, 01-04 order machine + commission) can proceed — each only adds files under `packages/shared/src/<domain>/`, all subpaths reserved.
- CI gate is live and blocks on failure.

---
*Phase: 01-foundation-money-legal-cores*
*Completed: 2026-06-07*
