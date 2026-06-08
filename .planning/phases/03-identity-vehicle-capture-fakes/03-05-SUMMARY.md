---
phase: 03-identity-vehicle-capture-fakes
plan: "05"
subsystem: intake-wizard-ui
tags: [next-intl, react-hook-form, zod, shadcn, server-actions, ocr, wizard]
dependency_graph:
  requires: ["03-04"]
  provides: ["intake-wizard-steps-1-3", "thin-server-actions", "happy-path-e2e-scaffold"]
  affects: ["03-06"]
tech_stack:
  added:
    - shadcn/ui components (button, form, input, select, radio-group, card, skeleton, alert, badge, label, sonner, separator)
  patterns:
    - "Server Action (thin) → intake.service (API-01 seam)"
    - "react-hook-form + zodResolver + shared schema (PLAT-02 client+server parity)"
    - "Inline combobox (accessible ARIA) for master data"
    - "Cascading selects (province → district → subdistrict)"
    - "State-machine document upload (idle/uploading/success/error)"
key_files:
  created:
    - apps/web/e2e/intake-happy-path.spec.ts
    - apps/web/e2e/fixtures/test-reg-book.jpg
    - apps/web/src/server/actions/intake.actions.ts
    - apps/web/app/[locale]/intake/new/page.tsx
    - apps/web/app/[locale]/intake/[id]/layout.tsx
    - apps/web/app/[locale]/intake/[id]/start/page.tsx
    - apps/web/app/[locale]/intake/[id]/customer/page.tsx
    - apps/web/app/[locale]/intake/[id]/document/page.tsx
    - apps/web/src/components/intake/wizard-steps.tsx
    - apps/web/src/components/intake/start-form.tsx
    - apps/web/src/components/intake/customer-form.tsx
    - apps/web/src/components/intake/document-upload.tsx
    - apps/web/src/components/ui/{button,form,input,select,radio-group,card,skeleton,alert,badge,label,sonner,separator}.tsx
  modified:
    - apps/web/messages/en.json (full intake wizard i18n catalog)
    - apps/web/next.config.ts (retain bodySizeLimit)
    - apps/web/src/server/modules/intake/intake.service.ts (.js extension fix)
    - apps/web/src/server/modules/draft-intake/draft-intake.repo.ts (.js extension fix)
    - apps/web/src/server/adapters/registry.ts (.js extension fix)
    - apps/web/src/server/audit/audit.service.ts (.js extension fix)
    - apps/web/src/server/db/client.ts (.js extension fix)
    - apps/web/src/server/crypto/crypto.service.ts (.js extension fix)
    - (10 more server module files — .js extension strip for Turbopack bundler resolution)
decisions:
  - "Thin Server Actions pattern: actions parse FormData via Zod schema then delegate 100% to intake.service; zero business logic in actions (API-01)"
  - "Type-only import of OcrResultRaw in client component (erased at runtime — no server-only code leak, T-03-18)"
  - "Dropzone with full state machine (idle/uploading/success/error) — never silently advances on error (T-03-16)"
  - "Cascading province→district→subdistrict with postal code auto-fill from subdistrict"
  - ".js extension stripped from all server module relative imports — Turbopack bundler resolution requires extensionless paths"
metrics:
  duration: "~2.5 hours"
  completed: "2026-06-08"
  tasks_completed: 3
  tasks_total: 3
  files_created: 22
  files_modified: 11
---

# Phase 3 Plan 05: Intake Wizard UI Steps 1–3 Summary

**One-liner:** Intake wizard steps 1–3 (Start/Customer/Document+OCR) over thin Server Actions calling intake.service, with RHF+zod forms, accessible inline comboboxes, cascading address selects, and a full upload→OCR→raw-display state machine.

## Tasks Completed

| # | Task | Commit | Key files |
|---|------|--------|-----------|
| 1 | Failing e2e scaffold + thin Server Actions + Start step | ccff943 | intake-happy-path.spec.ts, intake.actions.ts, /intake/new, /intake/[id]/start, start-form.tsx, wizard-steps.tsx |
| 2 | Customer step (Lead→Customer form, inline validators) | 6322f46 | customer-form.tsx, /intake/[id]/customer |
| 3 | Document & OCR step (upload → fake extract → raw OcrResult) | 5f613fc | document-upload.tsx, /intake/[id]/document |

