# Stack Research

**Domain:** Cross-border vehicle insurance platform (Laos ↔ Thailand) — payments, OCR, certificates, messaging, renewals
**Researched:** 2026-06-06
**Confidence:** HIGH (most picks verified against live npm registry + official docs; payment/messaging provider SDKs are LOW where no usable SDK exists)

> Scope note: The **fixed** stack (Node 22, pnpm monorepo, TypeScript strict, NestJS `apps/api`, Next.js `apps/web`, Prisma, Zod, `packages/shared`) is NOT re-litigated here. This document is prescriptive only about the **supporting libraries** that bolt onto that fixed stack for the 10 concerns asked. All versions below were verified against the npm registry on 2026-06-06.

---

## Recommended Stack (by concern)

### 1. Order state machine

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **xstate** | `^5.32.0` | Finite-state machine / statechart for the `Order` lifecycle | Industry-standard FSM for TS. v5 is the current stable line (alpha/beta tags are pre-v5 history; `5.32.0` is `latest`). Declarative, serializable definition makes "only legal transitions" enforceable and **unit-testable as a pure transition table** — exactly what ENGINEERING-STANDARDS §A3 mandates. Illegal transitions are simply absent → throwing on them is trivial. Failure states (OCR failed, payment failed, cert-gen failed, refund) model cleanly as explicit states. Can run headless in a NestJS service (no React dependency). |

**Confidence: HIGH.** Caveat: don't over-adopt XState actors/effects inside the domain core. Use it as a **pure machine definition + `machine.transition()`** wrapped by an `OrderModule`; keep side effects (payments, cert issuance) in the NestJS service layer, not in machine `invoke`/`actions`. This keeps the machine a deterministic, exhaustively testable function.

**Alternative if you want zero deps:** a hand-rolled transition map (`Record<State, Record<Event, State>>`) in `packages/shared`. Defensible for a single small machine and trivially testable, but you lose visualization, typed events, and guard ergonomics. Pick XState; the Order machine has enough failure branches to justify it.

### 2. Money / decimal math (THB & LAK) — NEVER float

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **big.js** | `^7.0.1` | Arbitrary-precision decimal arithmetic for Premium, FX, commission | Small, audited, zero-dependency, immutable decimals with explicit rounding modes (`Big.roundUp` / `Big.RM`). Directly implements the FX rule: `THB → LAK at source rate, +15 kips, rounded up`. Last published 2025-06; stable and maintained. Pure functions → perfect for the TDD table-driven tests required for FX and commission. |
| **Prisma `Decimal`** | (built-in, Prisma 7) | DB column type for all money/rate fields | Store every monetary amount and FX rate as `Decimal` in Postgres, never `Float`/`Double`. Prisma returns `Decimal.js` instances; convert to `Big` at the domain boundary or standardize on one — see compatibility note. |

**Money discipline (load-bearing):**
- **Store minor units or `Decimal`, never floats.** LAK has effectively no subunit in practice; THB has satang (2 dp). Model each currency's scale explicitly in `packages/shared` (e.g., a `Money { amount: Big; currency: 'THB' | 'LAK' }` value object) — do NOT assume 2 dp everywhere.
- **Round only at defined boundaries** (the FX quote, the invoice total), and round with the **explicit direction the business rule states** (`+15 kips, round up`). Encode rounding mode in the function, never rely on a default.
- **`FxQuote` is locked + time-stamped** — persist the resolved rate, markup, rounding result, and timestamp; never recompute from a live rate after the quote is issued.

**Confidence: HIGH.**

### 3. Testing (unit + e2e, TDD)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **Vitest** | `^4.1.8` | Unit + integration test runner (api + shared + web) | Native ESM + TS via `tsx`/esbuild, no `ts-jest` transform tax, fast watch for red→green→refactor loops. v4 is current. One runner across the monorepo (NestJS services, pure validators in `packages/shared`, Next.js components) reduces config sprawl. |
| **@nestjs/testing** | `^11.1.24` | NestJS DI test harness | Build testing modules, override providers with fakes (the stubbed OCR/Payment/Messaging adapters from Phase 1). Works with Vitest. |
| **supertest** | `^7.2.2` | HTTP-level API tests against the Nest app | Drives the e2e/contract layer for API request-body Zod validation and idempotent webhook handlers. |
| **@playwright/test** | `^1.60.0` | Browser e2e for `apps/web` (admin/back-office flows) | Standard for Next.js e2e; reliable, parallel, trace-on-failure. Use sparingly in Phase 1 (back-office only). |

