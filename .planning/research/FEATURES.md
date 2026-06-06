# Feature Research

**Domain:** Cross-border (Laos ↔ Thailand) vehicle insurance purchase platform / insurtech distribution
**Researched:** 2026-06-06
**Confidence:** MEDIUM-HIGH (insurtech patterns, COI contents, commission models, renewal behavior all corroborated by multiple sources; Lao↔Thai regulatory specifics are MEDIUM — verify the exact insurer-issued Certificate fields with the actual insurer partner before building the issuance adapter)

> Vocabulary note: this document uses the authoritative glossary terms throughout — **Lead,
> Customer, Vehicle, IdentityDocument, OcrResult, Order, Invoice, PaymentAttempt, Payment,
> Certificate, Renewal, Partner, Commission, Premium, FxQuote, Market**. Feature names map to
> these so requirements definition can carry them straight into Prisma/NestJS/API/UI.

## Domain context that shapes the feature set

- The product sells **Thai vehicle cover to a Lao buyer**. In practice that means the
  cross-border slice is most likely **voluntary / third-party (and CMI "Por Ror Bor")
  motor cover** that Lao-registered vehicles need to drive into Thailand — Thai insurers
  will *not* comprehensively cover foreign-plated vehicles, so the saleable product is a
  bounded, fixed-rate-ish cover, not full comprehensive underwriting. This is good for an
  MVP: the **Premium is largely table-driven, not risk-underwritten**.
- The legally meaningful artifact is the **Certificate** — it is the proof carried in the
  vehicle and shown at the border. The platform does **not** issue it; the **external
  insurer system** issues it. Phase 1 bridges via manual key-in + PDF upload.
- Because it is cross-border, the load-bearing differentiator is **money correctness**:
  Premium standard in **THB**, converted **THB → LAK at source rate +15 kips, rounded up**,
  locked into an **FxQuote**. A wrong number is real money / legal exposure.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the business does not function — you cannot sell or prove cover.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Quote / Premium calculation** | No customer buys without knowing the price first | MEDIUM | Premium standard in THB; table-driven by cover type + Vehicle class. Pure, deterministic, TDD'd. Feeds FxQuote. |
| **FxQuote (THB→LAK conversion, locked)** | Lao customer pays in LAK; price must be honored at checkout | HIGH | +15 kips, round up, direction-aware, time-stamped + locked. Single most error-prone money path — TDD mandatory. The cross-border core. |
| **Identity capture (IdentityDocument)** | Insurance is regulated; insurer needs the named insured's verified identity | MEDIUM | Passport / national ID. Stored encrypted at rest, access audit-logged. PII handling is non-negotiable for a regulated domain. |
| **OCR auto-extract (OcrResult)** | Manual key-in of passport/ID is slow and error-prone; agents expect assist | MEDIUM | OcrResult is **raw, never "cleaned"**. Identifiers validated by **pure validators**, never the LLM. Adapter-stubbed in Phase 1. |
| **Vehicle capture (plate / chassis / engine)** | Cover is bound to a specific vehicle; certificate must name it | LOW-MEDIUM | Format-validated identifiers via pure validators. No external lookup needed for MVP. |
| **Order (state machine)** | A purchase is a multi-step transaction that can fail at any step | MEDIUM-HIGH | Only legal transitions; failure states explicitly modelled. The spine the whole slice hangs on. TDD. |
| **Invoice generation** | Billing record; tax/audit/customer record expectation | LOW-MEDIUM | One Invoice per Order. Carries currency + locked FX amounts. |
| **Payment collection (PaymentAttempt → Payment)** | No payment, no sale | HIGH | One interface over **Phapay (LAK)** + **Opn/Omise (THB)**, routed by **Market**. Webhooks **idempotent**. PaymentAttempt may fail/retry → Payment on capture. |
| **Certificate issuance (proof of cover)** | The legal deliverable — the whole point of the purchase | MEDIUM (manual) / HIGH (AI later) | Via `CertificateModule` adapter: manual key-in + PDF upload now. Must capture the mandatory COI fields (see below). |
| **Renewal (detect expiry → drive renewal)** | Motor cover lapses; an uninsured customer at the border is a failure | MEDIUM | Detect expiring Certificate, generate Renewal as a new Order. Reminder cadence below. |
| **Refund / cancellation handling** | Payments fail, customers cancel, mistakes happen — money must be reversible | MEDIUM | Even if rare, the Order state machine must model cancelled/refunded states or you get stuck money. Refund execution can be manual/admin in MVP, but the *state* must exist. |
| **Admin back office** | Staff must view/manage Orders, Payments, Certificates, Partners, audit logs | MEDIUM | This **is** the Phase 1 UI (agent-assisted; no public self-serve yet). |
| **Audit logging** | Regulated domain — PII access and money events must be traceable | MEDIUM | `audit_logs`; required for compliance posture, not optional. |

