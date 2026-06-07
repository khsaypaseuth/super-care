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

- Greenfield. pnpm monorepo: `apps/web` (Next.js — full-stack: customer site + admin + API
  via route handlers / server actions; **no NestJS**), `packages/shared` (Zod schemas, domain
  types, pure validators). Deep modules (Ocr, Payment, Order, Certificate…) live as
  server-side `lib/` modules inside the Next.js app. Prisma → PostgreSQL on Hostinger.
- **First concrete market = Thai Compulsory Motor Insurance (CMI / พ.ร.บ.).** The V1 flow:
  select insurance company → New Policy or Renewal → upload vehicle registration book (OCR via
  Google Document AI) → AI maps extracted values to master tables → user verifies → pays online
  (PromptPay QR / Omise / 2C2P, all THB) → staff receives order in admin → policy issued →
  policy PDF sent to customer. See `docs/CMI-SPEC.md` for master tables + reference data.
- Cross-border (Lao↔Thai) FX, partner commission, and messaging/chatbot remain in V1 scope as
  later phases; Thai CMI is the first end-to-end slice. Light `Market`/`Currency` seams kept.
- **Product surfaces:** (1) **public web** (desktop + mobile responsive), (2) **web admin**
  (manage orders **and users**), (3) **native Android/iOS apps — deferred to v2**, built on the
  same JSON API. v1 has four account roles: **ADMIN, STAFF, PARTNER, CUSTOMER**.
- **Auth phasing:** `User`/`Role`/account schema in Phase 2; login + RBAC + manage-users UI at
  the admin phase (Phase 7). Back-office phases 3–6 are built before auth is layered on.
- **API seam:** business logic stays in server-side modules; Next.js route handlers expose a
  clean versioned JSON API so the future native apps reuse it (no logic trapped in web UI).
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

- **Tech stack**: Node 22, pnpm, TypeScript (strict, `noImplicitAny`, `any` banned),
  **Next.js (full-stack: route handlers / server actions — no NestJS)**, Prisma, PostgreSQL,
  Zod. OCR = Google Document AI; AI mapping = Claude/GPT; Payment = PromptPay QR / Omise / 2C2P
  (Thai CMI) + Phapay (LAK, cross-border later). Supersedes the standards appendix's NestJS choice.
- **UI**: must be **mobile responsive** across all customer- and staff-facing screens.
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
| Deploy to Hostinger VPS (Next.js + PostgreSQL) | User's chosen host; Prisma pinned to postgresql | — Pending |
| Backend = Next.js full-stack + Prisma, NO NestJS | User decision 2026-06-07; simpler than NestJS, self-hosted on Hostinger (vs Supabase cloud); supersedes standards §A4 | — Pending |
| First market = Thai CMI (พ.ร.บ.) only as the first slice; full cross-border platform kept in V1 | User confirmed scope 2026-06-07 + CMI spec | — Pending |
| UI must be mobile responsive | User requirement 2026-06-07 | — Pending |
| OCR = Google Document AI; AI master-table mapping = Claude/GPT (never validates identifiers) | CMI spec recommendation | — Pending |
| Payment (Thai CMI) = PromptPay QR / Omise / 2C2P | CMI spec; all THB | — Pending |
| Three surfaces: public web + web admin (manage orders & users); native iOS/Android deferred to v2 | User confirmed 2026-06-07 | — Pending |
| v1 roles = ADMIN, STAFF, PARTNER, CUSTOMER; admin manages users | User confirmed 2026-06-07 | — Pending |
| Auth: User/Role schema in Phase 2; login/RBAC/manage-users UI at admin Phase 7 | User chose to keep auth near admin phase | — Pending |
| Backend exposes clean JSON API for web + future native apps (API-01) | Keep logic in server modules; app-ready seam | — Pending |

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
