# Engineering Standards & AI-Assisted Development Workflow
## Appendix to Master Plan v3 (Lao ↔ Thailand Cross-Border Insurance)

This document defines **how we write the code**, so the platform stays maintainable
as it grows and as AI agents do much of the typing. Two separate concerns:

- **§A — Engineering principles** (how the code is designed) — based on Matt Pocock's
  talk *"It Ain't Broke: Why Software Fundamentals Matter More Than Ever."*
- **§B — AI-assisted workflow & tooling** (how the team drives the AI).

Guiding idea: AI coding tools are powerful but will produce spaghetti fast if the
*process* is weak. The tool is not the differentiator — the discipline is.

---

# §A. Engineering Principles

## A1. Ubiquitous language (one vocabulary, everywhere)

Define domain terms once and use the **exact same word** in the database, backend, API,
UI, admin, and the chatbot. No synonyms. See `docs/GLOSSARY.md` for authoritative terms.

Rule: Prisma model name = NestJS module/service name = API resource = React component
domain = admin label = chatbot term. If a term changes, it changes everywhere in one PR.

## A2. Vertical slices (ship one thin path end to end)

Each unit of work cuts through **every layer** (DB → service → API → UI) for **one
capability**, and is shippable and testable on its own. We do **not** build "all of the
database," then "all of the API." Phase 1 is one real, paid, certificate-issued
transaction — top to bottom — before we widen.

## A3. TDD (red → green → refactor)

Write a failing test, make it pass, then clean up. **Mandatory** for high-risk logic
where a wrong value is real money or legal exposure:

- **Critical-field validators** — Thai National ID 13-digit checksum; passport / plate /
  chassis / engine format. Pure functions, exhaustively unit-tested, including invalid
  inputs. These never touch the LLM.
- **FX quote engine** — source rate + 15 kips, rounding-up, and the **direction rule**
  (LAK collection vs. THB collection). Test against a table of cases.
- **Commission calculation** — tier ladder, volume thresholds, per-order amounts.
- **Order state machine** — only legal transitions allowed; illegal transitions throw and
  are tested (incl. failure states: OCR failed, payment failed, cert-gen failed, refund).
- **Webhook handlers** — payment webhooks must be **idempotent** (same event twice = one
  effect) and tested for replay/out-of-order delivery.

## A4. Deep modules (simple interface, hidden complexity)

Each bounded module exposes a **small, clear public surface** and hides messy internals.

> **Architecture update (2026-06-07):** the project uses **Next.js full-stack + Prisma (no
> NestJS)**. The deep-module principle is unchanged — modules now live as **server-side
> `lib/` modules** inside the Next.js app (e.g. `apps/web/src/server/modules/fx`), exposed
> through Next.js route handlers / server actions instead of NestJS providers. Read
> "module" below as a server-side TS module, not a NestJS module.

- `FxModule.quote(market, baseAmount) → FxQuote` — hides rate feed, kip math, rounding,
  direction; returns a locked, time-stamped quote.
- `OcrModule.extract(documentType, file) → OcrResult` — hides Google Vision calls and
  field routing; never returns "cleaned" identifiers.
- `PaymentModule` — hides Phapay / Opn-Omise differences behind one interface.
- `CertificateModule`, `CommissionModule`, `MessagingModule` (WhatsApp/LINE),
  `RenewalModule` — same pattern.

A deep module means provider swaps change **one** module, not the whole codebase.

## A5. TypeScript & boundary discipline (concrete gates)

- **Strict TypeScript**, `noImplicitAny`; `any` is banned in committed code.
- **Validate every boundary with a schema (Zod).** OCR output, webhook payloads, chat
  input, and API request bodies are *untrusted* until parsed.
- **No secrets in code**; env-managed. PII (passport, national ID, documents) encrypted
  at rest; access logged (`audit_logs`).
- **CI quality gate** on every PR: typecheck + lint + tests must pass before merge.
- Keep functions/modules small; prefer pure functions for anything calculable.

---

# §B. AI-Assisted Workflow & Tooling

The plugins below operationalize §A — they push the AI into a brainstorm → spec →
plan → TDD → review loop instead of "just write code."

| Tool | Source | Role |
|---|---|---|
| **superpowers** | third-party (MIT) | Backbone: enforces TDD, spec-before-code, planned execution, code-reviewer agent. |
| **skill-creator** | official | Author project-specific skills encoding our rules (fx-quote, ocr-field-validation). |
| **frontend-design** | official | Production-grade UI instead of generic AI look. |
| **claude-mem** | third-party (AGPL-3.0) | Persists project context across sessions. Dev-only. |
| **context-mode** | third-party (MCP) | Compresses large MCP tool outputs to protect context window. |
| **get-shit-done-cc** | third-party CLI | Global workflow scaffolding. |

## Workflow per feature / vertical slice

1. **Brainstorm → spec** using §A1 glossary terms.
2. **Plan**: a clear implementation plan a junior could follow.
3. **TDD execution**: failing tests first for validators, FX, commission, state
   transitions; then implementation; then refactor.
4. **Code review**: reviewer agent checks diff against plan and standards.
5. **Merge** only when CI (typecheck + lint + tests) is green.

## Governance caveats (insurance product)

Because this product handles **passports, national IDs, and payment data**:

1. **Vet what each tool logs/stores/transmits** and keep it **local** — no customer PII or
   production secrets in any plugin's context or sent externally. Tools operate on code and
   architecture, not real customer data.
2. **Track licenses** — `claude-mem` is AGPL-3.0 (strong copyleft); dev-only, do not embed
   in shipped app without legal review.
3. **Pin versions** and review updates — community plugins move fast; auto-updating tools in
   a regulated codebase are a supply-chain risk.
4. These tools **never replace human review** of money math, identifier validation, and
   compliance logic.

---

# Summary

- Four fundamentals: **ubiquitous language, vertical slices, TDD, deep modules** — applied
  hardest to FX, identifier validation, commission, and the order state machine.
- AI tooling is configured to **enforce that process**, not bypass it.
- Strict TypeScript + schema validation at every boundary + green CI before merge.
- Third-party plugins are dev-only and must never touch real customer PII.
