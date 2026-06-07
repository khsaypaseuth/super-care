/**
 * Domain type unions — authoritative vocabulary from docs/GLOSSARY.md.
 * These are the canonical type names used across DB, service, API, UI, and chatbot.
 */

/** The collection currency for an insurance transaction. */
export type Currency = "THB" | "LAK";

/** The market a transaction belongs to. */
export type Market = "TH" | "LA";
