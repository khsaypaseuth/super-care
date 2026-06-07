# Roadmap: super-care

## Overview

super-care delivers one paid, certificate-issued cross-border (Laos ↔ Thailand) vehicle-insurance transaction with correct money math, then widens into a full distribution platform. The build follows dependency direction: pure TDD'd money/legal cores first, then the encrypted/audited data layer, then the agent-assisted vertical slice (capture → quote → order → pay → certificate) running entirely on **fake adapters** so the spine is self-contained and fully testable. Once the spine is proven on fakes, the platform widens with admin back-office, partners/commission, and renewals, and only then swaps in **real external providers** (Google Vision, Phapay LAK / Omise THB, WhatsApp/LINE) behind the cross-border compliance go-live gate (PDPA / Lao Law 25). Provider and UI work never touches business logic — the deep-module/port-adapter boundaries hold throughout.

> **Update 2026-06-07 (architecture + Thai CMI):** Backend is **Next.js full-stack + Prisma
> (no NestJS)**. The first concrete market is **Thai CMI (พ.ร.บ.)** — see `docs/CMI-SPEC.md`.
> New requirements fold into existing phases (mapped when each is planned): **UI-01** (mobile
> responsive) → all UI phases (3–8, 10); **CMI-01** (master tables/reference data) → Phase 2;
> **CMI-02/03/04** (company + new/renewal, reg-book OCR, AI master-table mapping) → Phase 3;
> **CMI-05** (PromptPay/Omise/2C2P) → Phases 5 & 10; **CMI-06** (policy PDF + admin) →
> Phases 6 & 7. Phase 1 (foundation/pure cores) is unaffected by this update.

> **Update 2026-06-07 (surfaces, auth, native apps):** Surfaces = public web (desktop +
> mobile responsive), web admin (manage orders **and users**), and **native iOS/Android apps
> deferred to v2** (MOBILE-01) on the same JSON API. v1 roles = ADMIN/STAFF/PARTNER/CUSTOMER.
> Mapping: **User/Role/Account schema** → Phase 2; **login + RBAC + admin manage-users**
> (AUTH-01/02/03/04) → Phase 7; **partner portal** (AUTH-05) → Phase 8; **customer portal**
> (AUTH-06) → Phase 9; **API-01** (app-consumable JSON API) is an ongoing seam across all
> server work. Tradeoff (user-chosen): back-office Phases 3–6 are built/tested before auth is
> layered on at Phase 7.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Money/Legal Cores** - Monorepo, CI gate, and all TDD-mandatory pure logic (validators, FX math, Order state machine, commission math) green before any plumbing (completed 2026-06-07)
- [ ] **Phase 2: Encrypted Data Layer & Audit Spine** - Prisma schema, PII encryption at rest, audit logging, secret-scanning, and consent capture
- [ ] **Phase 3: Identity & Vehicle Capture (fakes)** - Lead→Customer, OCR on fake adapter, raw OcrResult, pure-validator + human-verify gate
- [ ] **Phase 4: Pricing & Order Spine** - Table-driven Premium, locked FxQuote, Order created and governed by the live state machine, Invoice
- [ ] **Phase 5: Payment (fakes)** - One payment interface routed by Market, idempotent + ordering-safe webhooks, webhook as sole money source of truth
- [ ] **Phase 6: Certificate Issuance & Refund Path (fakes)** - Manual-upload certificate with field-match + per-Order idempotency; failure→refund reachable from PAID; AI-agent adapter contract stubbed
- [ ] **Phase 7: Admin Back Office & Templated Messaging (fakes)** - Next.js admin over the proven slice; templated notifications on a fake messaging adapter
- [ ] **Phase 8: Partners & Commission** - Partner registration, Order attribution, TDD'd tier-ladder commission with refund reversal
- [ ] **Phase 9: Renewals** - Scan expiring Certificates, reminder cadence, re-quoted new Order (never silent auto-charge)
- [ ] **Phase 10: Real Adapters & Cross-Border Compliance Go-Live** - Swap fakes for Google Vision / Phapay / Omise / WhatsApp+LINE, AI-agent issuance with human gate, and the PDPA / Lao Law 25 go-live gate

