# Phase 3: Identity & Vehicle Capture (fakes) - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Source:** Inline context capture (PROJECT.md + ROADMAP + Phase 1/2 outputs + standards; 3 decisions confirmed with user)

<domain>
## Phase Boundary

The first **UI phase**: a staff/agent **back-office** web flow (Next.js, mobile-responsive)
that captures a customer + vehicle for a Thai CMI order, on **fake** OCR + mapping adapters.

The capture flow (one vertical slice):
1. Staff starts an intake: selects **insurance company** + **New Policy or Renewal** (CMI-02).
2. Captures a **Lead** (contact + intent) and converts to **Customer** (CUST-01/02).
3. Uploads the **vehicle registration book** file; **OcrModule.extract** (fake adapter) returns
   a **raw `OcrResult`** of owner + vehicle fields (CMI-03, CUST-04) — never cleaned/normalized.
4. **MapperProvider.map** (fake deterministic matcher) suggests master-table entries for the
   raw OCR values (CMI-04) — suggestions only, never auto-committed, never validates identifiers.
5. Staff **human-verifies/corrects** every money/legal field before it can advance (CUST-07);
   identifiers are accepted/rejected by the Phase-1 pure validators (LLM never validates them).
6. Persist **Customer**, **IdentityDocument** (+ uploaded file ref), and **Vehicle** (VEH-01)
   via the Phase-2 repositories — encrypted PII, blind-index, audit-on-write in one transaction.

In scope: the back-office UI + server actions + the three fake adapters (OCR, Mapper, Storage)
+ wiring to Phase-2 persistence + Phase-1 validators.

Out of scope (Phase 3): authentication/login/RBAC (Phase 7 — screens are open for now, a
system/staff actor context is passed to repos); pricing/Premium/FxQuote/Order/Invoice (Phase 4);
payment (Phase 5); certificate (Phase 6); real OCR (Google Document AI), real AI mapping
(Claude/GPT), and real object storage (all Phase 10); customer self-serve / partner / customer
portals (Phases 7–9).
</domain>

<decisions>
## Implementation Decisions

### UI stack (CONFIRMED with user)
- **Tailwind CSS + shadcn/ui** (Radix-based, code-owned, accessible). Components: Button, Form,
  Input, Select/Combobox, Table, Dialog, Stepper/Steps, Toast. Mobile-responsive (UI-01) — the
  capture flow works on phone widths (stacked forms, touch targets) and desktop.
- **Next.js App Router**; **Server Actions** for mutations (form submits), route handlers where a
  JSON endpoint is warranted (API-01 seam — logic stays in server modules, not components).
- Forms: **react-hook-form + @hookform/resolvers (zod)**; the Zod schemas are the boundary
  validators (PLAT-02). Reuse `@super-care/shared` identifier validators in the verify step.

### Document storage (CONFIRMED with user)
- **StorageProvider** interface; **LocalFsStorageAdapter** for dev → files under `./.uploads`
  (gitignored), encrypted at rest, NOT under the web root / never statically served. Swap to
  object storage (S3/R2/Hostinger) later via the seam. The DB stores the encrypted `documentRef`
  (Phase 2 `IdentityDocument.documentRef`).

### AI mapping (CONFIRMED with user)
- **MapperProvider** interface; **FakeMapperAdapter** = deterministic rule/fuzzy match of raw OCR
  text to master-table rows (e.g. brand text → `master_car_brands`), returning ranked
  **suggestions** for human selection. Real LLM mapper swaps in at Phase 10. The mapper NEVER
  performs identifier checksum validation and NEVER auto-commits a money/legal field.

### Adapters / deep modules (port + adapter via DI, server-side in apps/web)
- `OcrModule.extract(documentType, file) → OcrResult` — `FakeOcrAdapter` returns canned raw
  reg-book fields (owner name/address, ID/passport number, plate, province, brand, model, year,
  chassis, engine, engine cc, weight, seats, color) matching `docs/CMI-SPEC.md` OCR field list.
- All three providers (Ocr, Mapper, Storage) are selected by config so real adapters drop in later.

### Persistence & audit
- Use Phase-2 repositories (`customer.repo`, `identity-document.repo`, + a new `vehicle.repo`)
  so PII is encrypted, blind-indexed, and **every write logs an audit row in the same transaction**.
- Actor context = a system/staff placeholder until auth (Phase 7); thread it through repos now.
- Raw `OcrResult` persisted as-is (Zod-validated), separate from the verified/mapped values.

### Claude's Discretion
- Exact route/folder layout under `apps/web/app` and `apps/web/src/server`; component file
  organization; the stepper UX details; fake OCR canned dataset contents; fuzzy-match algorithm.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/phases/03-identity-vehicle-capture-fakes/03-UI-SPEC.md` — the screen/design contract (read for UI work).
- `docs/CMI-SPEC.md` — the workflow, OCR field list, application fields, master tables to map into.
- `docs/GLOSSARY.md` — Lead, Customer, IdentityDocument, OcrResult, Vehicle, Market (exact terms).
- `docs/ENGINEERING-STANDARDS.md` — deep modules/adapters, Zod boundaries, no-LLM-on-identifiers, audit.
- `.planning/PROJECT.md` / `.planning/REQUIREMENTS.md` — CUST-01..04/07, VEH-01, CMI-02/03/04, UI-01, API-01.
- `apps/web/src/server/modules/*` + `apps/web/src/server/audit/*` + `apps/web/prisma/schema.prisma` — Phase-2 repos, audit, schema to build on.
- `apps/web/src/server/crypto/*` — CryptoService/blind-index used by repos.
- `packages/shared/src/validators/*` — identifier validators to reuse in the verify step.
</canonical_refs>

<specifics>
## Specific Ideas

- A multi-step **intake wizard**: Company/Type → Customer → Upload+OCR → Map+Verify → Vehicle → Review.
- The Map+Verify screen shows raw OCR value next to the mapped master-table suggestion with an
  editable control; nothing advances until required money/legal fields are confirmed (CUST-07).
- Identifier fields show inline validation errors from the Phase-1 validators.
- Mobile: wizard steps stack; tables become cards; sticky primary action.
</specifics>

<deferred>
## Deferred Ideas

- Auth/login/RBAC + who-is-the-actor → Phase 7.
- Pricing/Order/Invoice → Phase 4; Payment → Phase 5; Certificate → Phase 6.
- Real OCR (Google Document AI), real AI mapping (Claude/GPT), real object storage → Phase 10.
- Customer self-serve / partner / customer portals → Phases 7–9.
- Full master-table reference imports ([DATA] follow-up from Phase 2) — mapping works against whatever is seeded.
</deferred>

---

*Phase: 03-identity-vehicle-capture-fakes*
*Context gathered: 2026-06-07 via inline capture*
