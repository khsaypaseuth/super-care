# Phase 2: Encrypted Data Layer & Audit Spine - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Source:** Inline context capture (PROJECT.md + ROADMAP + research + standards; 2 decisions confirmed with user)

<domain>
## Phase Boundary

Persist the domain in **PostgreSQL via Prisma** with **PII encrypted at rest**, **every PII
access audit-logged**, **secrets out of code (CI secret-scan)**, and **consent captured** — the
data spine the rest of the platform builds on. This is the first I/O phase.

In scope (Phase 2):
- Prisma schema + initial migration against PostgreSQL (Hostinger target; local Postgres for dev/test).
- Domain tables: `Lead`, `Customer`, `Vehicle`, `IdentityDocument`, `OcrResult`, `Order`,
  `Invoice`, `PaymentAttempt`, `Payment`, `Certificate`, `Renewal`, `Partner`, `Commission`,
  `audit_logs`, `idempotency_keys` (money columns = `Decimal`; identifier columns encrypted).
- **Auth data model only** (NOT login/RBAC logic — that is Phase 7): `User`/`Account` + `Role`
  supporting roles **ADMIN, STAFF, PARTNER, CUSTOMER** (credential fields modelled; hashing +
  verification + sessions land in Phase 7).
- **CMI master/reference tables (CMI-01)**: `insurance_companies`, `cmi_policy_types`,
  `master_title_names`, `master_card_types`, `master_nationalities` (ISO-3166 Alpha-3),
  `master_provinces`, `master_districts`, `master_subdistricts`, `master_car_brands`,
  `master_car_models`, `master_car_colors`, `master_vehicle_types`. Seed with the reference
  data in `docs/CMI-SPEC.md` (titles, card types, colors, vehicle types inline; nationalities /
  provinces / brands flagged as import-from-source, may be partial-seed in this phase).
- `CryptoService` (AES-256-GCM, env master key behind a `KeyProvider` seam) + blind-index HMAC.
- Audit-on-access mechanism writing an `audit_logs` row for every PII read/write.
- `idempotency_keys` table (unique on provider+eventId) — schema only; webhook use is Phase 5.
- Consent capture (a consent timestamp/record on Customer) — schema + capture; legal go-live
  enforcement (SEC-04) is Phase 10.
- CI secret-scanning (gitleaks) wired into the existing GitHub Actions gate.

Out of scope (Phase 2): HTTP endpoints, UI, auth login/RBAC enforcement (Phase 7),
OCR/payment/messaging/certificate adapters (Phases 3–6/10), the Order state-machine *wiring*
(Phase 4 — the pure machine already exists in packages/shared). No business logic beyond
persistence + crypto + audit.
</domain>

<decisions>
## Implementation Decisions

### Encryption & key management (CONFIRMED with user)
- **AES-256-GCM** field encryption in a server-side `CryptoService`. 32-byte master key from an
  **env secret on the Hostinger VPS** (never in code), accessed via a **`KeyProvider` interface**
  so an external KMS/Vault can replace it later with no call-site changes.
- Store ciphertext with its random IV + auth tag; include a **`keyVersion`** so keys can rotate.
- Encrypt/decrypt only inside the owning server module; cleartext never crosses module boundaries.

### Searchable PII via blind index (CONFIRMED with user)
- For identifiers we must look up by exact value (national ID, passport, chassis, and provider
  idempotency keys): store **`<field>Idx` = HMAC-SHA256(normalized value, indexKey)** alongside
  the ciphertext, indexed/unique for equality lookup (dedupe + renewal + support lookup) **without
  decrypting**. The HMAC `indexKey` is a separate env secret from the encryption master key.

### Persistence
- **Prisma + PostgreSQL**. Money columns are `Decimal` (align with big.js `Money` from Phase 1).
- Prisma schema + generated client live **server-side in `apps/web`** (e.g. `apps/web/prisma/` +
  a server `db` module); they are **NOT** in `packages/shared` (which stays pure / no-I/O).
  Pure domain types/enums (Currency, Market, OrderState) remain in `packages/shared` and the
  Prisma enums mirror them (single vocabulary per glossary).
