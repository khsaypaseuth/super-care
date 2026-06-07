---
phase: 2
slug: encrypted-data-layer-audit-spine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract. Phase 2 splits into **unit** (crypto/HMAC — no DB, keys injected)
> and **integration** (Prisma migrations, blind-index lookup, audit-on-access — needs Postgres).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (TS-native) — established in Phase 1 |
| **Config file** | existing root `vitest.config.ts` (+ integration project/setup added Wave 0) |
| **Quick run command** | `pnpm exec vitest run <area>` (unit: crypto, hmac) |
| **Full suite command** | `pnpm typecheck && pnpm lint && pnpm test` (integration requires `DATABASE_URL`) |
| **Estimated runtime** | unit ~5s; integration ~10–30s (migrate + queries against local Postgres) |

---

## Sampling Rate

- **After every task commit:** run the unit tests for the touched area
- **After every plan wave:** full suite (unit + integration against the test Postgres)
- **Before `/gsd:verify-work`:** full suite green + CI green (CI runs migrations against a PG service container)
- **Max feedback latency:** ~30s

---

## Per-Task Verification Map

| Task ID | Plan | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | — | SEC-01 | AES-256-GCM round-trip; ciphertext ≠ plaintext; wrong key fails auth tag | unit | `pnpm exec vitest run crypto` | ❌ W0 | ⬜ pending |
| (planner fills) | — | SEC-01 | HMAC blind index deterministic + enables equality lookup without decrypt | unit+integration | `pnpm exec vitest run blind-index` | ❌ W0 | ⬜ pending |
| (planner fills) | — | SEC-03 | every PII read/write writes an audit_logs row in the same transaction | integration | `pnpm exec vitest run audit` | ❌ W0 | ⬜ pending |
| (planner fills) | — | SEC-02 | gitleaks fails CI on a planted secret; secrets resolve from env | CI | gitleaks step in ci.yml | ❌ W0 | ⬜ pending |
| (planner fills) | — | CMI-01 | master tables migrate + seed (titles/card types/colors/vehicle types) | integration | `pnpm exec vitest run seed` | ❌ W0 | ⬜ pending |
| (planner fills) | — | AUTH(schema) | User/Account/Role tables migrate with 4 roles; OrderState enum mirrors packages/shared | integration | `pnpm exec vitest run schema` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Prisma installed; `apps/web/prisma/schema.prisma` + Prisma 7 `prisma-client` generator (explicit ESM output) wired into build
- [ ] Test `DATABASE_URL` (local Postgres) + an integration test harness (migrate → run → truncate/reset) — Vitest integration project/setup
- [ ] `CryptoService` + `KeyProvider` + blind-index test stubs (RED-first); test keys injected (no env dependency for unit)
- [ ] gitleaks step added to ci.yml + CI Postgres service container for integration tests
- [ ] `.env.example` documenting `DATABASE_URL`, `MASTER_KEY_V1`, `INDEX_KEY` (real values are USER SETUP, see USER-SETUP.md)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Env secrets provisioned on Hostinger | SEC-02 | Deployment-time, not testable in CI | At deploy, confirm `MASTER_KEY_V1`/`INDEX_KEY`/`DATABASE_URL` are set as VPS secrets, absent from the repo |
| gitleaks blocks a real planted secret in CI | SEC-02 | Observe the CI run | Push a branch with a fake secret; confirm the gitleaks step turns the check red |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (incl. test Postgres + integration harness)
- [ ] No watch-mode flags (CI runs `vitest run`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
