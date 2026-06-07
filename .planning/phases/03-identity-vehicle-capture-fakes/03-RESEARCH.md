# Phase 3: Identity & Vehicle Capture (fakes) - Research

**Researched:** 2026-06-07
**Domain:** Next.js App Router back-office UI + Server Actions + fake port/adapter integration over the Phase-2 encrypted/audited Prisma repos
**Confidence:** HIGH (codebase + version verification); MEDIUM on a few Next 16 / Tailwind 4 / shadcn integration specifics flagged inline

## Summary

This is the first UI phase. The hard part is **not** the form UI — it is turning `apps/web` from a typecheck-only ESM **library** (no `app/` dir, no Next runtime, builds to `dist/` via `tsc -b`) into a runnable Next.js App Router app **without breaking** the Phase-2 server modules, the strict `tsc -b` project-reference build, the ESLint flat config, the Prisma 7 generated ESM client, and the existing Vitest unit/integration split. The Phase-2 authors already anticipated this: the Prisma client singleton (`apps/web/src/server/db/client.ts`) is HMR-safe and references "Next.js" in its comments; the repos take an injected `ActorContext` ("system"/"test" until Phase 7); and crypto/audit run audit-in-transaction. Phase 3 builds the wizard on top of that spine, adds a new `vehicle.repo`, and persists a raw `OcrResult` separately from verified/mapped values.

The capture flow is a 6-step intake wizard (Start → Customer → Document & OCR → Map & Verify → Vehicle → Review). Three providers are config-selected behind interfaces — `OcrModule`, `MapperProvider`, `StorageProvider` — with fake adapters (`FakeOcrAdapter` canned reg-book fields, `FakeMapperAdapter` deterministic fuzzy match to seeded master tables, `LocalFsStorageAdapter` writing encrypted blobs to a gitignored `./.uploads`). Business logic lives in server modules; Server Actions stay thin (API-01 seam). The human-verify gate (CUST-07) must be **server-enforced**, not just a disabled button — record `verifiedBy`/`verifiedAt` and an audit row.

**Two schema gaps block the slice and must be planned as a migration:** (1) there is **no Lead→Customer link** (`Lead` has no `customerId`/`convertedAt`) — CUST-02 cannot be represented; (2) the `Vehicle` model has **no `verifiedBy`/`verifiedAt`** fields — CUST-07's "record verifiedBy" cannot be satisfied without them. A draft-intake persistence decision is also needed (UI-SPEC says "progress persisted to a draft intake").

