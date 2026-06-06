# Architecture Research

**Domain:** Cross-border (Laos ↔ Thailand) vehicle insurance platform — regulated, money- and PII-sensitive
**Researched:** 2026-06-06
**Confidence:** HIGH (architecture is constrained by committed standards; ports-and-adapters, state-machine, and idempotency-key patterns are well-established and verified against NestJS official docs)

> This document defines the **concrete** structure: NestJS deep-module boundaries and their narrow
> public interfaces, the adapter/port pattern for each swappable external, the Order state machine
> transition table (incl. failure states), the purchase-slice data flow, where Zod validation sits,
> the webhook idempotency strategy, PII-encryption + audit_logs placement, and a build order the
> roadmap can phase. It operationalizes `docs/ENGINEERING-STANDARDS.md` §A4 (deep modules) and §A5
> (boundary discipline) using the `docs/GLOSSARY.md` vocabulary verbatim.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/web  (Next.js)                                                       │
│  ┌────────────────────────┐        ┌────────────────────────┐            │
│  │  Admin / back-office    │        │  Customer self-serve    │ (later)   │
│  │  (Phase 1 driver)       │        │                         │            │
│  └───────────┬────────────┘        └───────────┬────────────┘            │
└──────────────┼─────────────────────────────────┼───────────────────────────┘
               │  HTTP/JSON (Zod-validated bodies) │
┌──────────────▼─────────────────────────────────▼───────────────────────────┐
│  apps/api  (NestJS)                                                         │
│                                                                            │
│  ── HTTP boundary layer (Controllers + Zod pipes) ───────────────────────  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Order    │ │ Payment  │ │ Cert.    │ │ Partner  │ │ Webhook  │  ...      │
│  │ Ctrl     │ │ Ctrl     │ │ Ctrl     │ │ Ctrl     │ │ Ctrl     │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│       │            │            │            │            │                │
│  ── Deep modules (narrow public interface; complexity hidden) ───────────  │
│  ┌─────────┐┌─────────┐┌─────────┐┌──────────┐┌──────────┐┌──────────┐    │
│  │ Order   ││ Fx      ││ Ocr     ││ Payment  ││Certificate││Commission│    │
│  │ (orch.) ││ .quote  ││ .extract││ .charge  ││ .issue    ││ .compute │    │
│  └────┬────┘└────┬────┘└────┬────┘└────┬─────┘└────┬─────┘└────┬─────┘    │
│       │          │          │          │           │           │          │
│  ┌──────────┐┌──────────┐                                                  │
│  │Messaging ││ Renewal  │    each external module → PORT (interface)       │
│  │ .send    ││ .scan    │    PORT → ADAPTER(s) chosen by DI token          │
│  └────┬─────┘└────┬─────┘                                                  │
│       │           │                                                        │
│  ── Adapters (swappable; one provider = one file) ───────────────────────  │
│  Fx: SourceRate│Fake  Ocr: GoogleVision│Fake  Pay: Phapay│Omise│Fake       │
│  Cert: ManualUpload│AiAgent│Fake   Msg: WhatsApp│Line│Fake                 │
│                                                                            │
│  ── Cross-cutting ───────────────────────────────────────────────────────  │
│  PrismaService │ CryptoService (PII field encryption) │ AuditLog interceptor│
└──────────────┬─────────────────────────────────────────────────────────────┘
               │  Prisma
┌──────────────▼─────────────────────────────────────────────────────────────┐
│  PostgreSQL   (encrypted PII columns; audit_logs; idempotency_keys table)   │
└────────────────────────────────────────────────────────────────────────────┘

         packages/shared  ── Zod schemas · domain types · PURE validators
         (Thai-ID checksum, plate/chassis/engine, FX math) — imported by api AND web
