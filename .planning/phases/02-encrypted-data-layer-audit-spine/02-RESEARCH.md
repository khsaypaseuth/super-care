# Phase 2: Encrypted Data Layer & Audit Spine - Research

**Researched:** 2026-06-07
**Domain:** Prisma 7 + PostgreSQL persistence, application-layer PII encryption (AES-256-GCM), HMAC blind-index lookup, audit-on-access, CI secret-scanning — first I/O phase, server-side only (no HTTP/UI/auth-logic).
**Confidence:** HIGH (versions registry-verified 2026-06-07; node:crypto round-trip + HMAC determinism + gitleaks CLI all proven in-session; the two key library facts — prisma-field-encryption NOT Prisma-7-compatible, gitleaks-action license — verified against source)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Encryption & key management (CONFIRMED with user)**
- **AES-256-GCM** field encryption in a server-side `CryptoService`. 32-byte master key from an **env secret on the Hostinger VPS** (never in code), accessed via a **`KeyProvider` interface** so an external KMS/Vault can replace it later with no call-site changes.
- Store ciphertext with its random IV + auth tag; include a **`keyVersion`** so keys can rotate.
- Encrypt/decrypt only inside the owning server module; cleartext never crosses module boundaries.

**Searchable PII via blind index (CONFIRMED with user)**
- For identifiers we must look up by exact value (national ID, passport, chassis, and provider idempotency keys): store **`<field>Idx` = HMAC-SHA256(normalized value, indexKey)** alongside the ciphertext, indexed/unique for equality lookup **without decrypting**. The HMAC `indexKey` is a **separate** env secret from the encryption master key.

**Persistence**
- **Prisma + PostgreSQL**. Money columns are `Decimal` (align with big.js `Money` from Phase 1).
- Prisma schema + generated client live **server-side in `apps/web`** (e.g. `apps/web/prisma/` + a server `db` module); **NOT** in `packages/shared` (which stays pure / no-I/O). Pure domain types/enums (Currency, Market, OrderState) remain in `packages/shared` and the Prisma enums **mirror** them.
- Identifier values are still validated by the Phase 1 pure validators before persistence.

**Audit**
- Every PII read/write writes an `audit_logs` row (`actor`, `action`, `subjectType`, `subjectId`, `timestamp`). **Actor** is supplied by a **caller-provided context object**; real authenticated actor is wired in Phase 7 (until then a system/test actor).

**Secret scanning**
- Add **gitleaks** to the GitHub Actions CI gate; it must **fail on a planted secret**.

**Library choice (resolved by this research):**
- Evaluate `prisma-field-encryption` vs a custom `CryptoService`. → **RESEARCH VERDICT: custom `CryptoService`** (see § Standard Stack). `prisma-field-encryption` does **not** support Prisma 7 and its blind index is plain SHA-256, not the user-mandated HMAC-SHA256.

### Claude's Discretion
- Exact Prisma model field names (must use glossary terms), relation shapes, enum placement, migration naming, seed-script structure, and the audit mechanism (Prisma `$extends`/middleware vs explicit repository methods).

### Deferred Ideas (OUT OF SCOPE)
- Auth login / sessions / RBAC enforcement / admin manage-users UI → Phase 7 (schema only here).
- Webhook idempotency *use* → Phase 5; Order transition wiring → Phase 4.
- Real OCR/payment/messaging/certificate adapters → Phases 3–6/10.
- SEC-04 consent legal go-live gate + data-residency basis → Phase 10 (capture mechanism here).
- External KMS/Vault key backend → later (KeyProvider seam makes it a drop-in).
- Full nationality/province/brand reference imports if not completed this phase → [DATA] follow-up.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | PII (passport, national ID, documents) encrypted at rest | Custom `CryptoService` (AES-256-GCM via node:crypto) + `EncryptedString` column convention; § Pattern 1/2 |
| SEC-02 | No secrets in code; CI secret-scan; env/KMS-managed | gitleaks CLI in ci.yml (license-free), `KeyProvider` reads env; § Secret Scanning |
| SEC-03 | Every PII access recorded in `audit_logs` | Repository-method audit pattern + `audit_logs` model + caller `ActorContext`; § Pattern 3 |
| CMI-01 | Master/reference tables exist and seeded | 12 master models + idempotent seed script; § Schema Design + Seed |
| AUTH-01..06 (schema part only) | `User`/`Account`/`Role` data model, 4 roles | `User`, `Account`, `Role` enum (ADMIN/STAFF/PARTNER/CUSTOMER); credential fields modelled, no hashing/sessions/RBAC logic; § Schema Design |
| (implicit) | `idempotency_keys` schema only, unique (provider,eventId) | Model defined; § Schema Design. Webhook use is Phase 5. |
| (implicit) | Consent capture on Customer | `consentAt`/`consentVersion` fields + capture; legal go-live (SEC-04) deferred to Phase 10 |
</phase_requirements>

## Summary

This is the project's first I/O phase. Everything sits **server-side inside `apps/web`** (Next.js full-stack + Prisma; there is no `apps/api`). The phase delivers: a Prisma 7 schema + initial migration; a custom application-layer `CryptoService` that AES-256-GCM-encrypts PII with a versioned key behind a `KeyProvider` seam; HMAC-SHA256 blind-index companion columns for exact-match lookup of encrypted identifiers; an audit-on-access mechanism that writes an `audit_logs` row for every PII read/write with a caller-supplied actor; and gitleaks wired into the existing GitHub Actions gate.