- Identifier values are still validated by the Phase 1 pure validators before persistence.

### Audit
- Every PII read/write writes an `audit_logs` row (`actor`, `action`, `subjectType`, `subjectId`,
  `timestamp`). **Actor** is supplied by a caller-provided context object; real authenticated
  actor is wired when auth lands in Phase 7 (until then a system/test actor).

### Secret scanning
- Add **gitleaks** to the GitHub Actions CI gate; it must fail on a planted secret.

### Library choice (confirm in research)
- Evaluate **`prisma-field-encryption`** (Prisma client extension supporting `@encrypted` +
  hash/blind-index fields + key rotation) vs a **custom `CryptoService`**. Pick whichever cleanly
  supports: AES-256-GCM, the `KeyProvider` seam, `keyVersion` rotation, HMAC blind index, and the
  audit-on-access hook. Default lean: `prisma-field-encryption` if it meets all five; else custom.

### Claude's Discretion
- Exact Prisma model field names (must use glossary terms), relation shapes, enum placement,
  migration naming, seed-script structure, and the audit mechanism (Prisma `$extends`/middleware
  vs explicit repository methods).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `docs/ENGINEERING-STANDARDS.md` — §A1 ubiquitous language, §A5 strict TS + Zod boundaries,
  PII encrypted at rest + access logged, no secrets in code.
- `docs/GLOSSARY.md` — model names MUST match (Lead, Customer, Vehicle, IdentityDocument,
  OcrResult, Order, Invoice, PaymentAttempt, Payment, Certificate, Renewal, Partner, Commission,
  Premium, FxQuote, Market).
- `docs/CMI-SPEC.md` — master tables + reference data (titles, card types, nationalities,
  provinces, brands, colors, vehicle types) and the application/OCR field lists.
- `.planning/PROJECT.md` — Decimal money, Hostinger/Postgres, roles, API seam, auth phasing.
- `.planning/REQUIREMENTS.md` — SEC-01/02/03, CMI-01, AUTH-01..06 (schema part here), API-01.
- `.planning/ROADMAP.md` — Phase 2 goal/success criteria (incl. 1b: User/Role + CMI tables)/exit gate.
- `packages/shared/src/types/index.ts` — Currency/Market unions to mirror in Prisma enums.
- `packages/shared/src/order/` — OrderState values to mirror in the Prisma Order status enum.
- `.planning/phases/01-foundation-money-legal-cores/01-*-SUMMARY.md` — what Phase 1 built.
</canonical_refs>

<specifics>
## Specific Ideas

- Prisma `Order.state` enum must mirror the Phase 1 state-machine states (incl. failure/refund
  states); the live transition wiring is Phase 4, but the column + enum exist now.
- `idempotency_keys`: unique on `(provider, eventId)` (schema only; Phase 5 uses it).
- Encrypted fields at minimum: `IdentityDocument` number(s) + document blob/reference, plus any
  national-ID/passport on `Customer`; each gets a blind-index `Idx` companion where lookup is needed.
- Seed: inline reference data from `docs/CMI-SPEC.md`; full nationality/province/brand imports may
  be a follow-up data task (flag as [DATA] if not fully seeded this phase).
</specifics>

<deferred>
## Deferred Ideas

- Auth login / sessions / RBAC enforcement / admin manage-users UI → Phase 7 (schema only here).
- Webhook idempotency *use* → Phase 5; Order transition wiring → Phase 4.
- Real OCR/payment/messaging/certificate adapters → Phases 3–6/10.
- SEC-04 consent legal go-live gate + data-residency basis → Phase 10 (capture mechanism here).
- External KMS/Vault key backend → later (KeyProvider seam makes it a drop-in).
- Full nationality/province/brand reference imports if not completed this phase → [DATA] follow-up.
</deferred>

---

*Phase: 02-encrypted-data-layer-audit-spine*
*Context gathered: 2026-06-07 via inline capture*
