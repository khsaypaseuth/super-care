# super-care

Lao ↔ Thailand cross-border vehicle insurance platform.

A customer purchases cross-border insurance end-to-end: identity/vehicle capture (OCR),
FX-priced premium, payment, and an issued **Certificate** — with partner commission and
renewals.

## Status

🚧 Early development. Built in **vertical slices** — Phase 1 is one real, paid,
certificate-issued transaction, top to bottom, before widening.

## Engineering standards

Read these before contributing:

- [`docs/ENGINEERING-STANDARDS.md`](docs/ENGINEERING-STANDARDS.md) — how we design the code
  (ubiquitous language, vertical slices, TDD, deep modules, strict TS + Zod boundaries).
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — the authoritative domain vocabulary. Use these
  exact terms everywhere.

## High-risk logic (TDD-mandatory, never touches the LLM)

- Critical-field validators (Thai National ID checksum, passport/plate/chassis/engine)
- FX quote engine (source rate + 15 kips, round-up, direction rule)
- Commission calculation (tier ladder)
- Order state machine (only legal transitions)
- Payment webhook handlers (idempotent)

## Tooling

- Node 22 · pnpm · TypeScript (strict) · Prisma · Zod
- Tests + typecheck + lint must be green before merge.

## Development workflow

Git commit at **every phase** of development. Branch off `main`, open a PR, merge on green CI.
