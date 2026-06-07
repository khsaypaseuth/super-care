---
phase: 3
slug: identity-vehicle-capture-fakes
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
---

# Phase 3 — Validation Strategy

> First UI phase. Three test tiers: **unit** (no I/O — mapper match, zod schemas, verify-gate
> logic, adapter contracts), **integration** (repos/draft→save vs test Postgres), **e2e**
> (the wizard against a running Next app). Server-side logic is covered without a browser; the
> browser tier covers the wizard happy path + the verify-gate block.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unit/Integration** | Vitest (existing) — `pnpm test` (unit, no DB) + `pnpm test:int` (Postgres) |
| **E2E** | Playwright against `next dev`/built app (Wave 0 installs; browsers cached in CI) |
| **Quick run** | `pnpm exec vitest run <area>` |
| **Full suite** | `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` |
| **Estimated runtime** | unit ~5s; integration ~15–30s; e2e ~30–90s |

---

## Sampling Rate

- **After every task commit:** unit tests for the touched area
- **After every plan wave:** unit + integration; e2e after the wizard wave
- **Before `/gsd:verify-work`:** full suite green; CI green
- **Max feedback latency:** ~30s (unit/integration); e2e on wave boundaries

---

## Per-Task Verification Map

| Task ID | Plan | Requirement | Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|----------|-----------|-------------------|--------|
| (planner) | — | UI-01/PLAT-01 | apps/web runs (`next build` ok); strict TS + lint cover app/ | build | `pnpm --filter @super-care/web build` | ⬜ |
| (planner) | — | CMI-03/CUST-04 | FakeOcr returns a raw, Zod-valid OcrResult (never cleaned) | unit | `pnpm exec vitest run ocr` | ⬜ |
| (planner) | — | CMI-04 | Mapper maps OCR text → ranked master-table suggestions; never validates identifiers | unit | `pnpm exec vitest run mapper` | ⬜ |
| (planner) | — | CUST-05/06, VEH-02 | identifier fields validated by shared validators (client+server) | unit | `pnpm exec vitest run verify` | ⬜ |
| (planner) | — | CUST-07 | final save REJECTS when a required field is unverified (server-enforced) | unit+integration | `pnpm exec vitest run intake` | ⬜ |
| (planner) | — | CUST-01/02/03, VEH-01 | save persists Lead→Customer + IdentityDocument + Vehicle, encrypted + audited in one tx | integration | `pnpm test:int` | ⬜ |
| (planner) | — | CMI-02 | intake start records insurer + new/renewal | integration | `pnpm test:int` | ⬜ |
| (planner) | — | UI-01 | wizard happy path completes; verify-gate blocks continue; mobile layout renders | e2e | `pnpm test:e2e` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Convert `apps/web` to a runnable Next.js App Router app (app/ dir, next.config, `next dev`/`build`),
      reconcile root `tsc -b` project-reference build + ESLint flat-config globs to include `app/`
- [ ] Install + init Tailwind v4 + shadcn/ui (canary CLI) + next-intl (en) + react-hook-form + zod resolver
      — behind a `checkpoint:human-verify` dep-vetting gate
- [ ] Schema migration: `Lead.customerId`/`convertedAt`, `verifiedBy`/`verifiedAt` on Customer & Vehicle, `DraftIntake` ([BLOCKING] `prisma migrate dev`)
- [ ] Port interfaces + fake adapters: `OcrModule`/FakeOcr, `MapperProvider`/FakeMapper, `StorageProvider`/LocalFs
- [ ] New repos: `vehicle.repo`, `lead.repo`, `ocr-result.repo` (Phase-2 pattern) + RED test stubs
- [ ] Playwright installed + configured (browsers); `test:e2e` script; CI browser cache

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dependency vetting before install | (supply-chain) | Human approves net-new packages | At the install checkpoint, confirm the package list/versions before proceeding |
| Visual/responsive quality | UI-01 | Subjective polish on real devices | Run `pnpm --filter @super-care/web dev`; click the wizard on desktop + a phone width |

*Core behaviors have automated verification (unit/integration/e2e).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers runnable shell + migration + adapters + e2e setup
- [x] No watch-mode flags (CI uses run mode)
- [x] Feedback latency < 30s (unit/integration)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (2026-06-07)