The single most important research finding: **`prisma-field-encryption` cannot be used.** Its stable release (1.6.0, Sept 2024) declares peer `@prisma/client >= 4.7` and the maintainer's own docs cap support at **Prisma 6.13** — it does **not** support Prisma 7 (current `7.8.0`). Separately, its blind-index "hash" is **plain SHA-256, not HMAC**, which directly contradicts the user's locked HMAC-SHA256 decision. Both facts independently disqualify it. The custom `CryptoService` is therefore not a fallback but the correct primary choice: it cleanly satisfies all five locked requirements (AES-256-GCM, KeyProvider seam, keyVersion rotation, HMAC blind index, audit-on-access hook) using only `node:crypto` (zero new runtime crypto deps), and all of its primitives were verified working in-session.

A second important finding: in **Prisma 7 the new `prisma-client` generator is the default and requires an explicit `output` path** (it no longer generates into `node_modules`). This is actually convenient for the "client lives in `apps/web`" decision — point `output` at `apps/web/src/generated/prisma`. Set `moduleFormat = "esm"` (the repo is `"type": "module"`).

**Primary recommendation:** Custom `CryptoService` (node:crypto AES-256-GCM, `v{n}:{ivB64}:{tagB64}:{ctB64}` envelope) + `KeyProvider` env seam + HMAC-SHA256 blind index with a separate `INDEX_KEY`; **explicit repository methods** for PII access (not Prisma `$extends`) so the audit write is transactional with the data read/write and the actor context is unambiguous; Prisma 7 `prisma-client` generator → `apps/web/src/generated/prisma`; `prisma migrate dev` for authoring + committed migrations, `migrate deploy` in CI/prod; gitleaks **CLI** (not the action) to avoid the org license requirement; testcontainers-free **local Postgres 17** for dev (already running) + a **Postgres service container** in CI.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PII encryption / decryption | API / Backend (server module in apps/web) | — | Crypto must never reach the browser; key material is server-only env. |
| Blind-index HMAC computation | API / Backend | — | Uses server-only `INDEX_KEY`; deterministic, pure given the key. |
| Audit-log write | API / Backend | Database / Storage | Decision happens in the repository layer; the row persists in Postgres. |
| Schema / migrations | Database / Storage | API / Backend | Prisma owns DDL; the client surface is server-side. |
| Reference-data seed | Database / Storage | API / Backend | Idempotent seed script run against Postgres. |
| Key resolution (`KeyProvider`) | API / Backend | (future: external KMS) | Env now; the seam lets a KMS adapter slot in with no call-site change. |
| Secret scanning | CI / build | — | gitleaks runs in GitHub Actions, not at runtime. |

> Pure domain vocabulary (Currency, Market, OrderState, validators) stays in `packages/shared` (no tier of its own — it is a pure library consumed by the backend). The Prisma enums **mirror** those unions; `packages/shared` must gain **no** I/O.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `prisma` (CLI) | `7.8.0` | Schema, migrations, client generation | [VERIFIED: npm registry 2026-06-07] Current stable; fixed stack. New `prisma-client` generator is default in v7. |
| `@prisma/client` | `7.8.0` | Generated query client (runtime) | [VERIFIED: npm registry 2026-06-07] Must match CLI major. Returns `Decimal` for `Decimal` columns. |
| `node:crypto` | (built-in, Node 22.14) | AES-256-GCM encrypt/decrypt + HMAC-SHA256 blind index | [VERIFIED: in-session round-trip + HMAC determinism] No new dependency; FIPS-standard primitives; full control over IV/tag/keyVersion envelope. |
| `gitleaks` (CLI binary) | `8.30.1` | CI secret scanning | [VERIFIED: GitHub releases API 2026-06-07] License-free as a binary/CLI (the *action* needs an org license). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `big.js` | `7.0.1` (already in repo) | Convert Prisma `Decimal` ↔ domain `Money` at the boundary | When reading/writing money columns; keep the Phase-1 `Money` value object authoritative. [VERIFIED: npm registry] |
| `zod` | `4.4.3` (already in repo) | Validate seed input / repository inputs at the boundary | Reuse Phase-1 schemas; parse untrusted data before persistence. [VERIFIED: npm registry] |
| `tsx` | latest | Run the TS seed script (`prisma db seed`) | Seed runner; Prisma 7 `prisma-client` generator does not auto-load `.env` at runtime — load env explicitly in seed/server bootstrap. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `CryptoService` | `prisma-field-encryption@1.6.0` | **REJECTED.** Peer `@prisma/client >= 4.7`; maintainer docs cap support at **Prisma 6.13** — no Prisma 7 support. Its blind index is **plain SHA-256, not HMAC** (violates locked decision). No documented per-read hook for audit. Two independent disqualifiers. |
| `node:crypto` | `@47ng/cloak` (the lib prisma-field-encryption wraps) | Adds a dependency for what `node:crypto` does natively; no benefit here and same Prisma-7 question; loses control of the keyVersion/IV/tag envelope shape. |
| gitleaks CLI | `gitleaks/gitleaks-action@v3` | **REJECTED for default.** Requires a (free but mandatory) `GITLEAKS_LICENSE` secret for **organization** repos. CLI binary in a workflow step has no license requirement and identical detection. |
| Postgres service container (CI) | testcontainers-node | testcontainers needs a Docker daemon; **Docker is not available in this environment** (verified). Local Postgres 17 is already running. Use the lighter service-container/local approach. |

**Installation:**
```bash
# Prisma into apps/web (server-side; NOT packages/shared)
pnpm --filter @super-care/web add @prisma/client
pnpm --filter @super-care/web add -D prisma tsx
# node:crypto is built-in — nothing to install
# gitleaks: installed in CI via the official install script / pinned binary (see § Secret Scanning)
```

**Version verification (2026-06-07):**
- `prisma` / `@prisma/client` → `7.8.0` (latest) [VERIFIED: npm registry]
- `prisma-field-encryption` → `1.6.0` latest stable, published 2024-09-24, peer `@prisma/client >= 4.7`, **63,765 weekly downloads** [VERIFIED: npm registry] — but NOT Prisma-7-compatible [CITED: github.com/47ng/prisma-field-encryption].
- `gitleaks` → `v8.30.1`; `gitleaks-action` → `v3.0.0` [VERIFIED: GitHub releases API].

