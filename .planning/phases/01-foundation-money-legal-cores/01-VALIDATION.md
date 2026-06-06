---
phase: 1
slug: foundation-money-legal-cores
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 1 is pure logic + scaffolding: every requirement is provable by fast unit tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (TS-native) |
| **Config file** | `vitest.config.ts` (Wave 0 / plan 01-01 installs) |
| **Quick run command** | `pnpm --filter @super-care/shared exec vitest run src/<area>` |
| **Full suite command** | `pnpm typecheck && pnpm lint && pnpm test` |
| **Estimated runtime** | ~5–15 seconds (pure unit tests, no I/O) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @super-care/shared exec vitest run src/<area>`
- **After every plan wave:** Run the full suite (`pnpm typecheck && pnpm lint && pnpm test`)
- **Before `/gsd:verify-work`:** Full suite must be green and CI must pass
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 0 | PLAT-01 | T-01-01/SC | strict TS, project refs typecheck; no `any` | build | `pnpm typecheck` | ❌ W0 | ⬜ pending |
| 01-01-T2 | 01-01 | 0 | PLAT-01/02 | T-01-01 | `any` banned by lint; Zod boundary rejects float money | lint+unit | `pnpm lint && pnpm --filter @super-care/shared exec vitest run src/schemas` | ❌ W0 | ⬜ pending |
| 01-01-T3 | 01-01 | 0 | PLAT-04 | T-01-02/03 | CI runs typecheck+lint+test, red on failure, no secrets | CI | GitHub Actions `ci.yml` | ❌ W0 | ⬜ pending |
| 01-02-T1 | 01-02 | 1 | PLAT-03 | T-02-03 | Money is Big; no float drift | unit | `pnpm --filter @super-care/shared exec vitest run src/money` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 01-02 | 1 | FX-02/03 | T-02-01/02/04 | FX ceil + direction rule + per-rate markup, no float | unit | `pnpm --filter @super-care/shared exec vitest run src/fx` | ❌ W0 | ⬜ pending |
| 01-02-T3 | 01-02 | 1 | FX-01 | T-02-03 | table-driven Premium → Big; unknown key throws | unit | `pnpm --filter @super-care/shared exec vitest run src/premium` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 01-03 | 1 | CUST-05 | T-03-01/02 | Thai-ID checksum incl. check-digit-0 + I6 trap | unit | `pnpm --filter @super-care/shared exec vitest run src/validators/thai-national-id.spec.ts` | ❌ W0 | ⬜ pending |
| 01-03-T2 | 01-03 | 1 | CUST-06 | T-03-02/03 | passport format; foreign accepted | unit | `pnpm --filter @super-care/shared exec vitest run src/validators/passport.spec.ts` | ❌ W0 | ⬜ pending |
| 01-03-T3 | 01-03 | 1 | VEH-02 | T-03-02/03 | plate (Thai/Lao script) / chassis / engine vectors | unit | `pnpm --filter @super-care/shared exec vitest run src/validators` | ❌ W0 | ⬜ pending |
| 01-04-T1 | 01-04 | 1 | ORD-02 | T-04-01/02 | illegal transitions throw; refund reachable from PAID | unit | `pnpm --filter @super-care/shared exec vitest run src/order` | ❌ W0 | ⬜ pending |
| 01-04-T2 | 01-04 | 1 | COMM-01/02 | T-04-03 | tier ladder on THB base; boundaries both sides | unit | `pnpm --filter @super-care/shared exec vitest run src/commission` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Monorepo scaffold (`pnpm-workspace.yaml`, root `package.json`, `apps/api`, `apps/web`, `packages/shared`) + strict tsconfig base + project references (plan 01-01)
- [ ] Vitest installed and configured (`vitest.config.ts`) (plan 01-01)
- [ ] ESLint flat config + typescript-eslint (`any` banned) + Prettier (plan 01-01)
- [ ] CI workflow (GitHub Actions) running install + typecheck + lint + test, red on failure (plan 01-01)
- [ ] `@super-care/shared` exports map reserving all Wave-1 module subpaths (plan 01-01)
- [ ] Test stub files (RED-first) for: money/fx/premium (01-02), validators (01-03), order/commission (01-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI gate goes red on a failing test | PLAT-04 | Requires observing CI run on a pushed branch | Push a branch with a deliberately failing test; confirm the CI check fails and blocks merge (plan 01-01 human-verify checkpoint) |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (CI runs `vitest run`, not `vitest`)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (2026-06-06)
