---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-03-PLAN.md
last_updated: "2026-06-07T14:23:58.275Z"
last_activity: 2026-06-07
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 13
  completed_plans: 10
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** A real customer can complete one paid, certificate-issued cross-border insurance transaction, top to bottom, with correct money math.
**Current focus:** Phase 03 — identity-vehicle-capture-fakes

## Current Position

Phase: 03 (identity-vehicle-capture-fakes) — EXECUTING
Plan: 4 of 6
Status: Ready to execute
Last activity: 2026-06-07

Progress: [██████░░░░] 65%

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: ~14 min
- Total execution time: ~83 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 of 4 DONE | ~38min | ~9.5min |
| 02-data-layer (partial) | 2 of 3 done | ~45min | ~22.5min |

**Recent Trend:**

- Last 5 plans: 01-02 (~15min), 01-03 (~8min), 01-04 (~8min), 02-01 (~11min), 02-02 (~45min)
- Trend: larger integration-heavy plans take 30–45 min; pure TDD modules ~8–11 min

*Updated after each plan completion*
| Phase 03 P03-01 | 35 | 2 tasks | 23 files |
| Phase 03 P03-02 | 30 | 3 tasks | 11 files |
| Phase 03-identity-vehicle-capture-fakes P03-03 | 20min | - tasks | - files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 10 phases, dependency-ordered; money/legal spine (FX, validators, state machine, commission, webhooks) is TDD-mandatory and front-loaded in Phases 1, 4, 5, 6, 8.
- [Roadmap]: Vertical slice runs entirely on FAKE adapters through Phase 6 (one paid, cert-issued Order); real providers swap in Phase 10.
- [Roadmap]: Cross-border compliance (PDPA / Lao Law 25) + AI-agent issuance + real adapters gated to Phase 10 as the go-live gate.
- [01-02]: Big.roundUp (ceil) applied ONCE at the FX boundary; nowhere else in the codebase.
- [01-02]: MARKUP_KIPS_PER_RATE_UNIT = Big(15) on per-THB rate only [ASSUMED A1 — confirm unit with rate-feed spec].
- [01-02]: PREMIUM_TABLE amounts are placeholder [ASSUMED A2] — real rate card deferred.
- [01-04]: Plain TRANSITIONS table (not XState transition()) is the throw-on-illegal mechanism; xstate createMachine still exported for visualization.
- [01-04]: Whole-volume tier selection for commission: highest tier with minVolume <= partnerVolume applies to whole order (not marginal).
- [01-04]: Commission rounding: Big.roundHalfUp at 2dp (THB satang) — documented; different from FX ceil.
- [01-04]: LADDER commission tiers are placeholder [ASSUMED A3] — real partner policy deferred.
- [02-02]: Repository-based audit (not $extends/middleware) — caller ActorContext, atomic $transaction.
- [02-02]: fileParallelism: false (Vitest 4 API) replaces singleFork for serial integration test file execution.
- [02-02]: [DATA] bulk CMI imports (provinces/nationalities/brands/models) deferred — seed covers inline spec examples only.
- [03-01]: apps/web converted from tsc -b library to Next-owned tsconfig; root typecheck now: tsc -b (packages/shared) + tsc --noEmit -p apps/web.
- [03-01]: Next.js 16 uses proxy convention — middleware.ts renamed to proxy.ts.
- [03-01]: ESLint app/ coverage via @next/eslint-plugin-next native flat config (not FlatCompat — circular ref bug in ESLint 10).
- [03-02]: convertLeadToCustomer inlines encrypt+blindIndex in tx rather than calling createCustomer, so both audit rows land in one db.$transaction.
- [03-02]: Prisma migrate dev non-interactive; workaround: migrate diff → manual migration SQL → migrate deploy (CI-safe).
- [03-02]: Nullable JSON (DraftIntake.mapping) uses Prisma.JsonNull sentinel, not plain null.
- [Phase ?]: Hand-rolled Levenshtein over fastest-levenshtein — zero new external deps in regulated PII app
- [Phase ?]: LocalFsStorageAdapter: AES-256-GCM encryption via CryptoService; double path-traversal guard; server-generated UUID refs never from user input
- [Phase ?]: registry.ts marked import server-only; config-selected via OCR_PROVIDER/MAPPER_PROVIDER/STORAGE_PROVIDER env; real adapters Phase 10

### Pending Todos

None.

### Blockers/Concerns

- [Phase 10] Phapay has no public SDK — needs first-party API docs + sandbox creds before building (direct REST).
- [Phase 6/10] Exact insurer Certificate mandatory fields + whether a fixed PDF template exists must be confirmed with the insurer partner.
- [Phase 10] Cross-border PDPA 28/29 + Lao Law 25/NA basis + data-residency decision requires legal counsel (go-live gate).
- [Install] nestjs-zod@5 ↔ Zod 4 compatibility: NOTE — architecture is Next.js (no NestJS), so nestjs-zod is not used. Concern resolved.
- [Install] prisma-field-encryption ↔ Prisma 7 compatibility: RESOLVED — custom CryptoService used instead (library not Prisma-7-compatible).

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Self-serve | SELF-01 customer self-serve web | v2 | 2026-06-06 |
| Markets | MKT-01 reverse TH→LA flow | v2 | 2026-06-06 |
| Data | [DATA] Full ISO-3166 nationality list (~250 rows) | follow-up | 2026-06-07 |
| Data | [DATA] All 77 Thai provinces + districts + subdistricts + postal codes | follow-up | 2026-06-07 |
| Data | [DATA] Full car brand/model lists | follow-up | 2026-06-07 |

## Session Continuity

Last session: 2026-06-07T14:23:58.272Z
Stopped at: Completed 03-03-PLAN.md
