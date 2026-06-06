# Project Research Summary

**Project:** super-care
**Domain:** Cross-border (Laos ↔ Thailand) vehicle insurance distribution platform — money/FX, PII identifiers, payments, certificate issuance
**Researched:** 2026-06-06
**Confidence:** HIGH on stack/architecture/engineering-pitfalls; MEDIUM on regional regulatory + provider specifics (Phapay API, exact insurer Certificate fields, cross-border PDPA/Law-25 basis)

## Executive Summary

super-care is an insurtech **distribution** platform (not a carrier): a Lao customer buys Thai vehicle cover end-to-end — capture identity + vehicle via OCR, price the **Premium in THB**, convert to **LAK at checkout (+15 kips on the per-THB source rate, rounded up)**, take **Payment**, and bridge to an **external insurer system** to issue the **Certificate**. The cross-border slice is effectively fixed-rate / table-driven cover (CMI "Por Ror Bor" + voluntary third-party), so there is **no risk-underwriting engine** — the Premium is a lookup, and the genuine difficulty is **money correctness and transaction integrity**, not actuarial math. The core value is one paid, certificate-issued cross-border transaction with correct money math, because a wrong Premium, FX conversion, or identifier is real money or legal exposure.

Experts build this as a **NestJS deep-module / ports-and-adapters** system on the already-fixed stack (Node 22, pnpm monorepo, TS strict, Prisma, Zod, `packages/shared`). Every external (OCR, Payment, Certificate, Messaging, FX rate source) sits behind a port with a DI-token-selected adapter, so **Phase 1 ships entirely on fakes** and real providers swap in one file each later. The transaction spine is an **Order state machine as a pure transition table** (the only writer of `Order.state`), and all money/legal-critical logic — FX math, Thai-ID checksum, identifier validators, commission ladder, the transition table, webhook idempotency — lives as **pure functions in `packages/shared`, TDD-mandatory**. Recommended supporting libraries: XState (state machine), big.js + Prisma `Decimal` (money, never float), Vitest (one test runner), pdf-lib (fill insurer template), BullMQ (renewals/webhook/retry jobs), nestjs-zod (boundary validation), prisma-field-encryption + KMS (PII at rest).

The dominant risks are all **correctness/compliance, not scale**: float money drift (off-by-one-kip reconciliation failures), FX markup applied in the wrong direction/base, stale/unlocked quotes charged at a re-fetched rate, currency-vs-Market routing mismatches (~1000x errors), non-idempotent payment webhooks (double-charge/double-issue), an Order state machine that omits failure/refund states (money taken, no cover, no recovery), and — load-bearing — **letting any LLM/OCR "clean" or validate identifiers** (a silently-corrected ID = legally void cover). Mitigation is baked into the architecture: pure TDD'd validators that the LLM never touches, locked time-stamped `FxQuote`, idempotency-key table, explicit refund transition from day one, currency carried as a typed unit, PII encrypted + audit-logged, and consent captured before document capture. A cross-border data-residency / KYC legal basis (Thai PDPA 28/29, Lao Law 25/NA) is a go-live gate requiring legal counsel.

## Key Findings

### Recommended Stack

The fixed stack is not re-litigated; research is prescriptive about the supporting libraries that bolt onto it (all versions verified against npm on 2026-06-06). The through-line: pure, deterministic, testable cores for anything touching money or identifiers; thin adapters for everything external. See `STACK.md`.

