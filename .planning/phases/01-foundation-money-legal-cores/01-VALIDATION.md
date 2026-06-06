---
phase: 1
slug: foundation-money-legal-cores
status: draft
nyquist_compliant: false
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
| **Config file** | `packages/shared/vitest.config.ts` (Wave 0 installs) |
| **Quick run command** | `pnpm --filter @super-care/shared test` |
| **Full suite command** | `pnpm -r test && pnpm -r typecheck && pnpm -r lint` |
| **Estimated runtime** | ~5–15 seconds (pure unit tests, no I/O) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @super-care/shared test`
- **After every plan wave:** Run the full suite (`pnpm -r test && pnpm -r typecheck && pnpm -r lint`)
- **Before `/gsd:verify-work`:** Full suite must be green and CI must pass
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

> Populated by the planner/executor as tasks are created. Every money/legal requirement
> below maps to a TDD unit-test task (RED before GREEN).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | — | — | FX-02/03 | — | FX ceil + direction rule, no float | unit | `pnpm --filter @super-care/shared test fx` | ❌ W0 | ⬜ pending |
| (planner fills) | — | — | CUST-05 | — | Thai-ID checksum incl. check-digit-0 | unit | `pnpm --filter @super-care/shared test id` | ❌ W0 | ⬜ pending |
| (planner fills) | — | — | ORD-02 | — | illegal transitions throw; refund reachable | unit | `pnpm --filter @super-care/shared test order` | ❌ W0 | ⬜ pending |
| (planner fills) | — | — | COMM-01/02 | — | tier boundaries both sides | unit | `pnpm --filter @super-care/shared test commission` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Monorepo scaffold (`pnpm-workspace.yaml`, root `package.json`, `apps/api`, `apps/web`, `packages/shared`) + strict tsconfig base + project references
- [ ] Vitest installed and configured in `packages/shared` (`vitest.config.ts`)
- [ ] ESLint flat config + typescript-eslint (`any` banned) + Prettier
- [ ] CI workflow (GitHub Actions) running install + typecheck + lint + test, red on failure
- [ ] Test stub files for: `fx`, identifier validators (`thai-id`, `passport`, `plate/chassis/engine`), `premium`, `order state machine`, `commission`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI gate goes red on a failing test | PLAT-04 | Requires observing CI run on a pushed branch | Push a branch with a deliberately failing test; confirm the CI check fails and blocks merge |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (CI runs `vitest run`, not `vitest`)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