## Phase Details

### Phase 1: Foundation & Money/Legal Cores

**Goal**: Establish the monorepo with a green CI gate and prove every money/legal pure function correct via TDD before any I/O exists.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, CUST-05, CUST-06, VEH-02, FX-01, FX-02, FX-03, ORD-02, COMM-01, COMM-02
**TDD-mandatory**: YES — this phase carries nearly all critical money/legal pitfalls (FX direction/rounding, Thai-ID checksum, identifier formats, illegal transitions, commission boundaries). Pure functions only; no LLM touches identifiers.
**Success Criteria** (what must be TRUE):

  1. `pnpm` monorepo (`apps/api`, `apps/web`, `packages/shared`) typechecks under strict TS (`any` banned) and CI runs typecheck + lint + tests, red on failure
  2. `fx.math` passes a vector table proving THB→LAK = source rate **+15 kips per unit, `ceil`**, the **no-conversion-on-THB** direction case, and a no-float-drift case (money is Decimal/integer, never float)
  3. The Thai National ID validator passes a checksum vector table including a **check-digit-0** case and rejects non-13-length / non-numeric input; passport and plate/chassis/engine validators accept Thai-script plate, Lao plate, and foreign passport shapes
  4. `order.state-machine` accepts only legal transitions and **throws on illegal ones**, with the refund path (`PAID`/`CERT_FAILED → REFUNDING → REFUNDED`) and all failure states modelled and tested
  5. `commission.math` passes a tier-ladder table testing **both sides of every threshold** against the defined THB base

**Exit gate**: FX test table green (direction + ceil + no-conversion-on-THB); Thai-ID checksum vectors green; illegal-transition-throws + refund-path tests green; commission boundary tests green.
**Plans**: 4 plans
Plans:

- [x] 01-01-PLAN.md — Monorepo scaffold, strict TS, ESLint(any-banned)+Prettier, Vitest, Zod boundary pattern, app shells, CI gate
- [x] 01-02-PLAN.md — Money value object (big.js), FX quote (+15/unit ceil + direction rule), table-driven Premium
- [x] 01-03-PLAN.md — Identifier validators: Thai-ID checksum, passport, plate/chassis/engine
- [x] 01-04-PLAN.md — Order state machine (illegal throws, refund path) + commission tier ladder

### Phase 2: Encrypted Data Layer & Audit Spine

**Goal**: Persist the domain with PII encrypted at rest, every PII access audit-logged, secrets out of code, and consent captured.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03 (+ User/Role/Account schema for AUTH-01..06; CMI-01 master tables)
**TDD-mandatory**: partial — encryption/decryption round-trip and audit-on-read are correctness-critical and tested.
**Success Criteria** (what must be TRUE):

  1. Prisma schema migrates with Order, Customer, Lead, Vehicle, IdentityDocument, Invoice, Payment, Certificate, Partner, Commission, `audit_logs`, and `idempotency_keys` (money columns are `Decimal`, identifier columns encrypted)
  1b. Schema includes `User`/`Account` + `Role` models supporting roles ADMIN/STAFF/PARTNER/CUSTOMER (RBAC **data model only**; login + enforcement land in Phase 7), plus the CMI master/reference tables (CMI-01: insurance_companies, cmi_policy_types, title names, card types, ISO-3166 nationalities, provinces/districts/subdistricts, car brands/models/colors, vehicle types)

  2. Passport / National-ID numbers and document blobs are stored encrypted via `CryptoService`; a deliberate read produces decrypted cleartext only inside the owning service
  3. Every PII read/write writes an `audit_logs` row (actor, action, subject, timestamp); a PII-read audit check passes
  4. No secret literals exist in source; CI secret-scanning is wired and fails on a planted secret; secrets resolve from env/KMS