#### What a Certificate (proof of cover) must contain

Drawn from standard COI / motor certificate requirements; **confirm exact fields with the
issuing insurer** before building the manual key-in form and the later AI adapter:

- **Named insured** — legal name of the Customer (the policyholder).
- **Vehicle identification** — registration/plate, chassis (VIN), engine number, make/class.
- **Insurer (carrier) name** and, where applicable, license/registration number.
- **Policy / Certificate number** — unique identifier from the insurer system.
- **Coverage type / class** (e.g. CMI "Por Ror Bor", third-party voluntary class).
- **Coverage limits** — per-claim / aggregate liability and medical limits.
- **Effective date and expiry date** (drives the Renewal trigger).
- **Premium amount** (and currency) — should reconcile to the FxQuote on the Order.
- **Issue date** and authorized signature / insurer seal (on the uploaded PDF).

> Storing effective/expiry dates as first-class fields on Certificate is what makes Renewal
> detection cheap — do not bury them only inside the uploaded PDF.

### Differentiators (Competitive Advantage)

Where this product actually wins. These align with the Core Value (correct cross-border money + a complete certificate-issued transaction).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Cross-border FX pricing (THB→LAK, +15 kips, round up)** | The defining feature — nobody else does Lao-buyer→Thai-cover money math correctly and transparently | HIGH | This is the moat. Lock FX into FxQuote so the quoted LAK is the charged LAK. |
| **OCR auto-fill of identity + vehicle** | Cuts agent key-in time and error on passports/plates; faster onboarding | MEDIUM | OcrResult raw; validators do the trust. Adapter swap from fake→real is one module. |
| **AI-agent certificate auto-issuance (later)** | Removes the manual key-in bottleneck into the external insurer system | HIGH | Phase 1 = manual upload; AI agent acts on stored data later. Behind the same `CertificateModule` interface — anti-feature to attempt in MVP. |
| **Partner referrals + tiered Commission** | Distribution leverage — agents/partners drive volume in a relationship-driven market | MEDIUM-HIGH | Attribute Order → Partner; Commission via tier ladder (volume thresholds, per-order amounts). TDD. See commission model below. |
| **WhatsApp / LINE messaging flows** | These are *the* messaging channels in Laos/Thailand — email is not where customers live | MEDIUM | MessagingModule, templated notifications. Renewal reminders + payment/issuance confirmations are the highest-value templates. |
| **Customer chatbot** | Self-serve answers, status checks, in the customer's channel | MEDIUM | Uses glossary terms; **never touches identifier validation**. Defer until self-serve phase. |
| **Multi-Market routing (TH / LA)** | Architecture for reverse + future flows without rewrites | MEDIUM | Market drives payment provider + FX direction. Model now, build first slice only. |

#### Partner / Commission model (insurance distribution norms)

Insurance distribution overwhelmingly uses **percentage-of-premium commission, tiered, with
new-business vs renewal split**:

- **New business** typically pays a higher rate than **renewals** (industry motor: ~10–15%
  new, ~8–12% renewal). Model Commission so new vs renewal rates can differ.
- **Volume tiers / ladders**: higher cumulative premium volume → higher payout rate, or
  per-order bonuses past thresholds. The brief specifies a tier ladder (volume thresholds,
  per-order amounts) — support both percentage and flat per-order forms.
- **Retention/contingency bonuses** exist in the wider industry but are an **anti-feature for
  MVP** (over-engineering). Keep the ladder to: tier by volume → rate/amount per Order.
- Commission is computed off the **Premium** (THB standard), not the FX-converted LAK, to
  keep partner economics stable — confirm this commercial decision, but it is the safer default.

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full risk-based underwriting engine** | "Real insurers underwrite" | Cross-border cover here is fixed-rate / table-driven; an underwriting engine is huge and unnecessary | Table-driven Premium by cover class + Vehicle class |
| **Claims management / FNOL** | "It's insurance, claims belong here" | Claims are handled by the **insurer**, not the distribution platform; massive scope, separate lifecycle | Out of scope; point customers to insurer claims process |
| **Real external integrations in Phase 1 (OCR/Pay/Msg/Cert)** | "Make it real now" | Couples the testable spine to flaky third parties and live PII/money | Stub behind adapters (fakes); swap to real later — already the decided strategy |
| **Customer self-serve web in Phase 1** | "Customers should buy themselves" | Adds public auth/UX/abuse surface before the spine is proven | Agent-assisted back office first; self-serve after spine works |
| **AI-agent certificate auto-issuance in Phase 1** | "Automate the bottleneck" | Acting on the external insurer system unattended is high-risk before manual path is proven | Manual key-in + PDF upload; same `CertificateModule` interface |
| **Silent auto-renewal (charge without confirmation)** | "Frictionless retention" | Unreviewed auto-renew → overpay/disputes; FX changes between terms; trust damage | Reminder-driven Renewal as a new confirmed Order; require re-quote (new FxQuote) |
| **Multi-currency wallet / stored balance** | "Convenience" | Money-services regulatory burden, reconciliation complexity | Charge per Order via Payment providers; no stored value |
| **Letting the LLM/chatbot validate identifiers** | "It read the doc, let it judge" | LLMs hallucinate; identifiers are money/legal-critical | Pure validators only; LLM/OCR produce raw OcrResult, validators decide |
| **Generic email-first notifications** | Default for most apps | Wrong channel for Laos/Thailand; low open rates | WhatsApp/LINE templated flows first |
| **Contingency/profit-share commission bonuses** | "Reward top partners" | Needs book-profitability data the platform doesn't have | Volume-tier ladder only for now |

---

## Feature Dependencies

```
Lead ──converts──> Customer
                      └──> IdentityDocument ──OCR──> OcrResult ──(pure validators)──> validated identity
                      └──> Vehicle (format-validated identifiers)

Premium (THB, table-driven)
    └──requires──> FxQuote (THB→LAK, +15 kips, round up, locked)
                       └──requires──> Order (state machine)
                                          └──requires──> Invoice
                                                            └──requires──> PaymentAttempt ──capture──> Payment
                                                                                                          └──requires──> Certificate (proof of cover)
                                                                                                                            └──drives──> Renewal (on expiry)

Order ──attributed-to──> Partner ──(tier ladder)──> Commission
Market ──routes──> Payment provider (Phapay LAK / Opn-Omise THB)
Market ──determines──> FxQuote direction
MessagingModule ──enhances──> Certificate issuance (confirm), Renewal (reminders), Payment (receipt)
Chatbot ──enhances──> Customer (status, Q&A)   [never touches identifier validation]
```

### Dependency Notes

- **FxQuote requires Premium:** you cannot lock a LAK price without the THB standard first.
- **Order requires FxQuote:** the Order must carry a locked price; an unlocked quote = drift.
- **Payment requires Invoice requires Order:** billing and money flow off the Order spine; the
  state machine is the gatekeeper for legal transitions and failure states.