```

### Component Responsibilities

| Component | Responsibility (what it OWNS) | Narrow public interface |
|-----------|-------------------------------|-------------------------|
| **OrderModule** | The aggregate orchestrator + **state machine**. Owns Order lifecycle; calls Fx/Payment/Certificate; the only writer of `Order.state`. | `create(input)`, `transition(orderId, event, payload)`, `get(orderId)` |
| **FxModule** | Locked, time-stamped FX quoting. Hides rate feed, +15-kip math, round-up, direction rule. | `quote(market, baseAmountThb) → FxQuote` |
| **OcrModule** | Extract raw fields from an IdentityDocument. Hides Vision calls + field routing. **Never returns cleaned identifiers.** | `extract(documentType, file) → OcrResult` |
| **PaymentModule** | Collect payment; route to provider by Market. Hides Phapay/Omise differences + webhook normalization. | `createInvoice(order)`, `charge(invoiceId) → PaymentAttempt`, `handleWebhook(rawEvent) → NormalizedPaymentEvent` |
| **CertificateModule** | Bridge to external insurer system. Hides manual-upload vs AI-agent issuance. | `issue(order) → Certificate`, `attachDocument(certId, file)` |
| **CommissionModule** | Tier-ladder math (volume thresholds, per-order amounts) + Partner attribution. Pure calc + persistence. | `compute(partnerId, order) → Commission`, `attribute(orderId, partnerId)` |
| **MessagingModule** | Templated customer notifications (WhatsApp/LINE). Hides channel APIs + template rendering. | `send(customerId, templateId, vars)` |
| **RenewalModule** | Detect expiring Certificates, drive Renewal. | `scan(asOfDate) → Renewal[]`, `start(certificateId) → Renewal` |
| **CryptoService** (cross-cutting) | Encrypt/decrypt PII columns; key handling from env. | `encrypt(plaintext)`, `decrypt(ciphertext)` |
| **AuditLog** (cross-cutting) | Record every PII access + state transition. | interceptor + `AuditService.record(actor, action, subject)` |
| **packages/shared** | Zod schemas, domain types, **pure validators** (Thai-ID checksum, plate/chassis/engine, FX math). No I/O. | exported pure functions + schemas |

**Boundary rule (load-bearing):** modules talk to each other **only through their published service methods using glossary types**. No module reaches into another's Prisma models. OrderModule is the only orchestrator; the others are leaf capabilities it composes.

---

## Recommended Project Structure

```
apps/api/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── crypto/crypto.service.ts          # PII field encryption (envelope/AES-GCM)
│   ├── audit/audit.interceptor.ts        # records PII access + transitions → audit_logs
│   ├── audit/audit.service.ts
│   ├── zod/zod-validation.pipe.ts        # parse untrusted bodies at controller boundary
│   └── prisma/prisma.service.ts
├── order/
│   ├── order.module.ts
│   ├── order.controller.ts               # Zod pipe on every body
│   ├── order.service.ts                  # orchestrator
│   ├── order.state-machine.ts            # PURE: states + transition table (TDD)
│   └── order.state-machine.spec.ts
├── fx/
│   ├── fx.module.ts
│   ├── fx.service.ts                     # FxModule.quote — narrow surface
│   ├── fx.math.ts                        # PURE +15 kip / round-up / direction (TDD)
│   ├── ports/rate-source.port.ts         # interface (token: RATE_SOURCE)
│   └── adapters/{source-rate,fake}.rate-source.adapter.ts
├── ocr/
│   ├── ocr.module.ts
│   ├── ocr.service.ts                    # OcrModule.extract
│   ├── ports/ocr.port.ts                 # token: OCR_PROVIDER
│   └── adapters/{google-vision,fake}.ocr.adapter.ts
├── payment/
│   ├── payment.module.ts
│   ├── payment.service.ts                # routes by Market; normalizes webhooks
│   ├── webhook.controller.ts             # idempotent ingestion
│   ├── ports/payment-provider.port.ts    # token: PAYMENT_PROVIDER (multi)
│   └── adapters/{phapay,omise,fake}.payment.adapter.ts
├── certificate/
│   ├── certificate.module.ts
│   ├── certificate.service.ts
│   ├── ports/certificate-issuer.port.ts  # token: CERT_ISSUER
│   └── adapters/{manual-upload,ai-agent,fake}.certificate.adapter.ts
├── commission/  (commission.math.ts PURE + TDD)
├── messaging/   (ports/messaging.port.ts; adapters whatsapp|line|fake)
├── renewal/
├── partner/
└── lead/  customer/  vehicle/  identity-document/

packages/shared/src/
├── schemas/        # Zod: OrderInput, OcrResult, WebhookEvent, FxQuote, ...
├── types/          # domain types (Market, Order states, ...)
└── validators/     # PURE: thai-id-checksum.ts, plate.ts, chassis.ts, engine.ts, fx.ts
                    # (+ .spec.ts each — TDD-critical, never touch the LLM)