**Primary recommendation:** Add `app/` to `apps/web` with `tsconfig`/build adjustments (do NOT keep `rootDir: src` + `tsc -b` emit for the Next app — let `next build` own the app, keep `tsc --noEmit` for typecheck). Stack: Next 16 + React 19 + Tailwind v4 (`@tailwindcss/postcss`) + shadcn/ui (canary CLI for Tailwind 4/React 19) + react-hook-form 7 + `@hookform/resolvers` 5 (zod) + next-intl 4 + `fastest-levenshtein` for the deterministic mapper. Server Actions for mutations, route handlers for the JSON API seam. Plan a Wave 0 that lands the runnable shell + migration before any wizard step.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Wizard navigation / step state | Browser (Client Components) | Frontend Server (route segments per step) | Interactive form state is client; each step is a route under the wizard for deep-linking + draft persistence |
| Form validation (zod schemas) | Shared (`@super-care/shared` + phase schemas) | Browser + API both | Same Zod schema runs client-side (UX) AND server-side (trust boundary, PLAT-02). Client validation is never trusted. |
| Identifier validation (Thai ID/passport/plate/chassis/engine) | Shared pure validators | Browser + Server | Deterministic pure functions, reused on edit (client) and re-checked on submit (server). LLM never touches these. |
| OCR extraction (fake) | API / Backend (server module) | — | `OcrModule.extract` runs server-side only; reads the uploaded file from storage |
| Master-table mapping (fake) | API / Backend (server module) | Database (reads master tables) | `MapperProvider.map` is a server module; queries seeded master tables for candidates |
| File upload + encryption + storage | API / Backend (Server Action / route handler) | Database (`documentRef`) | Multipart handled server-side; bytes encrypted via CryptoService; ref persisted encrypted |
| Persistence (Customer/IdentityDocument/Vehicle/OcrResult) | Database via Phase-2 repos | API | Repos own encryption + blind-index + audit-in-transaction; actions call repos, never Prisma directly |
| Human-verify gate (CUST-07) | API / Backend (server-enforced) | Browser (disabled UI) | Server MUST reject advancement/save without verification — disabled button is UX only |
| Audit logging | Database (in-transaction) | — | `recordAudit(tx, ctx, …)` inside the same `$transaction` as the write |
| i18n message resolution | Frontend Server (next-intl) | Browser | Catalogs resolved server-side, hydrated to client; `en` default, `th` additive later |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.2.7` [VERIFIED: npm registry] [ASSUMED legitimacy] | App Router app, Server Actions, route handlers | Already the chosen backend ("Next.js full-stack + Prisma, no NestJS" — ROADMAP). engines `node>=20.9.0`; repo is Node 22. |
| `react` / `react-dom` | `19.2.7` [VERIFIED: npm registry] | UI runtime | Next 16 peer is `^19.0.0`. |
| `tailwindcss` + `@tailwindcss/postcss` | `4.3.0` [VERIFIED: npm registry] | Styling tokens | shadcn/ui's current path. Tailwind v4 uses the PostCSS plugin + CSS-first config (`@import "tailwindcss"`), no `tailwind.config.js` required. [CITED: tailwindcss.com/docs/installation] |
| `react-hook-form` | `7.77.0` [VERIFIED: npm registry] | Form state | shadcn `Form` is built on RHF; standard pairing. |
| `@hookform/resolvers` | `5.4.0` [VERIFIED: npm registry] | zod ↔ RHF bridge | Peer `react-hook-form ^7.55.0` ✓. Use `zodResolver`. |
| `zod` | `4.4.3` [VERIFIED: npm registry] | Boundary schemas (PLAT-02) | Already pinned repo-wide. Reuse for forms + Server Action inputs + OcrResult validation. |
| `next-intl` | `4.13.0` [VERIFIED: npm registry] | i18n seam | Peer `next ^16.0.0` ✓, `react ^19.0.0` ✓. `en` default now; `th` additive later. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui (CLI) | canary / `latest` [ASSUMED] | Generate code-owned Radix components | Run `pnpm dlx shadcn@canary init` then `add`. **Canary** is required for Tailwind 4 + React 19 support. [CITED: ui.shadcn.com/docs/tailwind-v4] |
| `lucide-react` | `1.17.0` [VERIFIED: npm registry] [ASSUMED] | Icons (shadcn default) | Pulled by shadcn init. Note: major-versioned now; confirm shadcn templates reference the installed major. |
| `sonner` | `2.0.7` [VERIFIED: npm registry] [ASSUMED] | Toast (save feedback) | shadcn's recommended toast since the old `toast` was deprecated. |
| `fastest-levenshtein` | `1.0.16` [VERIFIED: npm registry] [ASSUMED] | Deterministic fuzzy match in FakeMapperAdapter | Tiny, zero-dep, fast Levenshtein. Last published 2022 (stable/mature, not abandoned-risky for a pure string fn). Alternative: hand-roll normalized-equality + token overlap (no dep). |
| `@playwright/test` | `1.60.0` [VERIFIED: npm registry] | Browser e2e for the wizard | Already named in CLAUDE.md stack. Only e2e tool that exercises a running Next server. |
| `zod-form-data` | `3.0.2` [VERIFIED: npm registry] [ASSUMED] | Parse `FormData` in Server Actions to zod | Optional convenience; you can also call `Object.fromEntries(formData)` + `schema.parse`. Recommend skipping unless multipart parsing gets verbose. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fastest-levenshtein` | Hand-rolled normalized match (no dep) | One fewer dependency in a regulated PII app; mapper is fake/deterministic anyway. Recommended if the team prefers zero new runtime deps. The match algorithm is Claude's discretion (CONTEXT.md). |
| shadcn/ui | Radix primitives + Tailwind by hand | shadcn is the user's confirmed decision; do not deviate. |
| next-intl | `react-i18next` / `next-i18next` | next-intl is App-Router-native (Server Components support) and lighter to wire for the `en`-only seam. CONTEXT/UI-SPEC name next-intl explicitly. |
| Tailwind v4 | Tailwind v3 (`tailwind.config.js`) | v4 is current and is what shadcn canary targets. Use v4. |

**Installation (indicative — planner verifies at install time):**
```bash
# in apps/web
pnpm add next@16 react@19 react-dom@19 next-intl@4 react-hook-form@7 @hookform/resolvers@5
pnpm add -D tailwindcss@4 @tailwindcss/postcss@4
# shadcn (canary for Tailwind 4 + React 19); pulls lucide-react + sonner as needed
pnpm dlx shadcn@canary init
pnpm dlx shadcn@canary add button input select combobox form table dialog sheet checkbox radio-group card badge alert skeleton sonner
# mapper (optional dep)
pnpm add fastest-levenshtein
```

**Version verification:** All versions above were confirmed via `npm view <pkg> version` and peer-dependency checks on 2026-06-07. Peer compatibility confirmed: `next@16.2.7` peer react `^19.0.0`; `next-intl@4.13.0` peer next `^16` + react `^19`; `@hookform/resolvers@5.4.0` peer `react-hook-form ^7.55.0`.

## Package Legitimacy Audit

> slopcheck could not be installed in this session. Per the legitimacy protocol, **all newly added packages are tagged `[ASSUMED]`** and the planner MUST gate each net-new external install behind a `checkpoint:human-verify` task. Versions were nonetheless verified on the npm registry with peer-dep checks.