- **Certificate requires Payment:** proof of cover is issued only after money is captured
  (this is the central business invariant — do not issue on unpaid Orders).
- **Renewal requires Certificate:** detection keys off the Certificate's effective/expiry
  dates; each Renewal is a *new Order* (re-quote → new FxQuote, because FX moves).
- **Commission requires Order + Partner:** attribution happens at/within the Order; Commission
  is computed from Premium via the tier ladder (new vs renewal aware).
- **Messaging enhances multiple stages:** it is cross-cutting, not on the critical purchase
  path — the spine must work with Messaging stubbed.
- **Chatbot conflicts with identifier validation:** explicitly walled off; validators own truth.

---

## MVP Definition

### Launch With (v1 — Phase 1: agent-assisted back-office spine, all externals stubbed)

- [ ] **Lead → Customer** — entry point of every transaction
- [ ] **IdentityDocument + OcrResult (stubbed OCR) + pure validators** — regulated identity, no LLM trust
- [ ] **Vehicle capture with format-validated identifiers** — cover is vehicle-bound
- [ ] **Premium (THB, table-driven)** — price source of truth
- [ ] **FxQuote (THB→LAK, +15 kips, round up, locked)** — the load-bearing money feature
- [ ] **Order state machine (legal transitions + failure states)** — the spine
- [ ] **Invoice** — billing record carrying locked FX amounts
- [ ] **PaymentAttempt → Payment (one interface, stubbed providers, idempotent webhooks)** — money in
- [ ] **Certificate via CertificateModule (manual key-in + PDF upload, stubbed)** — proof of cover with mandatory fields
- [ ] **Partner attribution + Commission tier ladder** — distribution economics (TDD)
- [ ] **Renewal detection (expiry → new Order)** — coverage continuity
- [ ] **Admin: view/manage Orders, Payments, Certificates, Partners, audit logs** — the Phase 1 UI
- [ ] **Audit logging + PII encryption at rest** — compliance floor

### Add After Validation (v1.x)

- [ ] **Real adapters: OCR, Payment (Phapay/Opn-Omise), Messaging, Certificate** — swap fakes once spine proven
- [ ] **WhatsApp/LINE renewal reminders + payment/issuance confirmations** — highest-value templates first
- [ ] **Customer self-serve web** — once back-office path is reliable
- [ ] **Refund execution flow (beyond modelled state)** — automate admin refunds

### Future Consideration (v2+)

- [ ] **AI-agent certificate auto-issuance** — automate the insurer-system bottleneck after manual path is solid
- [ ] **Customer chatbot** — self-serve Q&A/status in WhatsApp/LINE
- [ ] **Reverse + additional Markets (TH→LA, etc.)** — modelled via Market, built per slice
- [ ] **Volume/retention commission bonuses** — only with the data to support them

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| FxQuote (THB→LAK money math) | HIGH | HIGH | P1 |
| Order state machine | HIGH | HIGH | P1 |
| Payment (one interface, idempotent) | HIGH | HIGH | P1 |
| Certificate issuance (manual) | HIGH | MEDIUM | P1 |
| Identity + OCR + validators | HIGH | MEDIUM | P1 |
| Vehicle capture | HIGH | LOW | P1 |
| Premium (table-driven) | HIGH | MEDIUM | P1 |
| Invoice | MEDIUM | LOW | P1 |
| Partner + Commission ladder | MEDIUM | MEDIUM | P1 |
| Renewal detection | MEDIUM | MEDIUM | P1 |
| Admin back office | HIGH | MEDIUM | P1 |
| Audit + PII encryption | HIGH | MEDIUM | P1 |
| Real provider adapters | HIGH | MEDIUM | P2 |
| WhatsApp/LINE flows | MEDIUM | MEDIUM | P2 |
| Self-serve web | MEDIUM | HIGH | P2 |
| AI-agent cert issuance | MEDIUM | HIGH | P3 |
| Chatbot | LOW-MEDIUM | MEDIUM | P3 |
| Additional Markets | MEDIUM | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | Igloo / Lexasure (SEA insurtech) | Roojai / CheckDi / Drive2Thai (Thai motor) | Our Approach |
|---------|----------------------------------|--------------------------------------------|--------------|
| Quote & instant issuance | Real-time quote → instant policy | Online Por Ror Bor + voluntary purchase | Table-driven Premium → manual Certificate now, automated later |
| KYC / identity | Digital KYC, partner-data prefill | Standard form key-in | OCR (OcrResult) + pure validators, encrypted PII |
| Cross-border FX | Not a focus (single-market) | Border-form add-ons, single currency | **THB→LAK locked FxQuote — our differentiator** |
| Payment | Multi-gateway, installments | Local Thai gateways/cards | Phapay (LAK) + Opn-Omise (THB), Market-routed |
| Distribution | Embedded / bank channels | Direct + agents | Partner referrals + tiered Commission |
| Messaging | App push / email | Email / SMS | WhatsApp/LINE (the regional channels) |