**TDD targets (per §A3) live in `packages/shared` as pure functions and are unit-tested exhaustively:** Thai National ID 13-digit checksum, passport/plate/chassis/engine format validators, FX engine, commission ladder, Order transition table, webhook idempotency.

**Confidence: HIGH.**

**Note on Jest:** Jest 30 is fine and is what `@nestjs/testing` scaffolds by default. **Choose Vitest** to avoid maintaining a separate `ts-jest`/`babel-jest` transform pipeline and to share one runner with the Next.js side. If the team already has deep Jest muscle memory, Jest 30 + `ts-jest@29.4` is an acceptable equal-confidence fallback — do not run both.

### 4. PDF certificate generation

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **pdf-lib** | `^1.17.1` | Generate / fill / stamp Certificate PDFs server-side | Pure-JS, no native/headless-browser dependency, runs anywhere Node runs (and in workers/serverless). Ideal because the real issuance path is **manual key-in + PDF upload now** — pdf-lib can fill a fixed insurer template form and stamp fields onto an existing PDF, which matches the "bridge to an external insurer system" model better than rendering from scratch. |

**Alternatives considered:**
- **@react-pdf/renderer `^4.5.1`** — great if you want to *design* certificate layout in JSX from scratch. Choose this only if there is no fixed insurer PDF template and you own the design. Heavier and React-centric.
- **PDFKit `^0.18.0`** — imperative drawing API; capable but more verbose and weaker at *filling existing* templates than pdf-lib.
- **Puppeteer `^25.1.0` (HTML→PDF)** — pixel-perfect HTML/CSS rendering, but ships Chromium (heavy, slower cold starts, security-surface in a regulated app). **Avoid unless** marketing-grade layout from HTML is a hard requirement.

**Recommendation: pdf-lib** for stamping/filling the insurer template; revisit @react-pdf/renderer only if the platform owns full certificate design. **Confidence: HIGH** on capability, **MEDIUM** on final choice (depends on whether a fixed insurer template exists — flag for the Certificate phase).

### 5. OCR client abstraction (Google Vision)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **@google-cloud/vision** | `^5.3.7` | Google Cloud Vision client (document/text detection on IdentityDocument) | Official Google client, typed, current. Wrap it behind `OcrModule.extract(documentType, file) → OcrResult` (§A4) so the provider is swappable. Use `documentTextDetection` for ID/passport images. |

**Critical domain rule (from PROJECT.md + glossary):** `OcrResult` is **raw**, never "cleaned." OCR output is **untrusted** → parse it with a Zod schema at the boundary, and run identifier validation through the **pure validators** in `packages/shared`, never via the OCR model or any LLM. The OCR module returns text; validators decide validity.

**PII note:** Vision calls send document images to Google. Per the governance caveats, this is real customer PII — ensure the GCP project/data-region and DPA posture are reviewed before the real adapter lands. In Phase 1 the adapter is a **fake**, so this is a later-phase flag.

**Confidence: HIGH** (package), with a compliance flag for the real-integration phase.

### 6. Payment provider SDKs (Phapay = LAK, Opn/Omise = THB)

| Provider | Library | Version | Status |
|----------|---------|---------|--------|
| **Opn / Omise (THB)** | **omise** | `^1.1.0` | Official Node SDK exists and is current. Use it inside the THB branch of `PaymentModule`. |
| **Phapay (LAK)** | **no npm SDK** | — | No `phapay` / `@phapay/sdk` package exists on npm (verified). Integrate via **direct REST/HTTPS** using NestJS `HttpModule` (axios) inside the LAK branch. |