**Core technologies:**
- **XState `^5.32.0`** — Order lifecycle FSM — declarative, serializable transition table that is unit-testable as a pure function; use headless (`createMachine` + `transition`), keep side effects in the NestJS service layer.
- **big.js `^7.0.1` + Prisma `Decimal`** — all money/FX/commission math and storage — immutable decimals with explicit rounding (`ceil` for round-up); **never** `number`/`Float`/`Double`.
- **Vitest `^4.1.8`** (+ `@nestjs/testing`, supertest, Playwright) — one TDD runner across api/shared/web; avoids the ts-jest transform tax.
- **nestjs-zod `^5.4.0` + zod `^4.4.3`** — Zod schemas in `packages/shared` validate every untrusted boundary (bodies, OCR output, webhooks, chat), shared by api + web. *Verify nestjs-zod@5 targets Zod 4.*
- **BullMQ `^5.78.0` + @nestjs/bullmq + ioredis** — renewals (repeatable jobs), fast-ack webhook processing, outbound messaging retries.
- **pdf-lib `^1.17.1`** — fill/stamp the insurer's Certificate template (matches the manual-upload bridge model). *Choice depends on whether a fixed insurer template exists.*
- **@google-cloud/vision `^5.3.7`**, **omise `^1.1.0`** (THB), **@line/bot-sdk `^11.0.1`**, **libphonenumber-js** — official clients behind adapters; **Phapay (LAK) and WhatsApp Cloud API have no usable SDK -> direct REST via Nest HttpModule**.
- **prisma-field-encryption `^1.6.0` + @aws-sdk/client-kms** — transparent PII field encryption at rest. *Verify Prisma 7 compatibility.*

### Expected Features

The product sells bounded, table-driven cross-border cover; the legal artifact is the insurer-issued **Certificate**, which the platform bridges to (manual key-in + PDF upload now). See `FEATURES.md`.

**Must have (table stakes):**
- Lead -> Customer; Premium (THB, table-driven); **FxQuote (THB->LAK, +15 kips, round up, locked)** — the load-bearing money feature
- Identity capture + OCR (`OcrResult` raw) + pure validators; Vehicle capture (format-validated plate/chassis/engine)
- Order state machine (legal transitions + failure states); Invoice; PaymentAttempt -> Payment (one interface, Market-routed, idempotent webhooks)
- Certificate issuance (manual, with mandatory COI fields incl. effective/expiry as first-class dates); Refund/cancellation **states** (execution can be manual in MVP)
- Admin back office (the Phase 1 UI); audit logging + PII encryption at rest

**Should have (competitive):**
- **Cross-border FX pricing (THB->LAK, locked FxQuote)** — the defining moat
- OCR auto-fill of identity + vehicle (advisory, human-confirmed); Partner referrals + tiered Commission; WhatsApp/LINE templated flows (the regional channels); multi-Market routing modelled now

**Defer (v2+):**
- Real provider adapters (swap fakes once spine proven); customer self-serve web; AI-agent certificate auto-issuance; customer chatbot; reverse/additional Markets; volume/retention commission bonuses

**Explicit anti-features:** full risk-based underwriting, claims/FNOL management, real external integrations in Phase 1, silent auto-renewal, multi-currency wallet, generic email-first notifications, and any LLM/chatbot identifier validation.

### Architecture Approach

NestJS deep modules with narrow public interfaces; each external is a **port + DI-token-selected adapter** (fakes in Phase 1, real later, one-file swap). The **OrderModule is the sole orchestrator and sole writer of `Order.state`**, driving leaf capability modules. Pure logic (FX math, validators, commission, transition table) lives in `packages/shared`/`*.math.ts` with colocated specs — no I/O, no Nest dependency, reusable by web + api. Cross-cutting `common/` holds CryptoService (PII), AuditInterceptor, the Zod pipe, and Prisma. See `ARCHITECTURE.md` for the full transition table and purchase-slice data flow.

**Major components:**
1. **OrderModule** — aggregate orchestrator + pure state machine; only writer of `Order.state`
2. **FxModule** — locked, time-stamped `quote(market, baseThb)`; hides rate feed + +15-kip/round-up/direction math
3. **PaymentModule** — `charge` routed by Market (Phapay LAK / Omise THB) + idempotent webhook normalization
4. **CertificateModule** — bridge to external insurer (manual-upload now, AI-agent later)
5. **OcrModule** (raw `OcrResult` only), **CommissionModule** (tier ladder), **MessagingModule** (templated WhatsApp/LINE), **RenewalModule** (scan expiring Certificates)
6. **Cross-cutting:** CryptoService (PII encryption), AuditInterceptor (`audit_logs`), `idempotency_keys` table, `packages/shared` validators/schemas

