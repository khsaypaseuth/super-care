# Requirements: super-care

**Defined:** 2026-06-06
**Core Value:** A real customer can complete one paid, certificate-issued cross-border insurance transaction, top to bottom, with correct money math.

> Terms below are the authoritative glossary words (`docs/GLOSSARY.md`). "User" = whichever
> actor performs the action: **staff/agent** (Phase 1 back office), **customer**, **partner**,
> or **admin**.

## v1 Requirements

v1 = the full platform (per Master Plan appendix). Each requirement maps to a roadmap phase.

### Platform & Foundation

- [x] **PLAT-01**: pnpm monorepo (`apps/api` NestJS, `apps/web` Next.js, `packages/shared`) builds with strict TypeScript (`noImplicitAny`, `any` banned)
- [ ] **PLAT-02**: Zod schemas validate every untrusted boundary (API bodies, OCR output, webhook payloads, chat input) before use
- [ ] **PLAT-03**: Money is represented as decimal (Prisma `Decimal` / big.js), never floating point, end to end
- [x] **PLAT-04**: CI gate runs typecheck + lint + tests and must be green before merge

### Customer & Identity

- [x] **CUST-01**: User can capture a **Lead** (contact + intent)
- [x] **CUST-02**: User can convert a **Lead** into a **Customer**
- [x] **CUST-03**: User can attach an **IdentityDocument** (passport or national ID) to a Customer
- [x] **CUST-04**: System runs **OCR** on an IdentityDocument and stores a raw **OcrResult** (never "cleaned")
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

- [x] **SEC-01**: PII (passport, national ID, documents) is encrypted at rest
- [x] **SEC-02**: No secrets in code; all secrets are env/KMS-managed
- [ ] **SEC-03**: Every access to PII is recorded in `audit_logs`
- [ ] **SEC-04**: Customer consent is captured before identity capture; cross-border data-residency basis (PDPA / Lao Law 25) is documented as a go-live gate

### User Interface

- [x] **UI-01**: All customer- and staff-facing screens are **mobile responsive**

### Thai CMI & Reference Data

> First concrete market. See `docs/CMI-SPEC.md`. These refine the generic reqs above for the
> Thai Compulsory Motor Insurance (พ.ร.บ.) flow.

- [ ] **CMI-01**: Master tables exist and are seeded — `insurance_companies`, `cmi_policy_types`, title names, card types, nationalities (ISO-3166 Alpha-3), provinces/districts/subdistricts, car brands/models/colors, vehicle types
- [x] **CMI-02**: User selects an **insurance company** and **New Policy or Renewal** to start an Order
- [x] **CMI-03**: System OCRs the **vehicle registration book** (Google Document AI) into a raw OcrResult of owner + vehicle fields
- [x] **CMI-04**: System **AI-maps** OCR-extracted values to master-table entries for user verification; the AI mapping never performs identifier checksum validation (that stays deterministic per CUST-05/06, VEH-02)
- [ ] **CMI-05**: User pays for a Thai CMI Order via **PromptPay QR / Omise / 2C2P** (THB)
- [ ] **CMI-06**: Issued CMI **policy (Certificate) PDF** is delivered to the customer and the Order is managed by staff in admin

### Authentication & Access

> v1 supports four account roles. The `User` / `Role` / account schema lands in **Phase 2**;
> login + RBAC + manage-users UI lands at the **admin phase (Phase 7)** (per 2026-06-07
> decision). Back-office phases 3–6 are built/tested before auth is layered on at Phase 7.

- [ ] **AUTH-01**: A user can log in with credentials and hold a secure session
- [ ] **AUTH-02**: Role-based access control with roles **ADMIN, STAFF, PARTNER, CUSTOMER**; each role sees only its permitted data and actions
- [ ] **AUTH-03**: Admin can **manage user accounts** — create/disable accounts and assign roles (the admin "manage users" capability)
- [ ] **AUTH-04**: Staff/Agent log in to process Orders in the back office
- [ ] **AUTH-05**: Partner can log in to view their own attributed Orders and Commission
- [ ] **AUTH-06**: Customer can log in to view their own Orders, Certificates, and Renewals

### Platform API

- [x] **API-01**: Business logic lives in server-side modules; the backend exposes a clean, versioned **JSON API** (Next.js route handlers) consumable by the web app **and future native apps**

## v2 Requirements

Deferred — acknowledged but not in the current roadmap.

### Native Apps