**Exit gate**: PII encryption round-trip + audit-row-per-PII-access tests green; CI secret-scan blocks a planted secret.
**Plans**: 3 plans
Plans:

- [x] 02-01-PLAN.md — Prisma 7 install + schema shell (generator/datasource/enums), CryptoService + KeyProvider + blind-index (TDD unit), OrderState drift guard, integration vitest project, .env.example + USER-SETUP.md
- [x] 02-02-PLAN.md — Full schema (domain + 12 CMI master + User/Account + audit_logs + idempotency_keys) + [BLOCKING] initial migration, repository audit/blind-index spine, idempotent seed (integration) — 27 integration tests green
- [ ] 02-03-PLAN.md — gitleaks CI secret-scan (license-free binary) + Postgres service container + planted-secret human-verify

### Phase 3: Identity & Vehicle Capture (fakes)

**Goal**: An agent can capture a Lead, convert to Customer, run OCR (fake adapter) producing a raw OcrResult, and reach validated identity + vehicle only through pure validators and an explicit human-verify gate.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: CUST-01, CUST-02, CUST-03, CUST-04, CUST-07, VEH-01
**TDD-mandatory**: partial — the "raw OcrResult is never cleaned" contract and the human-verify gate are enforced and tested; identifier validation reuses Phase 1 pure validators (LLM never touches identifiers).
**Success Criteria** (what must be TRUE):

  1. An agent can capture a Lead (contact + intent) and convert it into a Customer
  2. An agent can attach an IdentityDocument (passport or national ID) and the fake `OcrModule.extract` returns a **raw** `OcrResult` (Zod-validated, never cleaned/normalized)
  3. An agent can capture a Vehicle (plate / chassis / engine); identifiers are accepted/rejected only by the pure format validators
  4. The flow **cannot advance** money/legal fields out of capture until a human verifies/corrects them; `verifiedBy` and the verification are recorded in `audit_logs`

**Exit gate**: OCR-adapter contract returns raw fields (structurally no LLM/identifier cleaning); human-verify gate blocks advancement without `verifiedBy`.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Pricing & Order Spine

**Goal**: From a verified Customer + Vehicle, produce a table-driven Premium, lock an FxQuote, create an Order governed by the live state machine, and issue an Invoice charged from the stored quote.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: FX-04, ORD-01, ORD-03, ORD-04
**TDD-mandatory**: YES — FxQuote locking/TTL, charging the stored quote (never a re-fetch), and the Order/Invoice transitions are money-critical.
**Success Criteria** (what must be TRUE):

  1. `FxModule.quote(market, premiumThb)` returns a **locked, time-stamped** FxQuote with `quotedAt`/`expiresAt`; an expired quote forces a re-quote via the state machine, never a silent re-rate
  2. An agent can create an Order for a Customer + Vehicle + Premium; `Order.state` is written **only** by `OrderService.transition` through the pure table
  3. The Order models failure states (OCR/payment/cert-gen failed) and a refund path reachable only after `PAID`
  4. An Invoice is generated whose total is read from the stored FxQuote (never recomputed at issue/charge time)

**Exit gate**: payment/charge reads the stored FxQuote, not a re-fetch; expired-quote re-quote guard tested; illegal Order transitions throw.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Payment (fakes)

**Goal**: Collect Payment through one Market-routed interface on a fake provider whose webhook is idempotent, ordering-safe, and the sole source of money truth.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: PAY-01, PAY-02, PAY-03
**TDD-mandatory**: YES — webhook idempotency, out-of-order handling, redirect-never-mutates, and Market→provider+currency routing are all critical-path tests.
**Success Criteria** (what must be TRUE):

  1. `PaymentModule.charge` routes by Market to exactly one provider + collection currency; a mismatched currency throws (no ~1000x error)
  2. Delivering the same webhook event twice produces exactly one Payment, one Order transition, one downstream effect (idempotency key on `(provider, eventId)`)
  3. An out-of-order event (stale `failed` after `captured`) is a legal no-op via state guards, not corruption
  4. The redirect/return path only shows a "confirming payment" UI and never mutates money state; the webhook alone transitions the Order to `PAID`

