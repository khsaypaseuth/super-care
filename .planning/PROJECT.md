# super-care

## What This Is

A cross-border vehicle insurance platform connecting **Laos** and **Thailand**. A Lao
customer buys Thai insurance cover (and, over time, the reverse and other flows) end to
end: capture identity + vehicle via OCR, price the **Premium in THB**, convert to **LAK at
checkout**, take **Payment**, and issue a **Certificate** — with **Partner** referrals and
**Commission**, **Renewals**, and customer **Messaging** (WhatsApp/LINE) as the platform
grows. It serves Lao/Thai vehicle owners (via self-serve web and/or agent-assisted back
office), channel **Partners**, and internal admin staff.

## Core Value

A real customer can complete **one paid, certificate-issued cross-border insurance
transaction**, top to bottom, with correct money math — because in insurance a wrong
Premium, FX conversion, or identifier is real money or legal exposure.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope (v1 = full platform per the Master Plan appendix). Hypotheses until shipped. -->

**Purchase journey (the vertical slice — Phase 1 builds this first, agent-assisted):**
- [ ] Capture a **Lead** and convert to **Customer**
- [ ] Capture an **IdentityDocument** and run **OCR** → `OcrResult` (raw, never "cleaned"); identifiers validated by pure validators, never the LLM
- [ ] Capture a **Vehicle** (plate / chassis / engine) with format-validated identifiers
- [ ] Produce an **FxQuote**: Premium standard in THB → LAK at source rate **+15 kips, rounded up** (direction rule), locked + time-stamped
- [ ] Create an **Order** governed by a state machine (only legal transitions; failure states modelled)
- [ ] Generate an **Invoice** and collect **Payment** via one interface over **Phapay (LAK)** and **Opn/Omise (THB)**, routed by **Market**; payment webhooks are idempotent
- [ ] Issue a **Certificate** via `CertificateModule` (adapters: manual key-in + PDF upload now; AI-agent auto-issue later)

**Partners & commission:**
- [ ] Register a **Partner** and attribute an Order to them
- [ ] Compute **Commission** via a tier ladder (volume thresholds, per-order amounts)

**Renewals:**
- [ ] Detect an expiring **Certificate** and drive a **Renewal**

**Messaging:**
- [ ] Send templated customer notifications via **MessagingModule** (WhatsApp/LINE)
- [ ] Customer-facing **chatbot** (uses glossary terms; never touches identifier validation)

**Admin:**
- [ ] Admin can view/manage Orders, Payments, Certificates, Partners, and audit logs

**Platform/cross-cutting:**
- [ ] Strict-TS + Zod validation at every untrusted boundary (OCR, webhooks, chat, API bodies)
- [ ] PII encrypted at rest; access recorded in `audit_logs`
- [ ] CI gate: typecheck + lint + tests green before merge

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **Real external integrations in Phase 1** — OCR, Payment, Messaging, and Certificate
  issuance are stubbed behind adapter interfaces (fakes) so the vertical slice is
  self-contained and fully testable; real adapters land in later phases.
- **Customer self-serve web in Phase 1** — Phase 1 is agent/staff-assisted back office to
  de-risk the end-to-end path; self-serve is added once the spine works.
- **AI-agent auto-issuance of Certificates in Phase 1** — start with manual key-in + PDF
  upload; automate issuance later.
- **Markets beyond the first slice (e.g. TH→LA)** — modelled via `Market` but not all
  flows built in the first slice.
- **Embedding any AGPL dev tooling (claude-mem) into the shipped product** — dev-only.

## Context

- Greenfield. pnpm monorepo: `apps/api` (NestJS, deep modules), `apps/web` (Next.js —
  customer site + admin), `packages/shared` (Zod schemas, domain types, pure validators).
- Engineering standards already committed: `docs/ENGINEERING-STANDARDS.md` (ubiquitous
  language, vertical slices, TDD, deep modules, strict TS + Zod) and `docs/GLOSSARY.md`
  (authoritative vocabulary — same term in DB, service, API, UI, admin, chatbot).
- This is an appendix to an external **Master Plan v3** (sections §6, §12 referenced there
  but not in this repo) — domain truth lives partly outside; capture decisions here.
- Regulated domain: handles passports, national IDs, and payment data. Third-party AI dev
  plugins must stay local and never touch real customer PII.
- Certificates are issued in an **external insurer system**; the platform bridges to it
  either by manual key-in + upload or, later, an AI agent acting on our stored data.

## Constraints

- **Tech stack**: Node 22, pnpm, TypeScript (strict, `noImplicitAny`, `any` banned), NestJS,
  Next.js, Prisma, Zod — fixed by the standards appendix.
- **Process**: TDD is mandatory for FX, identifier validators, commission, order state
  machine, and idempotent webhooks — a wrong value is money/legal exposure.
- **Architecture**: deep modules with narrow public interfaces; provider swaps change one
  module, not the codebase.
- **Security**: no secrets in code (env-managed); PII encrypted at rest; access audit-logged.
- **Workflow**: git commit at every phase; merge only on green CI (typecheck + lint + tests).
- **FX rule (load-bearing)**: Premium standard = THB; Lao checkout converts THB → LAK at
  source rate **+15 kips, rounded up**; direction depends on collection currency.
- **Hosting**: deploys to **Hostinger** — frontend (Next.js) + backend (NestJS) + **PostgreSQL**
  all on Hostinger. The long-running NestJS/Next.js processes + a Postgres service require a
  **Hostinger VPS** (not shared hosting). Prisma provider is pinned to `postgresql`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| pnpm monorepo: NestJS API + Next.js web + shared package | Matches standards (named NestJS modules) and sibling projects; shares Zod schemas/validators | — Pending |
| v1 = full platform (purchase + partners + renewals + messaging + admin) | User wants the complete appendix scope this cycle | — Pending |
| Phase 1 driver = agent/staff-assisted back office | Simplest end-to-end path; no public auth/UX to de-risk the spine first | — Pending |
| Stub all externals in Phase 1 behind adapters | Self-contained, fully testable vertical slice; real keys later | — Pending |
| Payment = one interface over Phapay (LAK) + Opn/Omise (THB), routed by Market | Avoids provider lock-in; deep-module pattern | — Pending |
| Certificate via adapter: manual upload now, AI-agent auto-issue later | Matches the only two real issuance paths available today | — Pending |
| FX: THB → LAK, +15 kips, round up (direction rule) | Defined commercial markup rule; must never ship wrong | — Pending |
| Deploy to Hostinger VPS (Next.js + NestJS + PostgreSQL) | User's chosen host; Prisma pinned to postgresql | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-06 after initialization*