## Sources

- Insurtech platform feature sets / KYC / issuance: [HyperVerge KYC underwriting](https://hyperverge.co/blog/kyc-underwriting/), [Igloo digital insurance platform](https://iglooinsure.com/solution/digital-insurance-platform/), [Lexasure](https://lexasure.com/digital-insurance), [Riskcovry](https://www.riskcovry.com/), [Didit insurance IDV](https://didit.me/industries/identity-verification-insurance/)
- Certificate of insurance / motor certificate contents: [illumend — what a COI must include](https://www.illumend.ai/insurance-knowledge/what-must-be-included-in-a-certificate-of-insurance), [Bankrate — certificate of insurance](https://www.bankrate.com/insurance/car/certificate-of-insurance/), [Embroker — how to read a COI](https://www.embroker.com/blog/how-to-read-a-certificate-of-insurance/), [The General — COI vs POI](https://www.thegeneral.com/going-places/blog/car-insurance/what-is-coi-vs-poi/)
- Commission models: [Vertafore — commission structures](https://www.vertafore.com/resources/blog/insurance-commission-structures), [Sonant — agent commission structure 2026](https://www.sonant.ai/blog/insurance-agent-commission-structure), [Agentero — commission explained](https://agentero.com/blog/insurance-agent-commission-structure-explained)
- Renewal behavior: [The Lab — automate renewal & lapse notification](https://thelabconsulting.com/automate-insurance-policy-renewal-and-lapse-notification-processing/), [The Insurance Universe — grace periods & renewals](https://theinsuranceuniverse.com/grace-periods-and-policy-renewals/), [Progressive — car insurance renewal](https://www.progressive.com/answers/car-insurance-renewal/)
- Cross-border Lao↔Thai motor insurance: [Roojai — Por Ror Bor (CMI)](https://www.roojai.com/en/car-insurance/compulsory/), [Rider Chris — foreign vehicle insurance in Thailand 2026](https://riderchris.com/malaysia-vehicle-coverage-thailand/), [ASEAN Compulsory Motor Insurance](https://www.asean-cmi.com/), [ExpatDen — buy car insurance in Thailand as a foreigner](https://www.expatden.com/thailand/car-insurance/)
- OCR / identity auto-fill: [Prove — identity auto-fill for digital insurance](https://www.prove.com/blog/digital-insurance-enhancing-customer-experience-boosting-sign-ups-with-identity-auto-fill), [MST — OCR in insurance](https://mstusa.com/ocr-insurance/), [Unstract — best OCR for insurance docs 2026](https://unstract.com/blog/best-ocr-for-insurance-document-processing-automation/)

---
*Feature research for: cross-border (Laos↔Thailand) vehicle insurance purchase platform*
*Researched: 2026-06-06*
