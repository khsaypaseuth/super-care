# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** A real customer can complete one paid, certificate-issued cross-border insurance transaction, top to bottom, with correct money math.
**Current focus:** Phase 1 — Foundation & Money/Legal Cores

## Current Position

Phase: 1 of 10 (Foundation & Money/Legal Cores)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-06-06 — Roadmap created (10 phases, fine granularity), 41/41 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 10 phases, dependency-ordered; money/legal spine (FX, validators, state machine, commission, webhooks) is TDD-mandatory and front-loaded in Phases 1, 4, 5, 6, 8.
- [Roadmap]: Vertical slice runs entirely on FAKE adapters through Phase 6 (one paid, cert-issued Order); real providers swap in Phase 10.
- [Roadmap]: Cross-border compliance (PDPA / Lao Law 25) + AI-agent issuance + real adapters gated to Phase 10 as the go-live gate.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 10] Phapay has no public SDK — needs first-party API docs + sandbox creds before building (direct REST).
- [Phase 6/10] Exact insurer Certificate mandatory fields + whether a fixed PDF template exists must be confirmed with the insurer partner.
- [Phase 10] Cross-border PDPA 28/29 + Lao Law 25/NA basis + data-residency decision requires legal counsel (go-live gate).
- [Install] Verify nestjs-zod@5 ↔ Zod 4 and prisma-field-encryption ↔ Prisma 7 compatibility.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Self-serve | SELF-01 customer self-serve web | v2 | 2026-06-06 |
| Markets | MKT-01 reverse TH→LA flow | v2 | 2026-06-06 |

## Session Continuity

Last session: 2026-06-06
Stopped at: Roadmap, traceability, and state initialized. Ready to plan Phase 1.