### Critical Pitfalls

Top failure modes (all correctness/compliance, not scale). See `PITFALLS.md` for all 15 + the "Looks Done But Isn't" checklist.

1. **Float money / wrong-direction FX / stale quote** — represent money as Decimal/integer minor units end-to-end (Prisma `Decimal`, never `Float`); all FX math only in `FxModule`, `+15 kips on the per-THB rate` then `ceil`, with a TDD table incl. the TH-collection no-conversion case; `FxQuote` is locked + time-stamped + TTL'd, and payment charges the **stored** amount, never a re-fetch.
2. **LLM/OCR "cleaning" or validating identifiers** — architecturally forbidden: `OcrResult` is raw, identifiers validated ONLY by pure functions in `packages/shared`; bake it into the OCR adapter contract so it is structurally impossible; chatbot barred entirely.
3. **Non-idempotent / out-of-order payment webhooks** — `idempotency_keys` unique on `(provider, eventId)`, persist-first then act, second delivery is a 200 no-op; webhook is the single source of truth (never the redirect); state machine rejects illegal/stale transitions.
4. **Order state machine without failure/refund states** — encode only legal transitions (illegal -> throw, tested); model OCR-failed, payment-failed, cert-failed, **and the refund path from PAID** from day one; Certificate issuable and Commission accrued only from the right guarded states.
5. **PII unencrypted / secrets in code / no consent / no audit** — encrypt ID numbers + document blobs at rest, env/KMS-managed secrets with CI secret-scanning, `audit_logs` row per PII access, timestamped consent before document capture; cross-border transfer legal basis (Thai PDPA 28/29, Lao Law 25/NA) confirmed with counsel before go-live.

## Implications for Roadmap

Research strongly converges on a **build order driven by dependency direction**: pure units -> persistence/cross-cutting -> leaf modules on fakes -> Order orchestrator -> end-to-end slice -> admin UI -> commission/partners -> real adapters -> renewals/self-serve/AI. Phase 1 (per PROJECT.md) is the agent-assisted back-office vertical slice with all externals stubbed; later phases widen the platform.

### Phase 1: Foundation — Pure Cores + Data Layer
**Rationale:** TDD-mandatory pure logic has zero dependencies and every higher layer consumes it; a wrong FX/checksum is money/legal exposure, so get these green before any plumbing. Lock money representation before any amount is persisted.
**Delivers:** Monorepo + `packages/shared` skeleton + CI gate; pure validators (Thai-ID checksum, plate/chassis/engine), `fx.math`, `order.state-machine`, `commission.math`, all with vector-table specs; Prisma schema (Order, Customer, Vehicle, IdentityDocument, Invoice, Payment, Certificate, Partner, Commission, `audit_logs`, `idempotency_keys`); CryptoService + AuditInterceptor.
**Addresses:** Premium, FxQuote math, identity/vehicle validators, audit + PII encryption.
**Avoids:** Pitfalls 1, 2, 5, 6, 7, 10 (money rep, FX direction/rounding, identifier integrity, Thai-ID checksum, format validators, illegal transitions/refund), 14 (PII/secrets/audit).

### Phase 2: Leaf Modules on Fakes + Order Orchestrator + Vertical Slice
**Rationale:** Leaf modules expose interfaces the OrderModule composes, so they come before the orchestrator; fakes-before-real is the stated Phase 1 constraint and the port/adapter pattern makes later swaps one-file changes.
**Delivers:** FxModule, OcrModule, PaymentModule (charge + idempotent webhook, Market routing), CertificateModule (manual-upload), MessagingModule — all behind fake adapters; OrderModule wiring the state machine to the leaves; **end-to-end purchase slice: one paid, certificate-issued Order on fakes** (Phase 1 acceptance).
**Uses:** XState, big.js, nestjs-zod, BullMQ, pdf-lib (template fill), `idempotency_keys`.
**Implements:** Ports-and-adapters; idempotency-key pattern; OrderModule-as-sole-state-writer; Zod at every boundary.
**Avoids:** Pitfalls 3, 4, 8, 9, 11, 12 (stale quote, currency/Market mismatch, non-idempotent + out-of-order webhooks, redirect race, trusting raw OCR -> human-verify gate, cert-issuance-fail -> refund + field-match).