```

### Structure Rationale

- **One folder per deep module**, each with `ports/` (interfaces) and `adapters/` (implementations). Provider swap = add/select an adapter file; nothing else changes (§A4).
- **Pure logic split into its own `*.math.ts` / `validators/*` file** with a colocated spec. These are the TDD-critical units (FX, Thai-ID checksum, commission, state machine). They have **no I/O and no Nest dependency**, so they unit-test in milliseconds and can live in `packages/shared` to be reused by `apps/web` (client-side format hints) and `apps/api` (authoritative validation).
- **`common/` holds cross-cutting concerns** (crypto, audit, zod pipe, prisma) so every module gets PII encryption + audit logging uniformly.
- **Validators live in `packages/shared`, not in OcrModule** — the standard is explicit that identifiers are validated by **pure validators, never the LLM/OCR**. OCR returns raw text; validation is a separate, deterministic, tested step.

---

## Architectural Patterns

### Pattern 1: Port + Adapter (Hexagonal) with DI-token selection

**What:** Each external dependency is an interface (port) injected by token; the concrete adapter is chosen at module-registration time (env / Market). Confirmed against NestJS official custom-providers docs: `useClass` / `useFactory` resolve a token to a class at runtime.

**When to use:** Every swappable external — Fx rate source, OCR, Payment, Certificate, Messaging.

**Trade-offs:** Tiny indirection cost; huge gain — Phase 1 ships entirely on fakes, real adapters land later with zero changes to OrderModule. Tests inject the fake adapter directly.

**Example:**
```typescript
// payment/ports/payment-provider.port.ts
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export interface PaymentProviderPort {
  readonly market: Market;
  charge(invoice: Invoice): Promise<PaymentAttempt>;
  parseWebhook(raw: unknown): NormalizedPaymentEvent; // Zod-validates inside
}

// payment.module.ts — Phase 1: fakes only; later: real providers per Market
providers: [
  PaymentService,
  { provide: PAYMENT_PROVIDER, useClass:
      process.env.PAYMENT_DRIVER === 'live' ? PhapayAdapter : FakePaymentAdapter },
]
// PaymentService receives ALL providers and routes: pick by order.market
```

### Pattern 2: State machine as a pure transition table, owned by OrderModule

**What:** `order.state-machine.ts` is a pure function `next(state, event) → state | throw`. `OrderService` is the only caller and the only writer of `Order.state`. Illegal transitions throw (and are tested, §A3).

**When to use:** The Order lifecycle, including all failure states.

**Trade-offs:** Slightly more ceremony than ad-hoc status flags, but it makes illegal states unrepresentable and gives a single tested source of truth for "what can happen next."

```typescript
// pure, exhaustively tested
export function next(state: OrderState, event: OrderEvent): OrderState {
  const t = TRANSITIONS[state]?.[event];
  if (!t) throw new IllegalTransitionError(state, event);
  return t;
}
```

### Pattern 3: Idempotency key for payment webhooks

**What:** A dedicated `idempotency_keys` table (unique on provider event id). Webhook handler `INSERT ... ON CONFLICT DO NOTHING`; if the row already existed, return 200 and **do no work**. Effect is applied exactly once even on replay/out-of-order delivery (§A3).

**When to use:** All inbound provider webhooks.

**Trade-offs:** One extra write per event; required for correctness — duplicate "payment captured" must not double-issue a Certificate or double-pay Commission.

```typescript
async handleWebhook(raw: unknown) {
  const event = WebhookEventSchema.parse(raw);        // Zod boundary
  const fresh = await this.claimIdempotencyKey(event.providerEventId);
  if (!fresh) return { received: true };               // replay → no-op
  await this.payment.applyEvent(event);                // single effect
}
```

### Pattern 4: PII encryption at the column boundary + audit interceptor

**What:** PII columns (passport number, national ID, document blobs) stored encrypted via `CryptoService` (AES-GCM with env-managed key; consider envelope encryption for key rotation). An `AuditInterceptor` records every read/write of a PII-bearing resource into `audit_logs` (actor, action, subject id, timestamp). Decryption happens only in the service that needs the cleartext, and that access is logged.

**When to use:** IdentityDocument, OcrResult raw fields, anything containing passport/national-ID/payment data.

**Trade-offs:** Encrypted columns are not queryable by value — store a separate **blind index / hash** if you must look up by identifier.

---

## Data Flow

### Purchase slice (the Phase 1 vertical) — direction explicit

```
Lead.create
   ↓ convert
Customer
   ↓
IdentityDocument.upload (file → encrypted blob; access → audit_logs)
   ↓  OcrModule.extract(docType, file)
OcrResult (RAW — never cleaned)
   ↓  packages/shared validators (PURE: Thai-ID checksum, passport format)
Validated identity fields
   ↓
Vehicle.create (plate/chassis/engine → PURE format validators)
   ↓
FxModule.quote(market, premiumThb)          # THB→LAK, +15 kip, round up, direction
   ↓ returns locked, time-stamped FxQuote
OrderModule.create(customer, vehicle, fxQuote, partner?)   # state: DRAFT
   ↓ transition QUOTED → AWAITING_PAYMENT
PaymentModule.createInvoice(order) → Invoice
   ↓ PaymentModule.charge(invoice) routed by Market (Phapay LAK / Omise THB)
PaymentAttempt → (async) provider webhook → idempotent handler → Payment
   ↓ Order.transition(PAID)
CertificateModule.issue(order)              # manual-upload adapter in Phase 1
   ↓
Certificate (legal proof) → Order.transition(COMPLETED)
   ↓ (if partner attributed) CommissionModule.compute → Commission
   ↓ MessagingModule.send(customer, "certificate_issued")
```

**Failure branches feed back into the state machine** (see transition table): OCR failure, payment failure, cert-gen failure, and refund are first-class states, not exceptions swallowed mid-flow.

### Where Zod boundary validation sits (every untrusted edge — §A5)

| Boundary | Schema | Where it runs |
|----------|--------|---------------|
| API request bodies | `OrderInputSchema`, etc. | `ZodValidationPipe` on each controller method |
| OCR output | `OcrResultSchema` | inside `OcrModule.extract` before returning |
| Payment webhooks | `WebhookEventSchema` | first line of `webhook.controller` / `parseWebhook` adapter |
| Chatbot input | `ChatInputSchema` | chat controller (never reaches identifier validation) |
| Adapter responses (provider JSON) | per-provider schema | inside each adapter, before normalizing |

Rule: data is **untrusted until `.parse()`d**. Validation lives at the boundary the data *enters*, using schemas from `packages/shared`.

### Idempotency strategy (payment webhooks)

1. Provider sends event (may retry, may arrive out of order).
2. `WebhookEventSchema.parse(raw)` — reject malformed early.
3. Claim `idempotency_keys(provider, providerEventId)` via unique-constraint insert.
4. Already present → return 200, no side effects (replay-safe).
5. Newly claimed → apply effect (record Payment, transition Order) inside a DB transaction; the key row commits with the effect.
6. Out-of-order: the state machine rejects illegal transitions, so a stale "pending" arriving after "captured" is a legal no-op rather than corruption.

This is the §A3 TDD-mandatory "same event twice = one effect" requirement.

---

## Order State Machine — Transition Table

States (glossary-aligned; includes mandated failure states):

| State | Meaning |
|-------|---------|
| `DRAFT` | Order created, identity/vehicle being assembled |
| `QUOTED` | FxQuote locked onto the order |
| `AWAITING_PAYMENT` | Invoice issued, waiting for payment |
| `PAID` | Payment captured |
| `ISSUING_CERTIFICATE` | Certificate issuance in progress |
| `COMPLETED` | Certificate issued (terminal, success) |
| `OCR_FAILED` | OCR extraction/validation failed (recoverable) |
| `PAYMENT_FAILED` | PaymentAttempt failed (recoverable / retry) |
| `CERT_FAILED` | Issuance failed after payment (needs intervention) |
| `REFUNDING` | Refund in progress (e.g. paid but cert unissuable) |
| `REFUNDED` | Refund completed (terminal) |
| `CANCELLED` | Order abandoned before payment (terminal) |

Legal transitions (`from --event--> to`); anything not listed throws `IllegalTransitionError`:

| From | Event | To |
|------|-------|----|
| `DRAFT` | `OCR_SUCCEEDED` | `DRAFT` (identity attached; stays draft until quoted) |
| `DRAFT` | `OCR_FAILED` | `OCR_FAILED` |
| `OCR_FAILED` | `RETRY_OCR` | `DRAFT` |
| `DRAFT` | `QUOTE_LOCKED` | `QUOTED` |
| `DRAFT` | `CANCEL` | `CANCELLED` |
| `QUOTED` | `REQUOTE` | `QUOTED` (new FxQuote replaces expired one) |
| `QUOTED` | `INVOICE_ISSUED` | `AWAITING_PAYMENT` |
| `QUOTED` | `CANCEL` | `CANCELLED` |
| `AWAITING_PAYMENT` | `PAYMENT_CAPTURED` | `PAID` |
| `AWAITING_PAYMENT` | `PAYMENT_FAILED` | `PAYMENT_FAILED` |
| `AWAITING_PAYMENT` | `CANCEL` | `CANCELLED` |
| `PAYMENT_FAILED` | `RETRY_PAYMENT` | `AWAITING_PAYMENT` |
| `PAYMENT_FAILED` | `CANCEL` | `CANCELLED` |
| `PAID` | `CERT_ISSUANCE_STARTED` | `ISSUING_CERTIFICATE` |
| `ISSUING_CERTIFICATE` | `CERT_ISSUED` | `COMPLETED` |
| `ISSUING_CERTIFICATE` | `CERT_FAILED` | `CERT_FAILED` |
| `CERT_FAILED` | `RETRY_ISSUANCE` | `ISSUING_CERTIFICATE` |
| `CERT_FAILED` | `INITIATE_REFUND` | `REFUNDING` |
| `PAID` | `INITIATE_REFUND` | `REFUNDING` |
| `REFUNDING` | `REFUND_COMPLETED` | `REFUNDED` |

Notes:
- **Refund only reachable after `PAID`** — you cannot refund unpaid money.
- **Certificate only issuable after `PAID`** — never issue cover before collection.
- **Idempotent webhook** maps a duplicate `PAYMENT_CAPTURED` onto an already-`PAID` order: the state machine treats it as illegal-from-PAID → handler swallows as no-op (consistent with the idempotency-key claim already short-circuiting it).
- Terminal states: `COMPLETED`, `REFUNDED`, `CANCELLED`.

---

## Suggested Build Order (roadmap phasing)

Dependencies flow left→right; later items consume earlier ones.

```
0. Monorepo + packages/shared skeleton + CI gate (typecheck+lint+test)
        │
1. PURE units (TDD first, no I/O):                  ← unblocks everything
   validators (Thai-ID, plate, chassis, engine) · fx.math · order.state-machine · commission.math
        │
2. Persistence + cross-cutting:
   Prisma schema (Order, Customer, Vehicle, IdentityDocument, Invoice, Payment, Certificate,
   Partner, Commission, audit_logs, idempotency_keys) · CryptoService · AuditInterceptor
        │
3. Leaf deep modules behind FAKE adapters:
   FxModule(.quote) · OcrModule(.extract) · PaymentModule(.charge + idempotent webhook) ·
   CertificateModule(.issue, manual-upload) · MessagingModule(.send)
        │
4. OrderModule orchestrator + controllers (wires the state machine to the leaf modules)
        │
5. Vertical purchase slice end-to-end on fakes (Phase 1 acceptance: one paid, cert-issued order)
        │
6. Admin web (Next.js) over the slice  ── then ──>  7. CommissionModule + Partner attribution
        │
8. Real adapters (swap fakes): GoogleVision OCR · Phapay/Omise · WhatsApp/LINE
        │
9. RenewalModule (scan expiring Certificates)   10. Customer self-serve web   11. AI-agent cert issuance
```

**Why this order:**
- **Pure units first** (step 1) because they are TDD-mandatory, have zero dependencies, and every higher layer depends on them. A wrong FX or checksum is money/legal exposure — get them green before any plumbing.
- **Fakes before real providers** (step 3 before 8) is the stated Phase 1 constraint: the slice must be self-contained and fully testable; the port/adapter pattern makes the later swap a one-file change per provider.
- **OrderModule last among backend modules** (step 4) because it orchestrates the leaves — it cannot be built before they expose their interfaces.
- **Commission/Renewal/self-serve deferred** — they widen the platform but are not on the critical path to the one paid, certificate-issued transaction that is the core value.

---

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 0–1k orders | Single NestJS instance + one Postgres. Synchronous flow is fine; webhooks already async. |
| 1k–100k orders | Move OCR + certificate issuance + messaging onto a job queue (BullMQ); keep webhook ingestion fast (claim key, enqueue effect). Read replicas for admin reporting. |
| 100k+ orders | The deep-module boundaries are already service-shaped — extract the heaviest (OCR, Payment) to separate deployables only if a real bottleneck appears. Do not split prematurely. |

### Scaling priorities
1. **First bottleneck:** synchronous external calls (OCR/issuer/provider) blocking request threads → move to a queue behind the same module interface (no caller changes).
2. **Second bottleneck:** admin reporting queries on encrypted/large tables → read replica + blind-index columns for identifier lookup.

---

## Anti-Patterns

### Anti-Pattern 1: "Cleaning" OCR output / letting the LLM validate identifiers
**What people do:** Have the OCR/LLM step normalize or correct a national-ID/plate.
**Why it's wrong:** Non-deterministic, untestable, and a wrong identifier is legal exposure.
**Do this instead:** OCR returns RAW `OcrResult`; deterministic pure validators in `packages/shared` accept/reject. (Mandated by PROJECT.md + §A3.)

### Anti-Pattern 2: Provider `if/else` scattered through services
**What people do:** `if (market === 'LA') phapay... else omise...` inside business logic.
**Why it's wrong:** Provider lock-in; every swap touches many files (violates §A4).
**Do this instead:** Route once inside `PaymentModule` by selecting the adapter bound to the order's Market; business code calls one interface.

### Anti-Pattern 3: Status flags mutated anywhere
**What people do:** Set `order.state = 'PAID'` in the webhook handler, the controller, and a cron.
**Why it's wrong:** Illegal/contradictory states; impossible to reason about or test.
**Do this instead:** Only `OrderService.transition` writes state, via the pure tested table.

### Anti-Pattern 4: Trusting webhook/body payloads
**What people do:** Read `req.body.amount` directly.
**Why it's wrong:** Untrusted input → injection / corrupt money math.
**Do this instead:** `.parse()` with a Zod schema at the boundary before any use (§A5).

### Anti-Pattern 5: Non-idempotent webhook side effects
**What people do:** Issue a Certificate / pay Commission directly on each webhook delivery.
**Why it's wrong:** Provider retries → double issuance / double payout.
**Do this instead:** Idempotency-key claim + single transactional effect (§A3).

---

## Integration Points

### External Services

| Service | Integration pattern | Notes / gotchas |
|---------|---------------------|-----------------|
| Phapay (LAK) | `PaymentProviderPort` adapter, selected when `market === 'LA'` | Webhook idempotency; verify signature inside adapter before Zod parse |
| Opn/Omise (THB) | `PaymentProviderPort` adapter, selected when `market === 'TH'` | Same idempotency + signature discipline |
| Google Vision | `OcrPort` adapter | Returns raw text only; never validate identifiers here; PII never sent to dev plugins |
| External insurer system | `CertificateIssuerPort`: manual-upload now, AI-agent later | Issuance happens outside our DB; we store the issued Certificate + PDF |
| WhatsApp / LINE | `MessagingPort` adapters | Templated only; rate limits; opt-in handling |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Controller ↔ Module | direct method call after Zod pipe | bodies validated before service entry |
| OrderModule ↔ Fx/Payment/Certificate/Commission | direct service-method calls (glossary types) | OrderModule orchestrates; leaves never call back into Order |
| Module ↔ Adapter | DI token (`Symbol`) → `useClass`/`useFactory` | swap by env/Market; tests inject fakes |
| Any module ↔ DB | via `PrismaService`; PII via `CryptoService` | every PII access audit-logged |
| apps/web ↔ apps/api | HTTP/JSON, shared Zod schemas | same schema validates client + server |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Module boundaries & interfaces | HIGH | Directly specified by §A4 + glossary; standard deep-module design |
| Adapter/port pattern | HIGH | Verified against NestJS official custom-providers docs (token + useClass/useFactory) |
| State machine table | HIGH (design) | Derives from mandated failure states; transition legality is a design decision to TDD-confirm |
| Idempotency strategy | HIGH | Standard unique-key claim pattern; matches §A3 requirement |
| PII encryption / audit placement | MEDIUM | Pattern is standard; exact crypto scheme (envelope vs column AES-GCM) and blind-index need a phase-specific decision |
| Build order | HIGH | Follows dependency direction + stated Phase 1 constraints |

## Sources

- `docs/ENGINEERING-STANDARDS.md` §A4 (deep modules), §A5 (boundary discipline), §A3 (TDD-critical paths) — authoritative, in-repo
- `docs/GLOSSARY.md` — authoritative domain vocabulary
- `.planning/PROJECT.md` — scope, FX rule, Phase 1 constraints, key decisions
- NestJS Custom Providers (useClass / useFactory / injection tokens): https://docs.nestjs.com/fundamentals/custom-providers — HIGH

---
*Architecture research for: cross-border vehicle insurance platform (Laos ↔ Thailand)*
*Researched: 2026-06-06*