**Architecture (per §A4 + Key Decisions):** one `PaymentModule` interface, two adapters, **routed by `Market`**. Webhooks for **both** providers must be **idempotent** (§A3) — persist provider event IDs and dedupe; test replay/out-of-order. Validate every webhook payload with Zod before acting. Verify webhook signatures per each provider's spec.

**Confidence: HIGH** for Omise SDK; **LOW** for Phapay specifics — there is no public npm SDK and Phapay's API surface is not verifiable from training data. **Flag: the Renewal/Payment phase needs first-party Phapay API docs + sandbox credentials before building the real adapter.** Phase 1 uses fakes, so this does not block the vertical slice.

### 7. Messaging (WhatsApp Cloud API, LINE Messaging API)

| Channel | Library | Version | Why |
|---------|---------|---------|-----|
| **LINE** | **@line/bot-sdk** | `^11.0.1` | Official, well-typed LINE Messaging API SDK. Use for templated notifications + the customer chatbot transport. |
| **WhatsApp** | **direct REST to Graph API** (axios via Nest `HttpModule`) | Graph API `v22+` | The official Meta WhatsApp Cloud API has **no first-party stable Node SDK** (`whatsapp` npm is `0.0.5-Alpha`; `whatsapp-cloud-api@0.3.1` is an unmaintained community wrapper). Calling the Graph endpoint directly is the standard, lowest-risk approach: stable, fully under our control, no abandoned-wrapper supply-chain risk. |
| **Phone parsing** | **libphonenumber-js** | `^1.13.6` | Normalize/validate LA (+856) and TH (+66) numbers to E.164 before sending. |

**Architecture:** `MessagingModule` with one interface and per-channel adapters; templates only (no free-form for transactional). The chatbot uses glossary terms and **never touches identifier validation** (PROJECT.md). Phase 1 = fakes.

**Confidence: HIGH** for LINE SDK + libphonenumber; **MEDIUM** for the WhatsApp "direct REST" recommendation (correct call given SDK immaturity, but pin the Graph API version explicitly).

### 8. Job queue (webhooks, renewals, retries)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **BullMQ** | `^5.78.0` | Redis-backed job/queue engine | De-facto standard for Node background jobs. Drives **renewal scheduling** (detect expiring Certificate → schedule renewal via delayed/repeatable jobs), **webhook processing** (enqueue then process idempotently with built-in retries/backoff), and outbound messaging retries. Battle-tested, actively maintained. |
| **@nestjs/bullmq** | `^11.0.4` | First-party NestJS integration | `@Processor`/`@Process` decorators, DI-friendly queue registration — matches NestJS module idioms. |
| **ioredis** | `^5.11.1` | Redis client BullMQ requires | Pin alongside BullMQ. |

**Why a queue at all:** webhook idempotency (§A3) is far easier when you **acknowledge fast, enqueue, and process exactly-once** with a persisted dedupe key, rather than doing heavy work in the HTTP handler. Renewals are inherently scheduled work → repeatable jobs.

**Confidence: HIGH.** Adds a Redis infra dependency — acceptable and standard. (Postgres-only alternatives like `pg-boss` exist if you must avoid Redis, but BullMQ is the stronger fit for repeatable renewal jobs.)

### 9. Encryption-at-rest for PII

| Approach | Library | Version | Why |
|----------|---------|---------|-----|
| **Field-level encryption in Prisma** | **prisma-field-encryption** | `^1.6.0` | Annotate PII fields (passport number, national ID, document refs) with `/// @encrypted`; transparently encrypts on write / decrypts on read via a Prisma client extension. AES-GCM (authenticated). Lowest-friction way to satisfy "PII encrypted at rest" (§A5) without rewriting every query. |
| **Key management** | **@aws-sdk/client-kms** | `^3.1063.0` | If deploying on AWS, hold the data key in KMS rather than a raw env secret. Use envelope encryption. Swap for the equivalent cloud KMS on your actual provider. |