| Package | Registry | Age (last publish) | Source Repo | slopcheck | Disposition |
|---------|----------|--------------------|-------------|-----------|-------------|
| next | npm | active | github.com/vercel/next.js | n/a (unavailable) | Approved — official, already the chosen backend |
| react / react-dom | npm | active | github.com/facebook/react | n/a | Approved — official |
| tailwindcss / @tailwindcss/postcss | npm | active | github.com/tailwindlabs/tailwindcss | n/a | Approved — official |
| react-hook-form | npm | active | github.com/react-hook-form/react-hook-form | n/a | Approved |
| @hookform/resolvers | npm | active | github.com/react-hook-form/resolvers | n/a | Approved |
| next-intl | npm | active | github.com/amannn/next-intl | n/a | Approved |
| lucide-react | npm | active | github.com/lucide-icons/lucide | n/a | Flagged [ASSUMED] — pulled by shadcn init; verify version matches shadcn template |
| sonner | npm | active | github.com/emilkowalski/sonner | n/a | Flagged [ASSUMED] |
| fastest-levenshtein | npm | 2022-08 (mature) | github.com/ka-weihe/fastest-levenshtein | n/a | Flagged [ASSUMED] — or drop in favor of hand-rolled match |
| zod-form-data | npm | active | github.com/airjp73/remix-validated-form | n/a | Optional — flagged [ASSUMED] |

**Packages removed due to [SLOP]:** none (slopcheck not run).
**Packages flagged [ASSUMED]:** all of the above — planner inserts a `checkpoint:human-verify` before the install task(s).

## Architecture Patterns

### System Architecture Diagram

```
                       Staff browser (mobile or desktop)
                                  │
                  ┌───────────────┴───────────────────┐
                  │  Next.js App Router (apps/web/app) │
                  │  /intake/[id]/{start,customer,...} │
                  └───────────────┬───────────────────┘
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │ Client Components        │ Server Actions / Route handlers
        │  - RHF + zodResolver     │  (thin — API-01 seam)
        │  - shadcn/ui             │   parse FormData → zod → call module
        │  - inline identifier     │
        │    validators (shared)   │
        └─────────────────────────┼──────────────────────────┘
                                  │  (no business logic in components/actions)
                  ┌───────────────▼───────────────────┐
                  │   Server modules (apps/web/src/server) │
                  │                                        │
                  │  intake service ── orchestrates ──┐    │
                  │  OcrModule.extract(docType,file)──┤    │   ← config-selected
                  │  MapperProvider.map(ocr)──────────┤    │     FAKE adapters
                  │  StorageProvider.put/get──────────┘    │
                  │  verify-gate (server-enforced CUST-07) │
                  └───────────────┬───────────────────┘
                                  │  ActorContext { actor:"system" }
                  ┌───────────────▼───────────────────┐
                  │  Phase-2 repos (db.$transaction)   │
                  │  customer.repo / identity-document │
                  │  .repo / vehicle.repo (NEW)        │
                  │   encrypt(PII) + blindIndex +      │
                  │   recordAudit(tx, ...) atomically  │
                  └───────────────┬───────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │ Postgres (Prisma 7, PrismaPg adapter)  │
              │  customers / identity_documents /      │
              │  ocr_results (raw Json) / vehicles /   │
              │  audit_logs  + master_* (seeded)       │
              └────────────────────────────────────────┘
                       │
              LocalFsStorageAdapter → ./.uploads/<id>.enc  (gitignored,
                       AES-256-GCM via CryptoService, NOT web-served)
```

### Recommended Project Structure (Claude's discretion per CONTEXT — this is a recommendation)
```
apps/web/
├── app/                          # NEW — Next App Router (next build owns this)
│   ├── layout.tsx                # root layout, font, NextIntlClientProvider
│   ├── globals.css               # @import "tailwindcss"; design tokens
│   ├── [locale]/                 # next-intl locale segment (default en)
│   │   └── intake/
│   │       ├── new/page.tsx       # creates a draft intake, redirects to [id]/start
│   │       └── [id]/
│   │           ├── start/page.tsx
│   │           ├── customer/page.tsx
│   │           ├── document/page.tsx
│   │           ├── verify/page.tsx
│   │           ├── vehicle/page.tsx
│   │           └── review/page.tsx
│   └── api/                       # route handlers (API-01 JSON seam)
│       └── v1/intake/.../route.ts
├── messages/                     # next-intl catalogs: en.json (+ th.json later)
├── src/
│   ├── components/ui/            # shadcn-generated (code-owned)
│   ├── components/intake/        # wizard step components, Map&Verify rows
│   └── server/
│       ├── adapters/
│       │   ├── ocr/ {ocr.port.ts, fake-ocr.adapter.ts, fixtures/regbook.ts}
│       │   ├── mapper/ {mapper.port.ts, fake-mapper.adapter.ts}
│       │   ├── storage/ {storage.port.ts, localfs-storage.adapter.ts}
│       │   └── registry.ts        # config-selected provider factory
│       ├── modules/
│       │   ├── customer/customer.repo.ts        # EXISTS
│       │   ├── identity-document/...            # EXISTS
│       │   ├── vehicle/vehicle.repo.ts          # NEW
│       │   ├── lead/lead.repo.ts                # NEW (CUST-01/02)
│       │   ├── ocr-result/ocr-result.repo.ts    # NEW (persist raw)
│       │   └── intake/intake.service.ts         # NEW orchestrator + verify-gate
│       └── actions/                # thin Server Actions calling the modules
└── components.json               # shadcn config
```