## Verification Results

- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm exec vitest run apps/web/src/server/modules/intake`: PASS (15/15 tests)
- `pnpm --filter @super-care/web build`: PASS (6 routes compiled)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing Turbopack build failure — .js imports not resolved**

- **Found during:** Task 1 build verification
- **Issue:** The existing server modules (from 03-03/03-04) used `.js` explicit extensions in relative imports (e.g., `from "../audit/audit.service.js"`). This is correct for Node.js ESM but Turbopack's bundler module resolution does NOT strip `.js` to find `.ts` source files. The build was already failing before this plan (confirmed by git stash test).
- **Fix:** Stripped `.js` extensions from all relative imports in 18 server-side `.ts` files using a targeted `perl` one-liner. The `tsconfig.json` already uses `moduleResolution: bundler`, so extensionless imports are the correct choice for both typecheck and Turbopack.
- **Files modified:** All files under `apps/web/src/server/` (adapters, crypto, audit, db, modules)
- **Commits:** ccff943

**2. [Rule 2 - Missing critical] exactOptionalPropertyTypes compliance in type mappings**

- **Found during:** Task 1 typecheck
- **Issue:** Three type errors from `exactOptionalPropertyTypes: true` in tsconfig — passing `string | undefined` to optional properties typed as `string?`, and a shadcn sonner theme type mismatch.
- **Fix:** Added explicit undefined guards (`messages[0] !== undefined`) and rebuilt the `CaptureCustomerInput` object using conditional spread to satisfy exact optional types. Fixed sonner theme cast.
- **Files modified:** start-form.tsx, intake.actions.ts, sonner.tsx

**3. [Rule 1 - Bug] eslint-disable comment for non-existent rule**

- **Found during:** Task 2 lint check
- **Issue:** Used `react-hooks/exhaustive-deps` eslint-disable comments but the `react-hooks` eslint plugin is not installed in this project.
- **Fix:** Removed the invalid disable comments.
- **Files modified:** customer-form.tsx

## Architecture Decisions

### Server Actions seam (API-01)

All three actions (`startIntakeAction`, `captureCustomerAction`, `uploadDocumentAction`) follow the exact same pattern:
1. Parse `FormData` via the Zod schema (PLAT-02 boundary — server re-parse)
2. Delegate to `intake.service` with `ctx = { actor: "system" }`
3. Return `ActionResult<T>` (never throw to client; return error shape)

Zero business logic in actions. The service owns all orchestration.

### OcrResultRaw in client component (T-03-18)

The `DocumentUpload` client component imports `OcrResultRaw` as a `type` import only. TypeScript erases this at runtime — no server-only code (crypto, Prisma) can leak into the client bundle.

### Cascading address selects

Province → district → subdistrict cascade is implemented fully client-side using data passed from the server (all provinces/districts/subdistricts fetched once at page load). District is disabled until province is selected; subdistrict is disabled until district is selected. Postal code auto-fills when a subdistrict is selected.

## Known Stubs

- The happy-path e2e test is marked `test.fail()` — steps 4–6 (Map+Verify, Vehicle, Review) are not yet built (03-06 work). The partial test (Start step redirect) runs without `test.fail`.
- Continue button on the Document step links to `/verify` which does not exist yet — built in 03-06.
- The layout's back link points to `/${locale}` (home) since there's no intakes list page yet.

## Threat Surface Scan

No new network endpoints beyond what the plan specifies. File upload handled via Server Action with server-side MIME + size enforcement (T-03-16 mitigated). No new trust boundaries introduced.

## Self-Check

- [x] e2e test file exists: `apps/web/e2e/intake-happy-path.spec.ts` — FOUND
- [x] Server actions exist: `apps/web/src/server/actions/intake.actions.ts` — FOUND
- [x] wizard-steps.tsx: FOUND
- [x] start-form.tsx: FOUND
- [x] customer-form.tsx: FOUND
- [x] document-upload.tsx: FOUND
- [x] /intake/new route: FOUND
- [x] /intake/[id]/start route: FOUND
- [x] /intake/[id]/customer route: FOUND
- [x] /intake/[id]/document route: FOUND
- [x] Commits: ccff943 (Task 1), 6322f46 (Task 2), 5f613fc (Task 3) — all verified in git log

## Self-Check: PASSED