### Phase 3: Admin Back Office + Partners/Commission
**Rationale:** The admin web is the Phase 1 driver UI over the proven slice; Partner attribution + Commission widen economics and are a money path with their own TDD rigor but are not on the critical path to the core transaction.
**Delivers:** Next.js admin to view/manage Orders, Payments, Certificates, Partners, audit logs; Partner registration + Order attribution; CommissionModule tier ladder (new vs renewal aware).
**Addresses:** Admin back office, Partner + Commission features.
**Avoids:** Pitfall 13 (commission boundary errors, defined base currency = THB Premium, reversal on refund), reinforces 11 (UX: human-confirm money/legal fields, locked-quote display).

### Phase 4: Real Adapters (swap fakes)
**Rationale:** With the spine proven and self-contained, real providers land one adapter at a time with zero OrderModule changes — the payoff of the port pattern. This is where live PII/money/regulatory risk first enters.
**Delivers:** GoogleVision OCR, Phapay (LAK) + Omise (THB) payment adapters, WhatsApp/LINE messaging; pinned WhatsApp Graph API version; webhook signature verification per provider; cross-border consent + data-residency decision finalized; legal sign-off on Certificate validity (go-live gate).
**Uses:** @google-cloud/vision, omise, @line/bot-sdk, direct REST for Phapay + WhatsApp, libphonenumber-js, prisma-field-encryption + KMS.
**Avoids:** Pitfall 15 (cross-border legal basis), reinforces 8/9/12 against real provider delivery semantics.

### Phase 5: Renewals, Self-Serve Web, AI-Agent Issuance
**Rationale:** Coverage continuity and platform breadth come after the core transaction is reliable end-to-end; each Renewal is a new Order with a fresh FxQuote (re-quote, never silent auto-charge).
**Delivers:** RenewalModule (BullMQ scan of expiring Certificates -> reminder-driven new Order), customer self-serve web, AI-agent certificate auto-issuance (behind the same CertificateModule interface, with a human approval gate on legal/money fields).
**Addresses:** Renewals, self-serve, AI issuance.
**Avoids:** Re-introducing Pitfalls 5/11/12 at the AI-issuance boundary (keep human gate); reinforces "no silent auto-renewal" anti-feature.

