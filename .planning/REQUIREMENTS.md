# Requirements: super-care

**Defined:** 2026-06-06
**Core Value:** A real customer can complete one paid, certificate-issued cross-border insurance transaction, top to bottom, with correct money math.

> Terms below are the authoritative glossary words (`docs/GLOSSARY.md`). "User" = whichever
> actor performs the action: **staff/agent** (Phase 1 back office), **customer**, **partner**,
> or **admin**.

## v1 Requirements

v1 = the full platform (per Master Plan appendix). Each requirement maps to a roadmap phase.

### Platform & Foundation

- [ ] **PLAT-01**: pnpm monorepo (`apps/api` NestJS, `apps/web` Next.js, `packages/shared`) builds with strict TypeScript (`noImplicitAny`, `any` banned)
- [ ] **PLAT-02**: Zod schemas validate every untrusted boundary (API bodies, OCR output, webhook payloads, chat input) before use
- [ ] **PLAT-03**: Money is represented as decimal (Prisma `Decimal` / big.js), never floating point, end to end
- [ ] **PLAT-04**: CI gate runs typecheck + lint + tests and must be green before merge

### Customer & Identity

- [ ] **CUST-01**: User can capture a **Lead** (contact + intent)
- [ ] **CUST-02**: User can convert a **Lead** into a **Customer**
- [ ] **CUST-03**: User can attach an **IdentityDocument** (passport or national ID) to a Customer
- [ ] **CUST-04**: System runs **OCR** on an IdentityDocument and stores a raw **OcrResult** (never "cleaned")
- [ ] **CUST-05**: System validates a Thai National ID via the 13-digit checksum (pure validator, never the LLM)
- [ ] **CUST-06**: System validates passport number format (pure validator)
- [ ] **CUST-07**: User must human-verify OCR-extracted money/legal fields before they are used in an Order

### Vehicle

- [ ] **VEH-01**: User can capture a **Vehicle** with plate, chassis, and engine identifiers
- [ ] **VEH-02**: System validates plate / chassis / engine format via pure validators

### Pricing & FX

- [ ] **FX-01**: System determines a **Premium** in THB from a table-driven lookup (no underwriting engine)
- [ ] **FX-02**: System produces a locked, time-stamped **FxQuote** converting THB → LAK at source rate **+15 kips per rate unit, rounded up (ceil)** for LAK collection
- [ ] **FX-03**: FxQuote applies the **direction rule**: no conversion/markup on a THB-collection path
- [ ] **FX-04**: An Order is charged from the stored locked FxQuote, never a recomputed rate (no stale/drift)

### Order & Payment

- [ ] **ORD-01**: User can create an **Order** for a Customer + Vehicle + Premium
- [ ] **ORD-02**: Order transitions follow a state machine; illegal transitions throw
- [ ] **ORD-03**: Order models failure states (OCR failed, payment failed, cert-gen failed) and a refund path reachable only after PAID
- [ ] **ORD-04**: System generates an **Invoice** for an Order
- [ ] **PAY-01**: User can collect **Payment** via one interface over **Phapay (LAK)** and **Opn/Omise (THB)**, routed by **Market**
- [ ] **PAY-02**: Payment webhooks are idempotent (same event twice = one effect) and ordering-safe
- [ ] **PAY-03**: The webhook is the sole source of truth for payment state; the redirect never mutates money state

### Certificate

- [ ] **CERT-01**: System issues a **Certificate** for a PAID Order via `CertificateModule` (adapter-based)
- [ ] **CERT-02**: A Certificate records mandatory fields: named insured, vehicle identifiers, insurer + policy number, coverage class/limits, and effective + expiry dates as first-class fields
- [ ] **CERT-03**: User can issue via the manual adapter: key into the external insurer system, then upload the resulting PDF into the Order
- [ ] **CERT-04**: System supports an AI-agent issuance adapter that issues from stored Order data (with a human approval gate on legal/money fields)

### Partner & Commission

- [ ] **PART-01**: User can register a **Partner**
- [ ] **PART-02**: System can attribute an Order to a Partner
- [ ] **COMM-01**: System computes **Commission** via a tier ladder (volume thresholds; percentage and/or flat per-order forms), against a defined base currency
- [ ] **COMM-02**: Commission boundary cases (either side of every threshold) are exhaustively tested

### Renewal

- [ ] **REN-01**: System detects a **Certificate** approaching expiry and creates a **Renewal** opportunity
- [ ] **REN-02**: A Renewal produces a new Order with a fresh FxQuote (never silent auto-charge)
- [ ] **REN-03**: System sends renewal reminders on a defined cadence (e.g. 60/30/14 days before expiry)

### Messaging & Chatbot

- [ ] **MSG-01**: System sends templated customer notifications via **MessagingModule** (WhatsApp / LINE)
- [ ] **MSG-02**: A customer-facing **chatbot** answers using glossary terms and never performs identifier validation

### Admin

- [ ] **ADMIN-01**: Admin can view and manage Orders, Invoices, Payments, and Certificates
- [ ] **ADMIN-02**: Admin can view and manage Partners and their Commission
- [ ] **ADMIN-03**: Admin can view `audit_logs`

### Security & Compliance

- [ ] **SEC-01**: PII (passport, national ID, documents) is encrypted at rest
- [ ] **SEC-02**: No secrets in code; all secrets are env/KMS-managed
- [ ] **SEC-03**: Every access to PII is recorded in `audit_logs`
- [ ] **SEC-04**: Customer consent is captured before identity capture; cross-border data-residency basis (PDPA / Lao Law 25) is documented as a go-live gate

## v2 Requirements

Deferred — acknowledged but not in the current roadmap.

### Self-Serve

- **SELF-01**: Customer can complete the full purchase journey self-serve on the web (auth, upload, pay, receive certificate)

### Markets

- **MKT-01**: Reverse flow — Thai customer buys Laos cover (THB collection)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full underwriting / risk-rating engine | Product is fixed-rate/table-driven CMI + voluntary cover; Premium is a lookup, not a risk model |
| Silent auto-renewal (auto-charge) | Renewals must be reminder-driven and re-quoted; auto-charge is an anti-feature |
| LLM cleaning or validating identifiers | Forbidden — identifiers use deterministic pure validators only |
| Real external integrations in Phase 1 | OCR/payment/messaging/certificate stubbed behind adapters; real adapters are a later phase |
| Embedding AGPL dev tooling (claude-mem) in the shipped product | Dev-only; licensing |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (to be mapped by roadmapper) | — | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 41 ⚠️

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-06-06 after initial definition*
