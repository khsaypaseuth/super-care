# Phase 1: Foundation & Money/Legal Cores - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Source:** Inline context capture (PROJECT.md + research + standards; 2 decisions confirmed with user)

<domain>
## Phase Boundary

Establish the pnpm monorepo with a green CI gate, and prove **every money/legal pure
function** correct via TDD **before any I/O exists**. This phase is pure logic + scaffolding
only — **no database, no NestJS HTTP, no Next.js UI, no external adapters.** Those arrive in
later phases (data layer = Phase 2, capture/UI = Phase 3+).

In scope (Phase 1):
- Monorepo scaffold: `apps/web` (Next.js shell — the full-stack app; API = route handlers /
  server actions, **no NestJS**), `packages/shared` (the pure logic home), under pnpm
  workspaces + TypeScript project references.
- CI gate: typecheck + lint + tests, red on failure.
- Pure, exhaustively-tested logic in `packages/shared`:
  - **FX math** — THB → LAK at source rate **+15 kips per rate unit, rounded up (ceil)**;
    **direction rule** (no conversion/markup on a THB-collection path); no float drift.
  - **Identifier validators** — Thai National ID 13-digit checksum; passport format;
    plate / chassis / engine format. Deterministic; the LLM never touches identifiers.
  - **Premium lookup** — table-driven Premium (THB); no underwriting engine.
  - **Order state machine** — pure transition table; legal transitions only, illegal throw;
    failure states (OCR/payment/cert-gen failed) and refund path (post-PAID) modelled.
  - **Commission math** — tier ladder; boundary cases both sides of every threshold; THB base.
- Zod schema scaffolding for domain types in `packages/shared` (boundary-validation pattern
  established even though no live boundary exists yet).

Out of scope (Phase 1): Prisma schema/migrations, persistence, encryption, audit logging,
HTTP endpoints, OCR/payment/messaging/certificate adapters (even fakes), any UI.
</domain>

<decisions>
## Implementation Decisions

### Money representation (CONFIRMED with user)
- **Decimal everywhere.** Database columns are Prisma `Decimal`; in-code money/rate math uses
  **big.js** with explicit rounding modes. **JS `number` is never used for money.** PLAT-03.
- FX `+15 kips` markup is applied **per rate unit**, then **rounded up (`ceil` / Big roundUp)**.
- Handles THB (2-dp satang) and LAK (whole kip) in one model.

### Monorepo tooling (CONFIRMED with user)
- **Plain pnpm workspaces + TypeScript project references.** No Turborepo/Nx. Root scripts
  drive build/test/lint across `apps/api`, `apps/web`, `packages/shared`.

### Stack (from research SUMMARY/STACK — locked unless flagged)
- **TypeScript strict** (`noImplicitAny`, `any` banned in committed code). PLAT-01.
- **Vitest** as the single TDD test runner for `packages/shared` (unit) — fast, TS-native.
- **XState v5** for the Order state machine, used **headless** as a pure, exhaustively-testable
  transition table (not a running actor). ORD-02.
- **Zod** for schema/type definitions of domain objects. PLAT-02.
- **big.js** for decimal money math (see above).
- Lint: ESLint + typescript-eslint, `any` disallowed; Prettier for formatting.

### Pure-logic placement
- All TDD-critical pure functions live in `packages/shared` with **no I/O imports**, so they
  are trivially unit-testable and reused across `apps/web` (server + client). There is no
  separate API app — deep modules (Ocr, Payment, Order, Certificate…) will live as
  server-side `lib/` modules inside the Next.js app in later phases.

### Thai National ID checksum (from PITFALLS research)
- Algorithm: weights 13→2 across the first 12 digits; `check = (11 − (sum mod 11)) mod 10`;
  the 13th digit must equal `check`. Test vectors **must** include a check-digit-0 case and
  reject non-13-length / non-numeric input. CUST-05.

### Order state machine (from ARCHITECTURE research)
- States include the happy path plus `OCR_FAILED`, `PAYMENT_FAILED`, `CERT_FAILED`, and
  `REFUNDING`/`REFUNDED`. Refund only reachable **after** `PAID`. Illegal transitions throw.

### Walking-skeleton interpretation
- GSD auto-flags Phase 1 as a "walking skeleton," but this project's approved roadmap
  deliberately places DB and UI in later phases. The Phase 1 "thinnest working slice" =
  **monorepo builds + CI green + all pure-core test suites passing.** Do NOT force a DB
  read/write or UI interaction into Phase 1.

### Claude's Discretion
- Exact file/folder layout within each package; ESLint/Prettier/tsconfig specifics; CI
  provider config (GitHub Actions assumed); naming of internal pure functions (must match
  glossary domain terms where they represent domain concepts).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Standards & vocabulary
- `docs/ENGINEERING-STANDARDS.md` — §A1 ubiquitous language, §A2 vertical slices, §A3 TDD
  (mandatory for FX/validators/commission/state-machine), §A4 deep modules, §A5 strict TS + Zod.
- `docs/GLOSSARY.md` — authoritative domain terms; use the exact words in code.

### Project planning
- `.planning/PROJECT.md` — constraints (Decimal money, Hostinger/Postgres, FX rule) + decisions.
- `.planning/REQUIREMENTS.md` — Phase 1 reqs: PLAT-01..04, CUST-05/06, VEH-02, FX-01/02/03,
  ORD-02, COMM-01/02.
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, exit gate.

### Research
- `.planning/research/STACK.md` — big.js, XState v5, Vitest, what-NOT-to-use (no float, no dinero v2-alpha).
- `.planning/research/ARCHITECTURE.md` — Order state-machine transition table; pure-logic in packages/shared.
- `.planning/research/PITFALLS.md` — FX direction/rounding traps; Thai-ID checksum formula + test-vector requirements; no-LLM-on-identifiers.
</canonical_refs>

<specifics>
## Specific Ideas

- FX test must be a **vector table** proving: (a) THB→LAK = rate +15 kips/unit then ceil,
  (b) the no-conversion-on-THB direction case, (c) a no-float-drift case.
- Thai-ID test must be a **vector table** incl. a check-digit-0 case + invalid-shape rejects.
- Commission test must cover **both sides of every tier threshold** against the THB base.
- Order state-machine test must assert illegal transitions **throw**, and the refund path
  (`PAID`/`CERT_FAILED → REFUNDING → REFUNDED`) is reachable.
</specifics>

<deferred>
## Deferred Ideas

- Prisma schema, migrations, PII encryption, audit logging → Phase 2.
- Wiring pure cores into NestJS services / live boundaries → Phase 3–4.
- Fake adapters (OCR/payment/messaging/certificate) → Phases 3–6.
- Real providers + compliance gate → Phase 10.
</deferred>

---

*Phase: 01-foundation-money-legal-cores*
*Context gathered: 2026-06-06 via inline capture*