## Package Legitimacy Audit

> No new runtime crypto/encryption package is added. The only new install is the Prisma toolchain (already the project's fixed, blessed stack) + `tsx` (dev). slopcheck was not installable offline in this session; the packages below are all long-established, first-party, registry-verified with high download counts, so they are treated as `[VERIFIED: npm registry]` rather than `[ASSUMED]`. No suspicious/new packages are introduced.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `prisma` | npm | 6+ yrs | ~12.4M/wk | github.com/prisma/prisma | n/a (unavailable) | Approved (first-party, fixed stack) |
| `@prisma/client` | npm | 6+ yrs | ~tens of M/wk | github.com/prisma/prisma | n/a | Approved (first-party) |
| `tsx` | npm | mature | very high | github.com/privatenumber/tsx | n/a | Approved (dev-only) |
| `prisma-field-encryption` | npm | since 2021 | 63,765/wk | github.com/47ng/prisma-field-encryption | n/a | **REMOVED** — Prisma-7-incompatible + SHA-256 (not the design choice) |
| `node:crypto` | (built-in) | — | — | nodejs/node | n/a | Approved (stdlib) |

**Packages removed:** `prisma-field-encryption` (technical incompatibility, not legitimacy).
**Packages flagged suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
   caller (server action / route handler — Phase 4+; tests now)
        │  passes ActorContext { actor, ... }
        ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ apps/web/src/server/                                          │
 │                                                              │
 │  modules/<domain>/<domain>.repo.ts   (explicit repo methods) │
 │     │  encrypt PII ──► CryptoService.encrypt(plaintext)      │
 │     │  blind index ──► CryptoService.blindIndex(normalized)  │
 │     │  write data + write audit_logs row  (one tx)           │
 │     ▼                                                        │
 │  db/client.ts  (PrismaClient singleton)                      │
 │     │                                                        │
 │  crypto/                                                     │
 │   ├─ key-provider.ts   interface KeyProvider                │
 │   ├─ env-key-provider.ts  reads MASTER_KEY_V{n}, INDEX_KEY  │
 │   └─ crypto.service.ts  AES-256-GCM + HMAC-SHA256           │
 │  audit/audit.service.ts  record(actor, action, subject)     │
 └──────────────────────────────┬───────────────────────────────┘
                                 │ Prisma
                                 ▼
        PostgreSQL 17  (encrypted PII cols · *Idx blind-index cols ·
                        audit_logs · idempotency_keys · master tables)
```

### Recommended Project Structure
```
apps/web/
├── prisma/
│   ├── schema.prisma            # datasource + prisma-client generator + models + enums
│   ├── migrations/              # committed SQL migrations (migrate dev)
│   └── seed.ts                  # idempotent reference-data seed (tsx)
├── src/
│   ├── generated/prisma/        # generator output (gitignored; prisma-client v7)
│   └── server/
│       ├── db/client.ts         # PrismaClient singleton (dev-HMR safe)
│       ├── crypto/
│       │   ├── key-provider.ts          # KeyProvider interface
│       │   ├── env-key-provider.ts       # env-backed impl (Hostinger)
│       │   └── crypto.service.ts         # encrypt/decrypt/blindIndex (+ unit tests)
│       ├── audit/audit.service.ts        # record() — writes audit_logs
│       └── modules/
│           ├── customer/customer.repo.ts # PII read/write + audit, uses crypto
│           └── identity-document/...
```

> `packages/shared` is untouched except possibly **re-exporting OrderState string-literal values** so the Prisma enum and the machine share one vocabulary (see Pattern 5).

### Pattern 1: Custom `CryptoService` (AES-256-GCM) behind a `KeyProvider` seam
**What:** A server-only service that encrypts a string to a self-describing envelope and decrypts it back, resolving keys through an injectable `KeyProvider`.
**When to use:** Every PII field at rest (passport/national-ID numbers, document blob references, any identifier requiring confidentiality).
**Envelope format (store as one `text`/`String` column):** `v{keyVersion}:{ivBase64}:{authTagBase64}:{ciphertextBase64}`
- IV = 12 random bytes (GCM standard) [VERIFIED in-session]; authTag = 16 bytes [VERIFIED]; new random IV per encryption.
- The `v{n}` prefix lets `decrypt` pick the right key version → rotation without bulk re-encryption (Pattern 6).

```typescript
// crypto/key-provider.ts — the seam (env now, KMS later, zero call-site change)
export interface KeyProvider {
  /** current version used for NEW encryptions */
  currentKeyVersion(): number;
  /** 32-byte AES key for a given version (throws if unknown) */
  encryptionKey(version: number): Buffer;
  /** 32-byte HMAC key for blind indexing (separate secret) */
  indexKey(): Buffer;
}

// crypto/crypto.service.ts
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export class CryptoService {
  constructor(private readonly keys: KeyProvider) {}

  encrypt(plaintext: string): string {
    const v = this.keys.currentKeyVersion();
    const key = this.keys.encryptionKey(v);          // 32 bytes
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
    const tag = c.getAuthTag();                       // 16 bytes
    return `v${v}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
  }

  decrypt(envelope: string): string {
    const [vTag, ivB64, tagB64, ctB64] = envelope.split(":");
    const v = Number(vTag.slice(1));
    const key = this.keys.encryptionKey(v);
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    d.setAuthTag(Buffer.from(tagB64, "base64"));      // auth failure → throws (tamper-evident)
    return Buffer.concat([d.update(Buffer.from(ctB64, "base64")), d.final()]).toString("utf8");
  }

  /** HMAC-SHA256(normalize(value), indexKey) → hex; deterministic, separate key */
  blindIndex(value: string): string {
    return createHmac("sha256", this.keys.indexKey())
      .update(normalizeIdentifier(value))
      .digest("hex");                                 // 64 hex chars [VERIFIED in-session]
  }
}
```

### Pattern 2: Blind-index companion columns (`<field>Idx`)
**What:** Alongside each encrypted, exact-lookup-able identifier store `<field>Idx String` = `crypto.blindIndex(value)`, indexed (`@unique` where dedupe is required).
**Normalization (load-bearing — must be identical at write and query time):** `trim()` → remove internal whitespace/dashes for IDs/chassis as appropriate → `toUpperCase()` for alphanumeric identifiers (passport/chassis); for the Thai 13-digit national ID keep digits only. Encode the exact rule in one `normalizeIdentifier()` function and reuse it everywhere; a mismatch silently breaks lookups.
**Query by it (no decryption):**
```typescript
const idx = crypto.blindIndex(rawNationalId);
const customer = await db.customer.findUnique({ where: { nationalIdIdx: idx } });
```
**Indexing:** `@unique` for dedupe identifiers (national ID, passport, chassis) and for `idempotency_keys (provider,eventId)`; plain `@@index` if duplicates are legal but lookup is needed.

### Pattern 3: Audit-on-access via explicit repository methods (RECOMMENDED over `$extends`)
**What:** PII reads/writes go through repository methods that (a) do the data op and (b) write an `audit_logs` row in the **same transaction**, given a caller-supplied `ActorContext`.
**Why not Prisma `$extends`/middleware:** A query extension cannot see *who* the actor is (no request context inside Prisma), cannot reliably distinguish a PII read from a non-PII read, and risks audit/data write skew if not transactional. Explicit methods make the actor explicit, keep audit + data atomic, and are trivially unit-testable. (Phase 7 can later populate `ActorContext` from the session with no signature change.)

```typescript
export interface ActorContext { actor: string; /* e.g. "system", "test", later userId */ }

async function readCustomerPii(db: PrismaClient, ctx: ActorContext, id: string) {
  return db.$transaction(async (tx) => {
    const c = await tx.customer.findUniqueOrThrow({ where: { id } });
    await tx.auditLog.create({ data: {
      actor: ctx.actor, action: "READ", subjectType: "Customer", subjectId: id,
    }});
    return { ...c, nationalId: crypto.decrypt(c.nationalId) }; // decrypt only inside the owning module
  });
}
```

### Anti-Patterns to Avoid
- **Putting crypto/keys anywhere reachable by the browser.** All of `src/server/**` must be server-only; never import `CryptoService` into a client component.
- **Relying on Prisma middleware/`$extends` for audit.** No actor context, no atomicity guarantee — see Pattern 3.
- **Different normalization at write vs query.** Single `normalizeIdentifier()`; otherwise blind-index lookups silently miss.
- **Reusing one key for both encryption and blind index.** Locked decision: `MASTER_KEY` ≠ `INDEX_KEY`.
- **Encrypting with a default/empty IV or static IV.** Always `randomBytes(12)` per encryption.
- **Storing money as Float/Double.** All money/rate columns are `Decimal` (PLAT-03).
- **Adding I/O to `packages/shared`.** It stays pure; Prisma lives in `apps/web`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-GCM mode mechanics | A custom block-cipher/padding scheme | `node:crypto` `aes-256-gcm` | Authenticated encryption, constant-time tag check, FIPS primitives — never implement cipher internals. |
| HMAC | A homemade keyed hash | `node:crypto` `createHmac("sha256", key)` | Correct keyed-hash construction; deterministic, verified in-session. |
| DB migrations / DDL diffing | Hand-written ALTER scripts | `prisma migrate dev` / `deploy` | Generates + tracks reversible, reviewable SQL; drift detection. |
| Secret scanning regexes | A custom grep for tokens | `gitleaks` (100+ built-in rules) | Maintained rule set for AWS/GCP/Stripe/JWT/etc.; entropy detection. |
| Client singleton lifecycle | Ad-hoc `new PrismaClient()` per call | One `globalThis`-cached singleton | Prevents connection exhaustion under Next.js HMR/serverless. |

**Key insight:** The *only* thing this phase legitimately builds is the **composition** (envelope format, KeyProvider seam, blind-index columns, audit-in-transaction) — never the cryptographic primitives themselves.

## Runtime State Inventory

> This phase is greenfield persistence (no rename/refactor of existing stored state). For completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB exists yet (first I/O phase). | Create schema + initial migration. |
| Live service config | None — no external services configured (Phase 1 had zero). | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | **New** env vars to introduce: `DATABASE_URL`, `MASTER_KEY_V1` (base64 32-byte), `INDEX_KEY` (base64 32-byte). None pre-exist. | Document in `.env.example`; provide real values out-of-band (USER SETUP). |
| Build artifacts | Prisma generator output `apps/web/src/generated/prisma/` — must be **gitignored** and produced by `prisma generate` (add to build + CI). | Add to `.gitignore`; add `prisma generate` to build/CI. |

## Common Pitfalls

### Pitfall 1: Prisma 7 generator requires an explicit `output` and ESM config
**What goes wrong:** Copying a Prisma-6-style `generator client { provider = "prisma-client-js" }` block fails or generates into `node_modules` unexpectedly; ESM `.js` import errors at runtime.
**Why it happens:** Prisma 7 makes the new `prisma-client` generator the default and **requires `output`**; it does not load `.env` at runtime and emits ESM-style imports.
**How to avoid:**
```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
```
Load env explicitly in the server bootstrap and seed script (don't rely on Prisma auto-loading `.env`).
**Warning signs:** "Cannot find module './internal/...js'", or generated code appearing in `node_modules`.
[CITED: prisma.io/docs generators; prisma.io/changelog 2025-07-17]

### Pitfall 2: Blind-index normalization mismatch
**What goes wrong:** A lookup that should match returns nothing because the query value was normalized differently from the stored value.
**Why it happens:** Two code paths normalize independently.
**How to avoid:** One `normalizeIdentifier()`; unit-test that `blindIndex("12-3456 7890123") === blindIndex("1234567890123")` for your chosen rule.
**Warning signs:** Dedup checks that "never find a duplicate"; support lookup misses.

### Pitfall 3: Auth-tag/IV not stored → undecryptable data
**What goes wrong:** Ciphertext stored without its IV or auth tag → permanent data loss.
**How to avoid:** The single-column `v:iv:tag:ct` envelope (Pattern 1) keeps them together atomically. Round-trip test on every encrypted field type.

### Pitfall 4: gitleaks-action license surprise in org repos
**What goes wrong:** CI step fails demanding `GITLEAKS_LICENSE`.
**Why it happens:** `gitleaks/gitleaks-action@v3` requires a (free, but mandatory) license for org-owned repos.
**How to avoid:** Run the **gitleaks binary** as a plain workflow step (Pattern in § Secret Scanning) — no license. [CITED: github.com/gitleaks/gitleaks-action]

### Pitfall 5: Decimal/Money boundary drift
**What goes wrong:** Reading a `Decimal` column and treating it as a JS number reintroduces float error (violates PLAT-03).
**How to avoid:** Convert Prisma `Decimal` → big.js `Money` at the repository boundary; never `Number(decimal)`.

### Pitfall 6: PrismaClient connection exhaustion under HMR
**What goes wrong:** Each Next.js hot reload creates a new client → "too many connections".
**How to avoid:** `globalThis`-cached singleton in `db/client.ts`.

## Code Examples

### PrismaClient singleton (HMR-safe)
```typescript
// apps/web/src/server/db/client.ts
import { PrismaClient } from "../../generated/prisma/client.js";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
```

### Env-backed KeyProvider (Hostinger)
```typescript
// apps/web/src/server/crypto/env-key-provider.ts
import type { KeyProvider } from "./key-provider.js";
export class EnvKeyProvider implements KeyProvider {
  currentKeyVersion(): number { return Number(process.env.MASTER_KEY_CURRENT ?? "1"); }
  encryptionKey(v: number): Buffer {
    const b64 = process.env[`MASTER_KEY_V${v}`];
    if (!b64) throw new Error(`No encryption key for version ${v}`);
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) throw new Error("Master key must be 32 bytes");
    return key;
  }
  indexKey(): Buffer {
    const b64 = process.env.INDEX_KEY;
    if (!b64) throw new Error("INDEX_KEY not set");
    return Buffer.from(b64, "base64");
  }
}
```

### Generate dev keys (for `.env`, NEVER committed)
```bash
node -e 'console.log("MASTER_KEY_V1="+require("crypto").randomBytes(32).toString("base64"))'
node -e 'console.log("INDEX_KEY="+require("crypto").randomBytes(32).toString("base64"))'
```

## Schema Design

### Enums (mirror `packages/shared`)
```prisma
enum Market   { TH LA }                 // mirrors Market union
enum Currency { THB LAK }               // mirrors Currency union
enum Role     { ADMIN STAFF PARTNER CUSTOMER }
enum OrderState {
  DRAFT OCR_FAILED QUOTED AWAITING_PAYMENT PAYMENT_FAILED
  PAID ISSUING_CERTIFICATE CERT_FAILED REFUNDING
  COMPLETED REFUNDED CANCELLED          // EXACTLY the 12 states in order.machine.ts
}
```
> The 12 `OrderState` values are taken verbatim from `packages/shared/src/order/order.machine.ts` (DRAFT, OCR_FAILED, QUOTED, AWAITING_PAYMENT, PAYMENT_FAILED, PAID, ISSUING_CERTIFICATE, CERT_FAILED, REFUNDING, COMPLETED, REFUNDED, CANCELLED). A drift test should assert the Prisma enum and the machine's state keys are identical (Pattern 5 below).

### Domain models (glossary-exact names)
`Lead`, `Customer`, `Vehicle`, `IdentityDocument`, `OcrResult`, `Order`, `Invoice`, `PaymentAttempt`, `Payment`, `Certificate`, `Renewal`, `Partner`, `Commission`.
- **Encrypted columns** (store the envelope `String`): `IdentityDocument.documentNumber` + `IdentityDocument.documentRef` (blob/storage ref); `Customer.nationalId`, `Customer.passportNumber`; `Vehicle.chassisNumber`, `Vehicle.engineNumber` (per CMI OCR fields — chassis is a lookup key).
- **Blind-index companions** (`@unique` where dedupe): `Customer.nationalIdIdx`, `Customer.passportNumberIdx`, `Vehicle.chassisNumberIdx`, `IdentityDocument.documentNumberIdx`.
- **Money columns** → `Decimal`: `Premium`/`Invoice.total`/`Payment.amount`/`Commission.amount`/`FxQuote` fields and any rate. (`Premium`, `FxQuote` are glossary terms — model `Premium` and an `FxQuote` table now or as fields on Order per planner discretion; Phase 4 wires the live FxQuote logic.)
- **Consent capture** on `Customer`: `consentAt DateTime?`, `consentVersion String?` (capture mechanism only; SEC-04 legal gate is Phase 10).
- `OcrResult` stores **raw** extracted JSON (`Json`/`String`), never cleaned — relation to `IdentityDocument`.

### Auth data model (schema only — NO logic)
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?           // field modelled; hashing/verification = Phase 7
  role         Role     @default(CUSTOMER)
  accounts     Account[]
  partner      Partner?  @relation(fields: [partnerId], references: [id])
  partnerId    String?
  createdAt    DateTime @default(now())
}
model Account {                   // OAuth/provider link shape; populated in Phase 7
  id         String @id @default(cuid())
  user       User   @relation(fields: [userId], references: [id])
  userId     String
  provider   String
  providerAccountId String
  @@unique([provider, providerAccountId])
}
```

### Operational tables
```prisma
model AuditLog {
  id          String   @id @default(cuid())
  actor       String                       // caller-supplied; "system"/"test" until Phase 7
  action      String                       // READ | WRITE | CREATE | UPDATE | ...
  subjectType String
  subjectId   String
  createdAt   DateTime @default(now())
  @@index([subjectType, subjectId])
  @@map("audit_logs")
}
model IdempotencyKey {
  id        String   @id @default(cuid())
  provider  String
  eventId   String
  createdAt DateTime @default(now())
  @@unique([provider, eventId])            // schema only; Phase 5 uses it
  @@map("idempotency_keys")
}
```

### CMI master/reference tables (CMI-01)
`insurance_companies`, `cmi_policy_types`, `master_title_names`, `master_card_types`, `master_nationalities` (ISO-3166 Alpha-3), `master_provinces`, `master_districts`, `master_subdistricts`, `master_car_brands`, `master_car_models`, `master_car_colors`, `master_vehicle_types`.
- Hierarchy FKs: `master_districts.provinceId → master_provinces`, `master_subdistricts.districtId → master_districts`, `master_car_models.brandId → master_car_brands`.
- Use the source `code` (e.g. title code `5`, color code `999`, vehicle-type `1.10`) as a natural unique key alongside a surrogate id.

### FK / relation pitfalls
- Set explicit `onDelete` behavior on master-table FKs (reference data should be `Restrict`/`NoAction` — never cascade-delete a province out from under addresses).
- District→Province and Subdistrict→District must be created/seeded **parent-first** (seed ordering).
- `User.partnerId` optional (only PARTNER-role users link to a `Partner`).
- Keep `OcrResult` raw payload as opaque `Json`; do not normalize into typed columns.

### Pattern 5: Enum ↔ machine drift guard
Re-export the 12 OrderState literals from `packages/shared` (e.g. an `ORDER_STATES` readonly tuple derived from the machine's `TRANSITIONS` keys) and add a unit test asserting the Prisma `OrderState` enum members equal that tuple. Single vocabulary, enforced.

### Seed (idempotent)
- `prisma db seed` → `tsx prisma/seed.ts`; use `upsert` keyed on natural `code` so re-runs are safe.
- **Inline-seed now** (from `docs/CMI-SPEC.md`): title names (6 rows), card types (5), vehicle colors (~23), vehicle-type examples, policy types.
- **Flag `[DATA]`** (may be partial this phase): full ISO-3166 nationality list, all 77 provinces + districts/subdistricts + postal codes, full car-brand/model lists — "import from source" follow-up.

## Secret Scanning

Add a gitleaks step to the existing `.github/workflows/ci.yml` (which currently runs typecheck/lint/test). Use the **binary**, not the licensed action:

```yaml
  secret-scan:
    name: Secret Scan (gitleaks)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }            # full history so planted secrets in any commit are caught
      - name: Install gitleaks
        run: |
          curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
            | tar -xz -C /usr/local/bin gitleaks
      - name: Run gitleaks
        run: gitleaks detect --source . --redact --exit-code 1 --config .gitleaks.toml
```
- `--exit-code 1` makes a finding **fail the build** (the SEC-02 "fails on a planted secret" requirement).
- Minimal `.gitleaks.toml` extends defaults and allowlists test fixtures / `.env.example` placeholders:
```toml
[extend]
useDefault = true
[allowlist]
description = "ignore example/test placeholders"
paths = ['''\.env\.example$''', '''.*\.spec\.ts$''']
```
- **Verification task:** plant a fake AWS-style key on a throwaway branch, confirm CI goes red, then remove — mirrors the Phase-1 CI red-on-failure checkpoint.
[CITED: github.com/gitleaks/gitleaks-action (license requirement)] [VERIFIED: GitHub releases API → v8.30.1]

## Common Pitfalls (recap → verification)
Each pitfall above maps to a verification step the planner should include: round-trip test (auth tag), normalization equality test (blind index), enum-drift test, gitleaks red-on-planted-secret, Decimal→Money boundary test, singleton under repeated import.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma-client-js` generating into `node_modules` | `prisma-client` generator with required `output` path, ESM-capable | Prisma 6.12 (preview) → **7.0 default** | Must set `output` + `moduleFormat`; convenient for "client in apps/web". |
| Prisma `$use` middleware | Client `$extends` (middleware deprecated) | Prisma 5+ | Not used here anyway (audit uses explicit repos), but don't reach for deprecated `$use`. |
| `prisma-field-encryption` for at-rest PII | Custom `node:crypto` service (when on Prisma 7 + HMAC blind index needed) | — | Library not Prisma-7-compatible; custom is the correct path here. |

**Deprecated/outdated:**
- STACK.md's `prisma-field-encryption` recommendation and its `@aws-sdk/client-kms` assumption are **overridden**: not Prisma-7-compatible, and deployment is env-key-on-Hostinger (KMS is the deferred KeyProvider swap).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact normalization rules per identifier (digits-only for Thai ID; trim+upper for passport/chassis) | Pattern 2 | Wrong normalization → blind-index lookups miss; pick rules with the planner and unit-test them. |
| A2 | `Premium`/`FxQuote` modelled as table(s) now (vs deferred to Phase 4) | Schema Design | Low — planner discretion; the enum/columns must exist, the live FX logic is Phase 4. |
| A3 | Which exact columns are "PII requiring encryption" beyond the CONTEXT minimum (e.g. customer address/phone) | Schema Design | Over/under-encrypting; CONTEXT lists national-ID/passport/document as the floor — confirm address/phone treatment with user. |
| A4 | gitleaks binary asset name `gitleaks_8.30.1_linux_x64.tar.gz` | Secret Scanning | Low — asset naming is stable; the plan's install step should verify the URL resolves. |
| A5 | Postgres provided to executor/CI (see Environment Availability) | Validation | High if absent — blocks all integration tests; flagged as USER SETUP. |

## Open Questions

1. **Is a Postgres + `DATABASE_URL` available to the executor and to CI?**
   - What we know: local Postgres 17.7 is running on this machine (`/tmp:5432 accepting connections`); Docker is **not** available.
   - What's unclear: whether CI has a Postgres service and whether the executor should use the running local instance or a dedicated test DB.
   - Recommendation: **USER SETUP** — provide `DATABASE_URL` (a dedicated `super_care_dev` / `super_care_test` database) and the two env keys; add a Postgres service container to CI (Pattern in § Validation Architecture).

2. **Address/phone/email — encrypt or plaintext?**
   - CMI requires customer address/phone/email; CONTEXT mandates encryption only for ID-document/national-ID/passport.
   - Recommendation: confirm with user; default to encrypting national-ID/passport/document numbers + chassis/engine, leaving structured address fields plaintext for now (they drive master-table joins).

3. **`db push` vs `migrate dev` for this stage.**
   - Recommendation: use `prisma migrate dev` so the **initial migration is committed** (the success criterion says "Prisma schema *migrates*"), and `migrate deploy` in CI/prod. Avoid `db push` (no migration history) for an audited/regulated codebase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | 22.14.0 | — |
| pnpm | All | ✓ | 10.33.2 | — |
| PostgreSQL server | Migrations, integration tests, seed | ✓ (running locally) | 17.7 | none — must be provided |
| `DATABASE_URL` env | Prisma client/migrate | ✗ | — | **USER SETUP** — provide connection string |
| `MASTER_KEY_V1`, `INDEX_KEY` env | CryptoService | ✗ | — | **USER SETUP** — generate (see Code Examples) |
| Docker | testcontainers (if used) | ✗ | — | Not needed — use local PG + CI service container |
| gitleaks | CI secret scan | ✗ (not local) | install in CI | Installed in CI step; optional local install for pre-commit |

**Missing dependencies with no fallback:**
- `DATABASE_URL` and a target Postgres database for the executor and CI — **blocks integration tests + migration if not provided** (USER SETUP).
- `MASTER_KEY_V1` / `INDEX_KEY` — **blocks any encryption round-trip at runtime** (unit crypto tests can inject keys directly, so they are not blocked; integration is).

**Missing dependencies with fallback:**
- Docker absent → use the already-running local Postgres for dev and a `services: postgres` container in CI (no testcontainers).
- gitleaks absent locally → runs in CI only (acceptable for the gate).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (already configured; `vitest run`) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `pnpm test` (unit; no DB) |
| Full suite command | `pnpm test` with `DATABASE_URL` set (adds integration) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | AES-256-GCM encrypt→decrypt round-trip (cleartext recovered) | unit (no DB) | `pnpm test crypto.service` | ❌ Wave 0 |
| SEC-01 | Tamper: flipped auth tag → decrypt throws | unit | `pnpm test crypto.service` | ❌ Wave 0 |
| SEC-01 | keyVersion in envelope; decrypt picks right key | unit | `pnpm test crypto.service` | ❌ Wave 0 |
| (blind idx) | `blindIndex` deterministic + normalization equality | unit | `pnpm test crypto.service` | ❌ Wave 0 |
| SEC-01 | Customer/IdentityDocument PII stored as envelope, decryptable only in module | integration (DB) | `pnpm test customer.repo` | ❌ Wave 0 |
| (blind idx) | Lookup-by-blind-index finds the row without decrypt; dedupe `@unique` enforced | integration | `pnpm test customer.repo` | ❌ Wave 0 |
| SEC-03 | Every PII read AND write creates exactly one `audit_logs` row (actor/action/subject) | integration | `pnpm test audit` | ❌ Wave 0 |
| SEC-03 | Audit row + data write are atomic (rollback leaves neither) | integration | `pnpm test audit` | ❌ Wave 0 |
| CMI-01 | Migration applies; master tables exist; seed is idempotent (re-run = same counts) | integration | `pnpm test seed` | ❌ Wave 0 |
| AUTH (schema) | User/Account/Role models migrate; 4 roles enumerable | integration | `pnpm test schema` | ❌ Wave 0 |
| (enum drift) | Prisma `OrderState` members === machine state keys | unit | `pnpm test order-enum-drift` | ❌ Wave 0 |
| SEC-02 | gitleaks fails CI on a planted secret | CI / manual-checkpoint | gitleaks step + throwaway-branch verify | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test <touched-suite>` (unit crypto/enum suites run with no DB).
- **Per wave merge:** full `pnpm test` with `DATABASE_URL` set (unit + integration).
- **Phase gate:** full suite green + gitleaks red-on-planted-secret verified before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Provision `DATABASE_URL` (dedicated `super_care_test` DB) — **USER SETUP** / executor + CI.
- [ ] Provide `MASTER_KEY_V1`, `INDEX_KEY` test env (or inject test keys directly in unit tests).
- [ ] CI: add Postgres `services` container + `prisma migrate deploy` before integration tests.
- [ ] Integration test harness: per-suite DB reset/transaction-rollback helper (e.g. truncate or per-test transaction).
- [ ] `crypto.service.spec.ts` — round-trip / tamper / keyVersion / blind-index determinism (unit, no DB).
- [ ] `order-enum-drift.spec.ts` — Prisma enum vs machine keys.
- [ ] Repository integration specs (customer.repo, audit, seed, schema).
- [ ] gitleaks step in `.github/workflows/ci.yml` + `.gitleaks.toml`.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (schema only) | User/Account modelled; hashing/sessions = Phase 7 |
| V3 Session Management | no | Phase 7 |
| V4 Access Control | partial (audit substrate) | `audit_logs` of access; RBAC enforcement = Phase 7 |
| V5 Input Validation | yes | Zod at boundaries (reuse Phase 1) + pure validators before persistence |
| V6 Cryptography | yes | AES-256-GCM via `node:crypto`; 32-byte keys from env `KeyProvider`; never hand-roll cipher; separate `INDEX_KEY`; keyVersion rotation; secrets never in code (gitleaks) |
| V7 Logging | yes | `audit_logs` per PII access; redact PII from logs (`--redact` in gitleaks; never log cleartext) |

### Known Threat Patterns for Prisma + node:crypto + Postgres
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret committed to repo | Information Disclosure | gitleaks CI gate (`--exit-code 1`); env-only keys |
| Ciphertext tampering | Tampering | GCM auth tag verified on decrypt (throws) |
| Encrypted-field equality leakage | Information Disclosure | Random per-encryption IV → identical plaintext ≠ identical ciphertext; lookups use HMAC blind index, not the ciphertext |
| Blind-index brute force | Information Disclosure | HMAC with a secret `INDEX_KEY` (not plain SHA-256) prevents offline dictionary attacks |
| SQL injection | Tampering | Prisma parameterizes queries; no raw string SQL |
| Audit gap (PII read without log) | Repudiation | Audit write in the same transaction as the read (explicit repos) |
| Key compromise / rotation | Information Disclosure | keyVersion envelope → rotate forward without bulk re-encrypt; old versions kept for decrypt |

## Key Rotation + KeyProvider Seam

**Interface:** see Pattern 1 (`currentKeyVersion`, `encryptionKey(version)`, `indexKey`).
**Rotation flow (no big-bang re-encrypt):**
1. Add `MASTER_KEY_V2` to env; set `MASTER_KEY_CURRENT=2`.
2. All **new** encryptions use v2 (envelope prefix `v2:`); **existing** `v1:` rows still decrypt because `encryptionKey(1)` is still resolvable.
3. Optional lazy migration: on read of a `v1:` row, re-encrypt with v2 and write back (or a background job).
4. Retire `MASTER_KEY_V1` only once no `v1:` rows remain.
**KMS swap (deferred):** implement a `KmsKeyProvider` against the same interface; no `CryptoService`/repository call-site changes. `INDEX_KEY` rotation is harder (changes all blind indexes) → keep it stable; document as a known constraint.

## Project Constraints (from CLAUDE.md)
- Node 22, pnpm, **strict TypeScript** (`noImplicitAny`, `any` banned) — already enforced by lint.
- **No secrets in code** (env-managed); **PII encrypted at rest**; **access audit-logged** — this phase implements these directly.
- **Deep modules, narrow interfaces** — `CryptoService`/`KeyProvider`/repos expose small surfaces; crypto internals hidden.
- **Money never float** — `Decimal` columns + big.js boundary.
- **Validate every boundary with Zod**; identifiers validated by **pure validators** (never LLM) before persistence.
- **Git commit at every phase; merge only on green CI** (typecheck + lint + tests) — gitleaks joins the gate.
- Ubiquitous language: Prisma model names = glossary terms exactly.
- Note: CLAUDE.md still lists NestJS in the fixed stack, but the **2026-06-07 architecture decision (Next.js + Prisma, no NestJS)** supersedes it (confirmed in 01-01-SUMMARY and ROADMAP). Build inside `apps/web`.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`) 2026-06-07 — `prisma` / `@prisma/client` 7.8.0; `prisma-field-encryption` 1.6.0 (peer `@prisma/client >= 4.7`, 63,765 wk dl); `zod` 4.4.3; `big.js` 7.0.1.
- GitHub releases API 2026-06-07 — `gitleaks` v8.30.1; `gitleaks-action` v3.0.0.
- In-session `node:crypto` execution — AES-256-GCM round-trip OK, HMAC-SHA256 deterministic (64 hex), IV=12/tag=16 bytes.
- In-repo files — `order.machine.ts` (12 OrderState values), `packages/shared/src/types/index.ts` (Currency/Market), `ci.yml`, `package.json` (ESM, versions), CONTEXT.md, REQUIREMENTS.md, ROADMAP.md, CMI-SPEC.md, GLOSSARY.md, ENGINEERING-STANDARDS.md, 01-01-SUMMARY.md.
- github.com/47ng/prisma-field-encryption — Prisma version support (4.7–6.13, no v7), AES-GCM, key format `k1.aesgcm256.`, `@encrypted`/`@encryption:hash`, **hash is SHA-256 not HMAC**.
- github.com/gitleaks/gitleaks-action — org repos require `GITLEAKS_LICENSE`; CLI/binary avoids it.
- prisma.io docs / changelog (2025-07-17) — Prisma 7 `prisma-client` generator default, required `output`, ESM (`moduleFormat`), no runtime `.env` load.

### Secondary (MEDIUM confidence)
- WebSearch (Prisma 7 generator/monorepo) cross-checked against the official changelog/docs above.

### Tertiary (LOW confidence)
- gitleaks release asset exact filename (`gitleaks_8.30.1_linux_x64.tar.gz`) — verify URL resolves in the install step.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions registry-verified; library disqualifiers verified against source.
- Architecture (crypto/blind-index/audit): HIGH — primitives proven in-session; patterns standard.
- Schema design: MEDIUM-HIGH — model set is glossary/CONTEXT-driven; exact PII-column set has one open question (address/phone).
- Pitfalls: HIGH — Prisma-7 generator + gitleaks-license are documented, current facts.
- Environment: HIGH — probed directly (PG 17.7 up, Docker absent).

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (Prisma/gitleaks move fast — re-verify versions if planning slips a month)