### Pattern 1: Port + Adapter, config-selected at the registry
**What:** Each external concern is an interface (port) with a fake adapter now and a real one in Phase 10. A single registry chooses the implementation from env/config.
**When to use:** OCR, Mapper, Storage.
```typescript
// ocr.port.ts
export interface OcrResultRaw { [field: string]: string | null }  // raw, never cleaned
export interface OcrModule {
  extract(documentType: string, file: { bytes: Buffer; mime: string }): Promise<OcrResultRaw>;
}
// registry.ts
export function getOcrModule(): OcrModule {
  return process.env["OCR_PROVIDER"] === "google" ? /* Phase 10 */ : new FakeOcrAdapter();
}
```
[CITED: docs/ENGINEERING-STANDARDS.md §A4 deep modules / port-adapter]

### Pattern 2: Thin Server Action → server module (API-01 seam)
**What:** Server Actions parse + delegate; zero business logic in the action or component.
```typescript
"use server";
import { createCustomerInput } from "@/server/modules/customer/customer.schema";
export async function submitCustomer(intakeId: string, formData: FormData) {
  const parsed = createCustomerInput.parse(Object.fromEntries(formData)); // PLAT-02 boundary
  return intakeService.captureCustomer({ actor: "system" }, intakeId, parsed); // logic in module
}
```
Mark a file `import "server-only"` for any module that imports CryptoService/PrismaClient to guarantee it never bundles into a client component. [CITED: nextjs.org/docs server-only]

### Pattern 3: Server-enforced human-verify gate (CUST-07)
**What:** Verification is enforced in the module, not just the UI. The "Continue"/"Save" path throws if required money/legal fields are not marked verified.
```typescript
// in intake.service.ts — runs server-side on advance AND on final save
function assertVerified(state: IntakeDraft) {
  const unverified = REQUIRED_VERIFY_FIELDS.filter(f => !state.verified[f]);
  if (unverified.length) throw new VerifyGateError(unverified); // cannot persist
}
// on save: persist verifiedBy + verifiedAt and write an audit row
```
Disabled UI is UX; the server check is the contract (exit gate: "human-verify gate blocks advancement without verifiedBy").

### Pattern 4: Raw OcrResult persisted separately, never cleaned
`OcrResult.rawPayload` is `Json` — store the fake adapter's output verbatim. The verified/mapped values live on `Customer`/`Vehicle`. Zod-validate the *shape* (that it's an object of string|null) without normalizing values. [CITED: schema.prisma OcrResult; CMI-SPEC "OCR output stays a raw OcrResult"]

### Anti-Patterns to Avoid
- **Prisma `$extends`/middleware for audit** — Phase 2 deliberately rejected this; use `recordAudit(tx,…)` inside the repo transaction. [CITED: audit.service.ts]
- **Importing CryptoService / PrismaClient into a Client Component** — leaks keys into the browser bundle. Use `import "server-only"`.
- **Letting the mapper or any LLM validate identifiers** — identifiers go through the Phase-1 pure validators only.
- **Cleaning/normalizing OCR output before storing** — violates the raw-OcrResult contract.
- **Keeping `tsc -b` emit for the Next app** — `apps/web/tsconfig.json` sets `rootDir: src`/`outDir: dist` + `composite`. `app/` lives outside `src`. Let `next build`/`next dev` own the app; switch the project's typecheck to `next`-aware `tsc --noEmit` and adjust `include` (see Pitfall 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible combobox/select/dialog/stepper | Custom Radix-less widgets | shadcn/ui (Radix) | Keyboard nav, aria, focus traps are easy to get wrong (a11y is a UI-SPEC requirement) |
| Form state + error wiring | Manual `useState` per field | react-hook-form + zodResolver | Field arrays, dirty/touched, aria-describedby wiring |
| Field encryption / blind index | New crypto | Phase-2 CryptoService via repos | AES-256-GCM + HMAC already audited; never re-implement |
| Audit logging | New audit writer | `recordAudit(tx,…)` in repo | In-transaction atomicity already solved |
| i18n message resolution + locale routing | Custom context | next-intl | App-Router-native, additive `th` later |
| Levenshtein/fuzzy distance | Custom string distance | `fastest-levenshtein` (or trivial normalized match) | Edge cases in distance; though hand-rolled normalized equality is acceptable here |
| Multipart parsing | Manual stream parsing | Next built-in `FormData` in Server Actions/route handlers | Next 16 parses `multipart/form-data` natively via the Web `Request`/`FormData` API |

**Key insight:** Almost every "hard" piece (crypto, audit, validators, master data, decimal money) is already built and tested in Phases 1–2. Phase 3's risk is integration and the runnable-app conversion, not new domain logic.

## Runtime State Inventory

> This is a greenfield UI/feature phase (no rename/refactor of stored keys). Included briefly because it touches storage layout and a schema migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New: `./.uploads/<ref>.enc` encrypted blobs; `OcrResult.rawPayload` rows; new Lead/Vehicle rows | Code (new write paths); gitignore `.uploads/` |
| Live service config | None — all adapters are local fakes; no external service registers state | None |
| OS-registered state | None | None — verified, no schedulers/daemons in scope |
| Secrets/env vars | New config keys: `OCR_PROVIDER`, `MAPPER_PROVIDER`, `STORAGE_PROVIDER`, `UPLOAD_DIR`. Reuses existing `MASTER_KEY_V1`/`INDEX_KEY`/`DATABASE_URL`. | Add to `.env.example` + USER-SETUP; no new secrets |
| Build artifacts | `apps/web/dist/` + `tsconfig.tsbuildinfo` from the current `tsc -b` library build become stale once `app/` is added | Reconcile build (Pitfall 1); `.next/` already gitignored |