**Exit gate**: same-event-twice, out-of-order, and redirect-before-webhook tests green; currency-mismatch throws.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Certificate Issuance & Refund Path (fakes)

**Goal**: Issue a Certificate for a PAID Order via the manual-upload adapter with a field-match check and per-Order idempotency, completing one paid, certificate-issued Order on fakes; issuance failure routes to refund.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: CERT-01, CERT-02, CERT-03, CERT-04
**TDD-mandatory**: partial — issuance-fail→refund transition, field-match, and per-Order idempotency toward the insurer are tested; CERT-04 is the AI-agent adapter **contract/stub only** (real issuance + human gate lands in Phase 10).
**Success Criteria** (what must be TRUE):

  1. A PAID Order can be issued a Certificate via `CertificateModule` using the manual adapter (key into insurer system → upload PDF into the Order)
  2. The Certificate records mandatory first-class fields: named insured, vehicle identifiers, insurer + policy number, coverage class/limits, effective + expiry dates
  3. Issuance **verifies the certificate's key fields match the Order** before transitioning to `COMPLETED`; a per-Order idempotency token prevents double-issuance
  4. An issuance failure after payment routes to the modelled refund path (money-taken-no-cover cannot dead-end); the AI-agent issuance adapter exists behind the same interface as a stub with a human-approval gate placeholder
  5. **End-to-end on fakes:** one Lead becomes a Customer, gets quoted, paid, and certificate-issued, with a complete audit trail

**Exit gate**: full fakes vertical slice produces one paid, certificate-issued Order; issuance-fail→refund + field-match + per-Order idempotency tests green.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Admin Back Office & Templated Messaging (fakes)

**Goal**: Stand up authentication + RBAC and a Next.js admin to log in, manage the proven slice and users, and send templated customer notifications via a fake messaging adapter.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: ADMIN-01, ADMIN-03, MSG-01, AUTH-01, AUTH-02, AUTH-03, AUTH-04
**TDD-mandatory**: partial — RBAC authorization checks are correctness-critical and tested; admin CRUD over existing tested services; messaging is templated send on a fake adapter.
**Success Criteria** (what must be TRUE):

  1. A user can log in with a secure session; RBAC enforces roles ADMIN/STAFF/PARTNER/CUSTOMER so each role sees only permitted data/actions (AUTH-01/02); STAFF can log in to process Orders (AUTH-04)
  2. Admin can view and manage Orders, Invoices, Payments, and Certificates, with the locked FxQuote and human-confirmed fields surfaced
  3. Admin can **manage user accounts** — create/disable accounts and assign roles (AUTH-03)
  4. Admin can view `audit_logs`
  5. `MessagingModule.send(customer, templateId, vars)` delivers a templated notification on the fake adapter with minimal PII (no identifiers leaked into templates)

**Exit gate**: login + RBAC enforced (unauthorized role blocked, tested); admin renders the live slice and can manage users; templated send carries no identifiers/PII.
**Plans**: TBD
**UI hint**: yes

### Phase 8: Partners & Commission

**Goal**: Register Partners, attribute Orders to them, and accrue tier-ladder Commission (against the THB base) only on successfully-issued Orders, reversing on refund.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: PART-01, PART-02, ADMIN-02
**TDD-mandatory**: YES — commission accrual timing, base currency, and boundary correctness (COMM-01/COMM-02 math proven in Phase 1) are money paths; verify accrual guards here.
**Success Criteria** (what must be TRUE):

  1. An agent can register a Partner and attribute an Order to that Partner
  2. Commission accrues only via a guarded transition off the terminal successfully-issued state (no commission on failed/refunded Orders); a refund reverses accrual
  3. Admin can view and manage Partners and their Commission