**Discipline (§A5):** no secrets in code; keys are env/KMS-managed. Combine field encryption with **`audit_logs`** for access recording (a NestJS interceptor logging reads of PII fields). For data fully at rest, also enable **Postgres storage/disk encryption** at the infra layer — defense in depth.

**Avoid:** rolling your own crypto with `node-forge`/`crypto` for field encryption unless you have a specific need; the integrated Prisma extension is less error-prone for the common case. Use raw `node:crypto` only for one-off needs (e.g., HMAC webhook-signature verification), not for the PII-at-rest scheme.

**Confidence: MEDIUM-HIGH** — `prisma-field-encryption` is mature and maintained (last publish 2026-01); **verify it has released Prisma 7 compatibility** before adopting, since Prisma 7 changed the client/extension surface (see Version Compatibility).

### 10. API validation wiring (Zod + NestJS)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **zod** | `^4.4.3` | Single source of truth for schemas in `packages/shared` | Already fixed by standards. v4 is current. Schemas live in `packages/shared` and are imported by both `apps/api` (request bodies, webhook payloads, OCR output) and `apps/web` (forms). |
| **nestjs-zod** | `^5.4.0` | Wire Zod into NestJS DTOs, pipes, and Swagger | `createZodDto` + `ZodValidationPipe` give you Zod-validated controller inputs with inferred TS types and OpenAPI generation. Set the pipe globally so **every** untrusted boundary is parsed (§A5). |

**Boundary rule (§A5):** OCR output, webhook payloads, chat input, and API request bodies are untrusted until `.parse()`d. Reuse the **same** shared schema on web (forms) and api (controllers) — ubiquitous-language consistency (§A1) extends to validation shapes.

**Compatibility flag:** confirm `nestjs-zod@5` targets **Zod 4** (Zod 3→4 was a breaking change). Verify peer ranges at install time. **Confidence: HIGH** on Zod; **MEDIUM** on nestjs-zod version pin until Zod-4 peer is confirmed.

---

## Installation

```bash
# --- apps/api (NestJS) ---
pnpm --filter api add xstate big.js bullmq @nestjs/bullmq ioredis \
  nestjs-zod zod \
  @google-cloud/vision omise @line/bot-sdk libphonenumber-js \
  prisma-field-encryption @aws-sdk/client-kms pdf-lib

# --- packages/shared (pure validators, schemas, money, machine def) ---
pnpm --filter shared add zod big.js xstate

# --- dev / testing (root or per-package) ---
pnpm add -D vitest @nestjs/testing supertest @playwright/test tsx

# WhatsApp Cloud API + Phapay: no SDK — implement adapters over Nest HttpModule (axios)
pnpm --filter api add @nestjs/axios axios
```

> Pin exact versions in a regulated codebase (§B governance: "pin versions"). Use `pnpm` overrides if a transitive bump is needed.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| big.js (money) | dinero.js | **Avoid for now.** dinero v2 (`@dinero.js/core`) is still `2.0.0-alpha.*` and effectively stalled; v1 (`1.9.1`) is legacy. big.js is smaller and stable. Use dinero only if you specifically want its currency/formatting abstractions and accept the v1/v2 limbo. |
| big.js | decimal.js / bignumber.js | If you need transcendental math (decimal.js) or advanced base/format config (bignumber.js). For money +/×/rounding, big.js is leaner. |
| XState | hand-rolled transition map | Single tiny machine with few states; want zero deps. Order machine has enough failure branches that XState pays off. |
| Vitest | Jest 30 + ts-jest 29.4 | Team has strong existing Jest investment. Don't run both. |
| pdf-lib | @react-pdf/renderer | You own full certificate design (no fixed insurer template) and want JSX layout. |
| pdf-lib | Puppeteer HTML→PDF | Pixel-perfect HTML/CSS layout is a hard requirement (accept Chromium weight + security surface). |
| BullMQ | pg-boss | You must avoid a Redis dependency and accept weaker repeatable-job ergonomics. |
| Direct Graph REST (WhatsApp) | `whatsapp-cloud-api` wrapper | Never in a regulated app — unmaintained community wrapper = supply-chain risk. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `number` / float for money or FX | Floating-point rounding errors = wrong Premium/FX = real money + legal exposure (PROJECT.md core value) | big.js + Prisma `Decimal` columns |
| Prisma `Float`/`Double` columns for amounts/rates | Same float problem at the DB layer | Prisma `Decimal` |
| dinero.js v2 (`2.0.0-alpha.*`) | Years-stalled alpha; not production-ready | big.js |
| `whatsapp@0.0.5-Alpha` / `whatsapp-cloud-api` | Alpha / unmaintained; supply-chain risk in a PII app | Direct Graph API calls via Nest HttpModule |
| Letting OCR/LLM "clean" or validate identifiers | OcrResult must stay raw; validation is pure-function, deterministic, testable (§A3, glossary) | Pure validators in `packages/shared` + Zod parse |
| Doing webhook work inline in the HTTP handler | Hard to make idempotent; blocks the response | Ack fast → enqueue (BullMQ) → process once with dedupe key |
| Hand-rolled crypto for PII at rest | Easy to get wrong in a regulated domain | prisma-field-encryption + KMS-managed key |
| Running Jest and Vitest together | Double config + maintenance | Pick one (Vitest recommended) |