**Schema migration required (BLOCKING for the slice):**
- `Lead` has **no** `customerId`/`convertedAt` → cannot represent CUST-02 (Lead→Customer). Add the relation.
- `Vehicle` has **no** `verifiedBy`/`verifiedAt` → cannot satisfy CUST-07 "record verifiedBy". Add fields (also consider on `Customer`/`IdentityDocument` for verified PII fields).
- No draft-intake model → UI-SPEC's "progress persisted to a draft intake" needs a decision (a `DraftIntake` table vs. step-by-step direct persistence of Lead/Customer/etc.). See Open Questions.

## Common Pitfalls

### Pitfall 1: The `tsc -b` library build vs. the Next app build collide
**What goes wrong:** `apps/web/tsconfig.json` has `rootDir: "src"`, `outDir: "dist"`, `composite: true`, and is part of the root `tsc -b` (the repo's `typecheck`/`build`). Adding `app/` (outside `src`) breaks `rootDir`; Next wants its own `tsconfig` with `jsx`, `moduleResolution: bundler`, `plugins: [{name:"next"}]`, `noEmit`.
**Why it happens:** The shell was authored as a pure library to participate in project references.
**How to avoid:** Convert `apps/web` to a Next-owned tsconfig (drop `rootDir`/`outDir` emit, set `jsx: "preserve"`, `noEmit: true`, include `app`+`src`+`next-env.d.ts`). Decide how the *server modules* still get typechecked by CI (`pnpm typecheck`). Recommended: keep `packages/shared` on `tsc -b`; run `next build`/`tsc --noEmit -p apps/web` for the web app. Update root `typecheck` script accordingly. **This is Wave-0 work** and must land before any step page.
**Warning signs:** `tsc -b` errors about files outside `rootDir`; `.next` type plugin not loaded; ESLint flat config currently ignores `*.config.ts` and only globs `apps/**/src/**` — it will **not lint `app/`** until `eslint.config.mjs` is extended (add `eslint-config-next` / FlatCompat).

### Pitfall 2: shadcn + Tailwind 4 + React 19 needs the canary CLI
**What goes wrong:** Stable `shadcn` CLI scaffolds Tailwind v3 config and may peer-warn on React 19.
**How to avoid:** Use `shadcn@canary init`/`add`; Tailwind v4 uses `@import "tailwindcss"` + `@tailwindcss/postcss` (no `tailwind.config.js`); set the `--legacy-peer-deps` equivalent only if a transitive peer complains. Configure `components.json` aliases to the monorepo `@/` path. [CITED: ui.shadcn.com/docs/tailwind-v4] (MEDIUM — verify exact canary flags at install)

### Pitfall 3: Thai script rendering
**What goes wrong:** Master data + OCR values are Thai (e.g. `กรุงเทพมหานคร`); a Latin-only font shows tofu/boxes.
**How to avoid:** Use `next/font` with a Thai-capable family (e.g. `Noto Sans Thai` + `Inter`, or `IBM Plex Sans Thai`). Verify in the seeded Bangkok/Toyota rows. (UI-SPEC requirement.)

### Pitfall 4: Prisma 7 in Next — server-only import + singleton + no auto-.env
**What goes wrong:** Re-instantiating PrismaClient on HMR exhausts connections; importing the client into a client component bundles it; Prisma 7 does **not** auto-load `.env` at runtime.
**How to avoid:** The singleton already exists (`server/db/client.ts`, globalThis-cached). Keep all repo/crypto imports behind `server-only`. Next loads `.env`/`.env.local` for the app automatically, but scripts (seed) load env manually (already handled). Confirm `DATABASE_URL` is present for `next dev`. [CITED: server/db/client.ts; seed.ts]

### Pitfall 5: Client-side validation is not a trust boundary
**What goes wrong:** Relying on RHF/zodResolver in the browser to enforce identifier validity or the verify gate.
**How to avoid:** Re-parse with the same zod schema and re-run the pure validators **inside the Server Action/module**; enforce the verify gate server-side (Pattern 3). Client validation is UX only.

### Pitfall 6: Uploaded files must be encrypted and never web-served
**What goes wrong:** Writing uploads under `public/` or returning a static URL exposes PII documents.
**How to avoid:** `LocalFsStorageAdapter` writes AES-256-GCM ciphertext (via CryptoService) to `./.uploads` (gitignored, outside `public/`). Serving a doc back goes through an authenticated server route that decrypts in-memory (auth lands Phase 7; for now the route is open but still decrypts server-side). Persist only the **encrypted** `documentRef`.

### Pitfall 7: Multipart size/type limits + Server Action body cap
**What goes wrong:** Server Actions have a body-size limit (default ~1MB) — a reg-book photo/PDF will exceed it and 413.
**How to avoid:** Either raise `serverActions.bodySizeLimit` in `next.config` for the upload action, or upload via a route handler that streams `request.formData()`. Enforce max size + allowed MIME (image/*, application/pdf) server-side before calling OCR. (MEDIUM — confirm the Next 16 default/limit at implementation.)

## Code Examples

### Tailwind v4 entry + Thai font (globals.css + layout)
```css
/* app/globals.css */
@import "tailwindcss";
/* design tokens come from shadcn init (@theme / :root css vars) */
```
```tsx
// app/layout.tsx
import { Inter, Noto_Sans_Thai } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const thai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-thai" });
// apply `${inter.variable} ${thai.variable}` on <html>; font-family stack includes both
```
[CITED: nextjs.org/docs/app/building-your-application/optimizing/fonts]

### RHF + zodResolver + shared validator on the client
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isValidThaiNationalId } from "@super-care/shared/validators";

const customerSchema = z.object({
  firstName: z.string().min(1),
  nationalId: z.string().refine(isValidThaiNationalId, { message: "invalid_thai_id" }),
  // ...
});
const form = useForm({ resolver: zodResolver(customerSchema) });
```
The same `customerSchema` is imported in the Server Action and re-parsed (PLAT-02).

### Deterministic FakeMapperAdapter (suggestions only)
```typescript
import { distance } from "fastest-levenshtein";
// candidates loaded from a master table (e.g. master_car_brands)
function rank(rawValue: string, candidates: {id:string; name:string; nameTh?:string|null}[]) {
  const norm = (s:string) => s.trim().toUpperCase();
  return candidates
    .map(c => ({ id: c.id, label: c.name,
       score: Math.min(distance(norm(rawValue), norm(c.name)),
                       c.nameTh ? distance(rawValue.trim(), c.nameTh.trim()) : Infinity) }))
    .sort((a,b)=>a.score-b.score)
    .slice(0, 5); // ranked suggestions — never auto-commit, never validate identifiers
}
```

### next-intl minimal seam (en default)
```ts
// i18n/request.ts (next-intl) — load messages/en.json; locale defaults to "en"
// components use useTranslations("intake") — NO hardcoded user-facing strings
```
[CITED: next-intl.dev/docs/getting-started/app-router]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` (v3) | CSS-first `@import "tailwindcss"` + `@tailwindcss/postcss` (v4) | Tailwind 4 (2025) | No JS config file; tokens in CSS `@theme` |
| Next Pages Router + `getServerSideProps` | App Router + Server Components + Server Actions | Next 13→16 | Mutations via actions; route handlers for JSON API |
| shadcn `toast` | `sonner` | 2024 | Use Sonner for save feedback |
| react-i18next default | next-intl for App Router | — | Server-Component-aware i18n |

**Deprecated/outdated:**
- shadcn legacy `toast` component → use `sonner`.
- Tailwind v3 config-file workflow → v4 CSS-first.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn `@canary` CLI is required and works for Tailwind 4 + React 19 + Next 16 | Standard Stack / Pitfall 2 | Init flags/components differ; Wave-0 setup task needs adjustment (low — well-documented path) |
| A2 | `fastest-levenshtein` is the mapper dep (vs. hand-rolled) | Don't Hand-Roll / Code Examples | Trivial swap; match algorithm is Claude's discretion |
| A3 | Server Action body limit (~1MB default) too small for reg-book uploads → use route handler or raise limit | Pitfall 7 | If default is larger, the extra config is harmless |
| A4 | A schema migration (Lead.customerId, Vehicle.verifiedBy/verifiedAt, draft-intake decision) is in scope for Phase 3 | Runtime State Inventory / Open Questions | If deferred, CUST-02 and CUST-07 cannot be fully satisfied — must confirm with user |
| A5 | All net-new packages legitimate (slopcheck unavailable; versions verified on registry only) | Package Legitimacy Audit | Planner gates installs behind checkpoint:human-verify |
| A6 | Converting `apps/web` off `tsc -b` emit to a Next-owned tsconfig won't break `packages/shared` project refs | Pitfall 1 | CI typecheck breakage; mitigated by Wave-0 build-reconciliation task |
| A7 | Uploads can be served back (Phase 7+) via an authenticated decrypting route; Phase 3 leaves it open | Pitfall 6 | Acceptable per "NO auth" decision |

## Open Questions

1. **Draft-intake persistence model**
   - What we know: UI-SPEC says "progress persisted to a draft intake"; each step is a route under `[id]`.
   - What's unclear: Whether to add a `DraftIntake` table (holds partial state + per-field verify flags + a step pointer) or to persist directly into Lead/Customer/IdentityDocument/Vehicle as each step completes.
   - Recommendation: Add a lightweight `DraftIntake` (or `Intake`) row keyed by cuid that references the entities as they're created and stores the `verified` map + current step; finalize on Review. This makes the verify-gate state and resumability first-class and keeps half-finished records out of the domain tables. Confirm with user (schema decision).

2. **Where do `verifiedBy`/`verifiedAt` live, and which fields are "required money/legal"?**
   - What we know: CUST-07 requires recording `verifiedBy`; exit gate checks it; UI-SPEC marks "required money/legal" fields per-field.
   - What's unclear: Phase 3 has no money fields yet (pricing is Phase 4). The "money/legal" set here is effectively the **legal/identity** fields (identifiers, names, vehicle identifiers, master mappings).
   - Recommendation: Define `REQUIRED_VERIFY_FIELDS` explicitly in the intake module (planner/discuss to confirm the list); store verification on the draft-intake (per-field) and stamp `verifiedBy`/`verifiedAt` on the persisted Vehicle/Customer + an audit row.

3. **Lead→Customer conversion shape**
   - Recommendation: add `Lead.customerId String? @unique` + `Lead.convertedAt DateTime?`; "convert" creates the Customer and links the Lead (audit on both).

4. **Master-data sparsity for the mapper**
   - What we know: only example rows are seeded (Toyota/Honda, Bangkok, 6 titles, 23 colors, 3 insurers). Full imports are a deferred `[DATA]` item.
   - Recommendation: FakeMapperAdapter ranks against whatever is seeded; FakeOcr canned dataset should use **seeded** values so the demo maps cleanly. Don't block on full imports (deferred).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Next 16 (`>=20.9.0`) | ✓ (CI Node 22) | 22 | — |
| pnpm | monorepo | ✓ | 10.x | — |
| Postgres (dev) | repos / `next dev` against real DB | needs local instance | 17 in CI | Integration tests already require `TEST_DATABASE_URL`; dev needs `DATABASE_URL`. **User-provided infra:** a local/remote dev Postgres. |
| Prisma 7 client | generated | ✓ | 7.8.0 | — |
| Playwright browsers | e2e | install needed | 1.60 | `pnpm exec playwright install` adds Chromium (no Docker required) |

**Missing dependencies with no fallback:** A reachable **dev Postgres** for running the app locally (CONTEXT/CI already assume one for integration tests). Flag to user.
**Missing with fallback:** Playwright browser binaries — install via CLI, no Docker.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`). `tdd_mode: false` (TDD not forced this phase — partial per ROADMAP: raw-OcrResult contract + verify-gate are enforced/tested).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.8` (unit + integration projects already configured) |
| Config file | `vitest.config.ts` (unit), `vitest.integration.config.ts` (`*.int.spec.ts`, real Postgres) |
| Quick run command | `pnpm test` (DB-free unit) |
| Full suite command | `pnpm test` + `TEST_DATABASE_URL=… pnpm test:int` |
| E2E framework | `@playwright/test` 1.60 — **Wave 0 (new)**; requires a running `next` server |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CUST-01 | Capture Lead | unit (zod) + integration (lead.repo) | `pnpm test` / `pnpm test:int` | ❌ Wave 0 |
| CUST-02 | Lead→Customer link + audit | integration | `pnpm test:int` | ❌ Wave 0 |
| CUST-03 | Attach IdentityDocument + encrypted file ref | integration | `pnpm test:int` | ⚠ repo exists; storage path new |
| CUST-04 | Fake OCR returns **raw** OcrResult (never cleaned); persisted as Json | unit (adapter contract) + integration (ocr-result.repo) | `pnpm test` / `pnpm test:int` | ❌ Wave 0 |
| CUST-07 | Verify gate blocks save without verifiedBy; records verifiedBy/At + audit | unit (gate fn) + integration (persist + audit row) | `pnpm test` / `pnpm test:int` | ❌ Wave 0 |
| VEH-01 | Capture Vehicle (plate/chassis/engine), encrypted chassis/engine | integration (vehicle.repo) | `pnpm test:int` | ❌ Wave 0 (new repo) |
| CMI-02 | Select insurer + New/Renewal starts intake | unit (action logic) + e2e | `pnpm test` / Playwright | ❌ Wave 0 |
| CMI-03 | Reg-book OCR → raw owner+vehicle fields | unit (FakeOcr fixtures) | `pnpm test` | ❌ Wave 0 |
| CMI-04 | Mapper returns ranked suggestions; never validates identifiers | unit (mapper match + "no identifier validation" structural test) | `pnpm test` | ❌ Wave 0 |
| UI-01 | Mobile responsive wizard | e2e (viewport) / manual | Playwright (mobile viewport) | ❌ Wave 0 |
| API-01 | Logic in modules; route handler JSON seam | unit (module called by both action + route) | `pnpm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (DB-free unit — fast, the repo's "every task commit" guarantee).
- **Per wave merge:** `pnpm typecheck && pnpm lint && pnpm test` + `pnpm test:int` (real Postgres) + Playwright smoke if a wizard step changed.
- **Phase gate:** full unit+integration green; Playwright happy-path (Start→Review→Save) green; verify-gate negative test green; before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Make `apps/web` runnable (Next config, `app/`, scripts `dev`/`build`/`start`, tsconfig/eslint reconciliation) — Pitfall 1.
- [ ] Prisma migration: `Lead.customerId/convertedAt`, `Vehicle.verifiedBy/verifiedAt`, draft-intake model (per Open Questions) — **BLOCKING**.
- [ ] `vehicle.repo.ts` + `vehicle.repo.int.spec.ts` (encrypt chassis/engine, blind-index, audit-in-tx) mirroring customer.repo.
- [ ] `lead.repo.ts` + `ocr-result.repo.ts` + int specs.
- [ ] Port interfaces + fakes: `fake-ocr.adapter` (+ fixtures using seeded master values), `fake-mapper.adapter`, `localfs-storage.adapter` + unit specs (mapper ranking; "raw OcrResult never cleaned"; "mapper never validates identifiers"; storage encrypt round-trip).
- [ ] `intake.service` verify-gate unit spec (negative: missing verification throws).
- [ ] Playwright config + browser install (`playwright install`); first e2e covering the happy path; mobile-viewport check (UI-01).
- [ ] next-intl scaffolding + `messages/en.json`; lint rule/check for no-hardcoded-strings.
- [ ] CI: add `pnpm exec playwright install --with-deps` + a build/e2e step (or gate e2e to a separate job). Extend ESLint flat config to lint `app/`.

## Security Domain

> `security_enforcement: true`, ASVS level 1, block_on high.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 7) | Screens open now; `ActorContext{actor:"system"}` placeholder threaded to repos |
| V3 Session Management | no (Phase 7) | — |
| V4 Access Control | partial | No RBAC yet, but uploads must NOT be web-served / publicly reachable (Pitfall 6) |
| V5 Input Validation | **yes** | zod at every boundary (Server Actions, route handlers, OcrResult shape) + pure identifier validators; client validation re-checked server-side |
| V6 Cryptography | **yes** | Phase-2 CryptoService (AES-256-GCM) for PII + uploaded blobs; never hand-roll; blind index via HMAC |
| V7 Error/Logging | **yes** | Audit-in-transaction (`recordAudit`) for every PII write; do not log decrypted PII; `--redact` already in gitleaks |
| V12 Files & Resources | **yes** | Upload size/MIME allowlist server-side; store encrypted, outside `public/`; no path traversal in `documentRef` |

### Known Threat Patterns for Next.js + Prisma + file upload
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PII in browser bundle (CryptoService/Prisma imported client-side) | Information Disclosure | `import "server-only"`; keep crypto/repos in `src/server` |
| Unrestricted file upload (oversize / wrong type / executable) | DoS / Tampering | Server-side size + MIME allowlist; store as opaque encrypted blob, never execute |
| Publicly served identity documents | Information Disclosure | `.uploads` gitignored + outside `public/`; decrypt only via server route |
| Client-only validation bypass (forged identifier / unverified field) | Tampering | Re-parse zod + re-run validators + verify-gate server-side |
| LLM/mapper validating identifiers | Tampering / integrity | Mapper structurally cannot call validators; pure validators only |
| SQL injection | Tampering | Prisma parameterized queries (no raw SQL) |
| Path traversal via `documentRef` | Tampering | Generate refs server-side (cuid); never derive path from user input |
| Audit gap on PII write | Repudiation | `recordAudit(tx,…)` in same transaction; audit failure fails the write |

## Sources

### Primary (HIGH confidence)
- Codebase (read in session): `apps/web/{package.json,tsconfig.json,prisma/schema.prisma,prisma/seed.ts}`, `apps/web/src/server/{db/client.ts,crypto/crypto.service.ts,audit/audit.service.ts,modules/customer/customer.repo.ts,modules/identity-document/identity-document.repo.ts}`, `packages/shared/src/{index.ts,validators/index.ts}`, root `{package.json,tsconfig.base.json,eslint.config.mjs,vitest.config.ts,vitest.integration.config.ts,.gitignore}`, `.github/workflows/*.yml`, `.planning/config.json`, `CLAUDE.md`.
- npm registry (`npm view <pkg> version` / `peerDependencies`), queried 2026-06-07 — version + peer verification for all stack packages.
- `.planning/phases/03-identity-vehicle-capture-fakes/{03-CONTEXT.md,03-UI-SPEC.md}`, `.planning/{REQUIREMENTS.md,ROADMAP.md}`, `docs/CMI-SPEC.md` — scope/decisions/data contract.

### Secondary (MEDIUM confidence)
- shadcn/ui Tailwind v4 + React 19 canary guidance [CITED: ui.shadcn.com/docs/tailwind-v4] — exact canary flags to confirm at install.
- Next.js App Router docs (Server Actions body limit, server-only, fonts, multipart) [CITED: nextjs.org/docs] — confirm Next 16 specifics at implementation.
- next-intl App Router setup [CITED: next-intl.dev/docs].

### Tertiary (LOW confidence)
- Package legitimacy: slopcheck unavailable this session → all net-new packages `[ASSUMED]`, gated by planner checkpoints.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions + peers verified on registry 2026-06-07.
- Architecture: HIGH — derived from existing Phase-2 code + explicit CONTEXT decisions.
- Runnable-app conversion (tsconfig/eslint/build): MEDIUM — known-good Next pattern but the repo's `tsc -b` library setup needs careful Wave-0 reconciliation.
- shadcn/Tailwind4/Next16 integration flags: MEDIUM — canary path documented but verify at install.
- Pitfalls / security: HIGH — grounded in repo conventions and ASVS.

**Research date:** 2026-06-07
**Valid until:** 2026-06-21 (fast-moving frontend stack — Next/shadcn/Tailwind versions; re-verify before install)