**Exit gate**: no commission row on failed/refunded Orders; refund reverses accrual; admin shows partner commission.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Renewals

**Goal**: Detect expiring Certificates and drive reminder-based Renewals that produce a new Order with a fresh FxQuote — never a silent auto-charge.
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: REN-01, REN-02, REN-03
**TDD-mandatory**: partial — the "new Order + fresh quote, never auto-charge" invariant is enforced; BullMQ scan/cadence is a standard pattern.
**Success Criteria** (what must be TRUE):

  1. `RenewalModule.scan` detects Certificates approaching expiry and creates a Renewal opportunity
  2. Starting a Renewal produces a **new Order with a fresh FxQuote** (re-quoted, never silently auto-charged)
  3. Renewal reminders are sent on a defined cadence (e.g. 60/30/14 days before expiry) via the messaging interface

**Exit gate**: renewal produces a new re-quoted Order with no auto-charge; reminder cadence fires on schedule.
**Plans**: TBD

### Phase 10: Real Adapters & Cross-Border Compliance Go-Live

**Goal**: Swap fake adapters for real providers one file each, add AI-agent certificate issuance with a human gate, and clear the cross-border compliance go-live gate.
**Mode:** mvp
**Depends on**: Phase 9
**Requirements**: PAY (live adapters realize PAY-01..03), CUST-04 (live OCR realizes), CERT-04 (live AI issuance), MSG-02, SEC-04
**TDD-mandatory**: partial — re-verify idempotency/out-of-order/signature-verification against each real provider's delivery semantics; keep the human gate on AI issuance.
**Research flags**: Phapay has **no public SDK** — obtain first-party API docs + sandbox creds before building (direct REST); WhatsApp Cloud API needs a pinned Graph version + signature specifics; the Certificate phase's mandatory fields/template must be **confirmed with the insurer**; cross-border PDPA 28/29 + Lao Law 25/NA basis is **legal-counsel territory**. Recommend `/gsd:plan-phase --research-phase`.
**Success Criteria** (what must be TRUE):

  1. Real OCR (Google Vision), Payment (Phapay LAK / Omise THB), and Messaging (WhatsApp/LINE) adapters are selectable by env/Market with **zero OrderModule changes**; each adapter verifies the provider signature and Zod-parses before normalizing
  2. The customer-facing chatbot answers using glossary terms and **never performs identifier validation** (MSG-02)
  3. The AI-agent certificate issuance adapter issues from stored Order data behind a **human approval gate** on legal/money fields (CERT-04)
  4. Customer consent is captured before identity capture and the cross-border data-residency basis (PDPA / Lao Law 25) is documented and legally signed off as the go-live gate (SEC-04)

**Exit gate**: each real adapter swaps with no business-logic change and passes idempotency/signature tests; consent + residency legal sign-off recorded before any real customer/PII flow.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Money/Legal Cores | 4/4 | Complete   | 2026-06-07 |
| 2. Encrypted Data Layer & Audit Spine | 2/3 | In Progress|  |
| 3. Identity & Vehicle Capture (fakes) | 0/TBD | Not started | - |
| 4. Pricing & Order Spine | 0/TBD | Not started | - |
| 5. Payment (fakes) | 0/TBD | Not started | - |
| 6. Certificate Issuance & Refund Path (fakes) | 0/TBD | Not started | - |
| 7. Admin Back Office & Templated Messaging (fakes) | 0/TBD | Not started | - |
| 8. Partners & Commission | 0/TBD | Not started | - |
| 9. Renewals | 0/TBD | Not started | - |
| 10. Real Adapters & Cross-Border Compliance Go-Live | 0/TBD | Not started | - |
