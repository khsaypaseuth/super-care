# Phase 3 — UI Design Contract (UI-SPEC)

**Scope:** Staff/agent back-office **intake wizard** for capturing a customer + vehicle for a
Thai CMI order, on fake OCR/mapping adapters. Mobile-responsive (UI-01). No auth UI (Phase 7).

> This is a design contract for the planner/executor. Implementation uses the project's
> `frontend-design` skill for production-grade quality. Stack: Next.js App Router + Tailwind +
> shadcn/ui + react-hook-form (zod resolver).

## Visual direction

- **Tone:** clean, trustworthy, calm fintech/insurance. Professional, uncluttered, generous
  whitespace, clear hierarchy. Not flashy; instills confidence handling money/IDs.
- **Theme:** light theme first; design tokens via Tailwind/shadcn CSS variables (dark-mode-ready
  but dark not required this phase). One primary brand color + neutral grays + semantic
  success/warning/destructive. Rounded-md, subtle borders/shadows, accessible contrast (WCAG AA).
- **Typography:** one clean sans (system/Inter-like); must render **Thai script** correctly
  (master data + OCR values are Thai) — pick a Thai-capable font stack.
- **Density:** comfortable on desktop; touch-friendly (≥44px targets) on mobile.

## App shell

- Top app bar: product name/logo (left), intake context (insurer + New/Renewal badge) once set,
  placeholder user menu (real auth Phase 7). Optional left nav on desktop (collapses to a
  sheet/drawer on mobile). Main content area hosts the wizard.

## Primary flow — Intake wizard (shadcn Steps)

Steps (each a route under the wizard; progress persisted to a draft intake):

1. **Start** — select **Insurance Company** (Combobox from `insurance_companies`) + **Policy
   type / New vs Renewal** (CMI-02). Primary: "Continue".
2. **Customer** — Lead→Customer form (CUST-01/02): title (master_title_names), first/last name,
   card type (master_card_types) + card number, nationality (master_nationalities), DOB, phone,
   email, address (province/district/subdistrict cascading Selects + postal code). Identifier
   fields show inline validation from `@super-care/shared` validators (e.g. Thai National ID
   checksum) — errors block continue.
3. **Document & OCR** — upload the **vehicle registration book** (image/PDF) (CUST-03). Show an
   **extracting** state while `OcrModule.extract` runs (fake), then display the **raw OcrResult**
   read-only (CMI-03/CUST-04) — clearly labelled "raw OCR (unverified)".
4. **Map & Verify** — the core screen (CMI-04 + CUST-07). For each field: show **raw OCR value**
   beside the **mapped suggestion** (master-table Combobox prefilled from MapperProvider), with
   an editable control and a per-field **Verified** check. A required money/legal field cannot be
   confirmed until human-verified/corrected; **"Continue" is disabled** until all required fields
   are verified. Identifier fields re-run the pure validators on edit.
5. **Vehicle** — Vehicle form (VEH-01): plate prefix/number + plate province, brand/model/year,
   color, vehicle type, chassis, engine, engine cc, seats, weight — prefilled from the verified
   mapping; chassis/engine/plate validated by the pure validators.
6. **Review & Save** — summary of Customer + Document + Vehicle; "Save intake" persists via the
   Phase-2 repositories (encrypted PII, blind-index, audit-in-transaction). Success → toast +
   intake detail/confirmation. (No pricing/payment yet — that's Phase 4+.)

## Components (shadcn/ui)

Button, Form/Field, Input, Textarea, Select + Combobox (searchable, for master tables), Checkbox,
RadioGroup (New/Renewal), Stepper/Steps, Card, Table (review), Dialog/Sheet (mobile nav),
Toast/Sonner (save feedback), Skeleton/Spinner (OCR extracting), Alert (errors), Badge (status).

## States (every async screen)

- **Loading:** OCR "extracting…" skeleton; save in-progress disables the action.
- **Empty:** no upload yet → dropzone with guidance.
- **Error:** OCR/mapper/storage failure → inline Alert + retry; never silently advance.
- **Validation:** inline field errors (zod + identifier validators); summary at top if multiple.
- **Verify-gate:** unverified required fields visibly flagged; Continue disabled with reason.

## Responsive rules

- Mobile (<640px): single-column stacked forms; wizard steps as a compact progress indicator;
  Map&Verify rows become stacked cards (raw value above, control below); sticky bottom primary
  action; nav in a Sheet.
- Tablet/desktop: two-column where sensible; Map&Verify as aligned raw|mapped rows.

## Accessibility

- All inputs labelled; errors associated via aria-describedby; full keyboard nav; visible focus;
  Radix primitives for menus/dialogs/combobox; color not the only signal (icons + text).

## i18n (DECIDED with user)

- **UI labels in Phase 3: English** (staff back-office). Master **data values** render in their
  Thai script as stored.
- **Set up the i18n seam now** (next-intl) — all user-facing strings live in message catalogs
  keyed (`en` locale), **never hardcoded in components** (per `i18n-check`). Thai (`th`) locale +
  any language toggle are added at the customer-facing phase with no component refactor.
- Locale routing/config wired minimally now (default `en`), so adding `th` later is additive.

## Out of scope (UI)

Login/auth screens, role-based nav (Phase 7); pricing/payment/certificate UI (Phase 4–6);
customer self-serve / partner / customer portals (Phases 7–9).