### Phase Ordering Rationale
- **Dependency direction is the spine:** pure units unblock everything; OrderModule cannot exist before its leaf modules; fakes must precede real adapters (the stated constraint and the architecture's central payoff).
- **Architecture grouping:** each phase aligns to a deep-module layer (cores -> leaves -> orchestrator -> UI/economics -> real edges), so provider/UI work never touches business logic.
- **Pitfall avoidance:** the most-skipped, highest-cost items (float money, FX direction, refund path, webhook idempotency, identifier integrity, PII/audit) are forced into Phase 1-2 where they are cheap and TDD-gated, not retrofitted.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (real adapters):** **Phapay has no public SDK or verifiable API** — needs first-party API docs + sandbox credentials before building; WhatsApp Cloud API direct-REST needs a pinned Graph version; both need signature-verification specifics. `/gsd:plan-phase --research-phase` recommended.
- **Phase 4 (compliance gate):** cross-border PDPA 28/29 + Lao Law 25/NA transfer mechanism and data-residency decision are legal-counsel territory (MEDIUM confidence), not engineering.
- **Phase 2 (Certificate):** exact mandatory Certificate fields and whether a fixed insurer PDF template exists must be confirmed with the insurer partner (drives pdf-lib vs @react-pdf/renderer and the field-match check).

Phases with standard patterns (skip research-phase):
- **Phase 1:** pure validators, FX/commission math, state machine, Prisma schema — well-documented, fully specified by standards + this research.
- **Phase 3:** admin CRUD over the slice + tiered commission math — standard patterns; commission rigor is captured in PITFALLS.
- **Phase 5 (Renewals):** BullMQ repeatable jobs are a standard, well-documented pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against live npm 2026-06-06; LOW only where no usable SDK exists (Phapay, WhatsApp -> direct REST is the correct call) |
| Features | MEDIUM-HIGH | Insurtech patterns/COI/commission/renewal corroborated by multiple sources; exact Lao-Thai Certificate fields MEDIUM (confirm with insurer) |
| Architecture | HIGH | Constrained by committed standards; ports/adapters + state-machine + idempotency-key verified against NestJS official docs |
| Pitfalls | HIGH | Money/FX/identifier/webhook/state/security pitfalls verified against standards + algorithm/regulatory sources; cross-border legal application MEDIUM |

**Overall confidence:** HIGH for engineering the Phase 1 vertical slice; MEDIUM for the later real-integration + cross-border-compliance edges.

### Gaps to Address
- **Phapay API surface** (no SDK, unverifiable): obtain first-party docs + sandbox creds before Phase 4; Phase 1 fakes are unblocked.
- **Exact insurer Certificate fields + fixed PDF template?** confirm with insurer partner before building the manual key-in form and choosing pdf-lib vs @react-pdf/renderer.
- **Cross-border legal basis (PDPA / Law 25/NA) + data residency:** engage legal counsel; capture timestamped consent in Phase 1, treat legal validity sign-off as a go-live gate.
- **Commission base + tier semantics:** specify before coding — base = **THB Premium** (not LAK), and whether tiers are marginal or whole-volume (research recommends marginal/threshold with both-sides-of-boundary tests).
- **Version peer compatibility:** confirm `nestjs-zod@5` <-> Zod 4 and `prisma-field-encryption` <-> Prisma 7 at install.
- **PII crypto scheme:** decide column-AES-GCM vs envelope encryption + blind-index for identifier lookup (encrypted columns aren't queryable by value).

## Sources

### Primary (HIGH confidence)
- `docs/ENGINEERING-STANDARDS.md` A3 (TDD-critical paths), A4 (deep modules), A5 (boundary discipline/PII/secrets/audit), B (AI governance) — in-repo, authoritative
- `docs/GLOSSARY.md` — authoritative domain vocabulary; `.planning/PROJECT.md` — scope, FX rule, Phase 1 constraints, key decisions
- npm registry version verification (all packages), queried 2026-06-06
- NestJS Custom Providers (useClass/useFactory/injection tokens): https://docs.nestjs.com/fundamentals/custom-providers
- Thai National ID checksum algorithm (AiPrise, Wikipedia, GitHub gist)

### Secondary (MEDIUM confidence)
- Insurtech feature sets / KYC / COI contents / commission models / renewal behavior (HyperVerge, Igloo, Lexasure, Vertafore, illumend, Bankrate, The Lab)
- Cross-border Lao-Thai motor insurance (Roojai Por Ror Bor, ASEAN-CMI, ExpatDen, Rider Chris)
- Idempotent webhook / at-least-once delivery (Stripe/Omise docs pattern)

### Tertiary (LOW confidence — needs validation)
- Phapay API specifics — no public SDK/docs found; requires first-party documentation
- WhatsApp Cloud API "direct REST" recommendation — correct given SDK immaturity, but pin Graph API version explicitly
- Cross-border PDPA 28/29 + Lao Law 25/NA application — legal counsel required (Securiti, DLA Piper, Digital Watch)

---
*Research completed: 2026-06-06*
*Ready for roadmap: yes*