- **MOBILE-01**: Native **Android & iOS** apps (e.g. React Native / Expo) consuming the same JSON API (**API-01**). Web API is built app-consumable in v1; the apps themselves are v2.

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

Each v1 requirement maps to exactly one **primary** phase (where it is first delivered).
Externals are delivered on **fake adapters** in their primary phase and **realized with real
providers** in Phase 10 (noted in the Notes column); the requirement is not re-counted.

| Requirement | Phase | Status | Notes |
|-------------|-------|--------|-------|
| PLAT-01 | Phase 1 | Complete | Monorepo + strict TS |
| PLAT-02 | Phase 1 | Pending | Zod boundary schemas (applied at every edge through P10) |
| PLAT-03 | Phase 1 | Pending | Decimal money representation locked before persistence |
| PLAT-04 | Phase 1 | Complete | CI gate |
| CUST-05 | Phase 1 | Pending | Thai-ID checksum pure validator (TDD) |
| CUST-06 | Phase 1 | Pending | Passport format pure validator (TDD) |
| VEH-02 | Phase 1 | Pending | Plate/chassis/engine format validators (TDD) |
| FX-01 | Phase 1 | Pending | Table-driven Premium lookup |
| FX-02 | Phase 1 | Pending | FX math: +15 kips/unit, ceil (TDD) |
| FX-03 | Phase 1 | Pending | FX direction rule, no-conversion-on-THB (TDD) |
| ORD-02 | Phase 1 | Pending | Order state machine pure table (TDD) |
| COMM-01 | Phase 1 | Pending | Commission tier-ladder math (TDD); wired to Partners in P8 |
| COMM-02 | Phase 1 | Pending | Commission boundary tests (TDD) |
| SEC-01 | Phase 2 | Complete | PII encrypted at rest |
| SEC-02 | Phase 2 | Complete | No secrets in code + CI secret-scan |
| SEC-03 | Phase 2 | Pending | Audit log per PII access |
| CUST-01 | Phase 3 | Complete | Lead capture |
| CUST-02 | Phase 3 | Complete | Lead → Customer |
| CUST-03 | Phase 3 | Complete | Attach IdentityDocument |
| CUST-04 | Phase 3 | Complete | Fake OCR → raw OcrResult; real Google Vision in P10 |
| CUST-07 | Phase 3 | Pending | Human-verify gate on money/legal fields |
| VEH-01 | Phase 3 | Pending | Vehicle capture |
| FX-04 | Phase 4 | Pending | Order charged from stored locked FxQuote |
| ORD-01 | Phase 4 | Pending | Create Order |
| ORD-03 | Phase 4 | Pending | Failure states + refund path |
| ORD-04 | Phase 4 | Pending | Invoice generation |
| PAY-01 | Phase 5 | Pending | One interface, Market-routed; fake adapter (real Phapay/Omise in P10) |
| PAY-02 | Phase 5 | Pending | Idempotent + ordering-safe webhooks (TDD) |
| PAY-03 | Phase 5 | Pending | Webhook sole source of truth; redirect never mutates |
| CERT-01 | Phase 6 | Pending | Issue Certificate for PAID Order (adapter) |
| CERT-02 | Phase 6 | Pending | Mandatory COI fields first-class |
| CERT-03 | Phase 6 | Pending | Manual key-in + PDF upload adapter |
| CERT-04 | Phase 6 | Pending | AI-agent adapter contract/stub; live AI issuance + human gate in P10 |
| ADMIN-01 | Phase 7 | Pending | Admin Orders/Invoices/Payments/Certificates |
| ADMIN-03 | Phase 7 | Pending | Admin audit_logs view |
| MSG-01 | Phase 7 | Pending | Templated notifications on fake adapter; real WhatsApp/LINE in P10 |
| PART-01 | Phase 8 | Pending | Register Partner |
| PART-02 | Phase 8 | Pending | Attribute Order to Partner |
| ADMIN-02 | Phase 8 | Pending | Admin Partners + Commission |
| REN-01 | Phase 9 | Pending | Detect expiring Certificate |
| REN-02 | Phase 9 | Pending | Renewal → new Order + fresh FxQuote |
| REN-03 | Phase 9 | Pending | Reminder cadence |
| MSG-02 | Phase 10 | Pending | Customer chatbot (never validates identifiers) |
| SEC-04 | Phase 10 | Pending | Consent + cross-border legal go-live gate |

**Coverage:**

- v1 requirements: 41 total
- Mapped to phases: 41 (each to exactly one primary phase)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-06-06 after roadmap creation (traceability mapped)*