## Stack Patterns by Variant

**If a fixed insurer PDF template exists (likely):**
- Use **pdf-lib** to fill/stamp the template. Because the real issuance path is manual key-in + upload, you're bridging to an external system, not designing certificates.

**If the platform owns full certificate design:**
- Use **@react-pdf/renderer** for JSX-defined layout.

**If not deploying on AWS:**
- Swap `@aws-sdk/client-kms` for the equivalent (GCP KMS / Azure Key Vault); keep envelope-encryption pattern with prisma-field-encryption.

**If Redis is unavailable in the target infra:**
- Fall back to `pg-boss` (Postgres-backed), accepting weaker repeatable-job support for renewals.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `nestjs-zod@^5.4.0` | `zod@^4` | **Verify peer**: Zod 3→4 was breaking. Confirm at install. |
| `prisma-field-encryption@^1.6.0` | `prisma@7` / `@prisma/client@7` | **Verify Prisma 7 support** — Prisma 7 changed the client extension surface. Check the extension's README/peer range before adopting; pin Prisma 7 only after confirming. |
| `@nestjs/bullmq@^11.0.4` | `@nestjs/*@11`, `bullmq@^5` | Matches NestJS 11 (`@nestjs/testing@11.1.24` observed). |
| `bullmq@^5.78.0` | `ioredis@^5.11.1` | Pin ioredis alongside. |
| `@nestjs/testing@^11.1.24` | `vitest@^4` | Vitest works with Nest's testing module; ensure ESM/TS config aligns. |
| `xstate@^5.32.0` | Node 22, TS strict | Use headless (`createMachine` + `transition`); no React dep needed in api/shared. |
| `typescript@6` / `@types/node@25` | Node 22 | TS 6.x and Node 22 types are current; ensure tsconfig `module`/`moduleResolution` set for ESM + Vitest. |

## Sources

- npm registry (`npm view <pkg> version` / `dist-tags` / `time.modified`), queried 2026-06-06 — version verification for all packages above (HIGH).
- dinero.js dist-tags showed `latest: 2.0.2` but `@dinero.js/core: 2.0.0-alpha.1` → v2 still alpha, basis for the "avoid" call (HIGH).
- `phapay` / `@phapay/sdk` not found on npm → no Phapay SDK exists (HIGH for absence; LOW for Phapay API specifics — needs first-party docs).
- `whatsapp@0.0.5-Alpha`, `whatsapp-cloud-api@0.3.1` → WhatsApp Node SDKs immature → direct Graph API recommendation (MEDIUM).
- PROJECT.md, docs/ENGINEERING-STANDARDS.md (§A3 TDD targets, §A4 deep modules, §A5 boundary discipline), docs/GLOSSARY.md — domain/architecture constraints driving the picks (HIGH).

---
*Stack research for: cross-border vehicle insurance platform (Laos ↔ Thailand)*
*Researched: 2026-06-06*
