/**
 * apps/web — Next.js application shell (Phase 1 placeholder).
 *
 * This file is a no-op placeholder. The real Next.js app structure
 * (pages, route handlers, server actions) will be wired in a later phase.
 *
 * No Next.js runtime import here — this is a typecheck-clean shell only.
 * There is no apps/api — the API will be Next.js route handlers / server actions.
 */

// Re-export domain types from @super-care/shared so this project
// participates in the typecheck graph and project references resolve.
export type { Currency, Market } from "@super-care/shared";
