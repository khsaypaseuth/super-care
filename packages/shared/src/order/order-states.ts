/**
 * ORDER_STATES — canonical readonly tuple of all 12 Order lifecycle states.
 *
 * Derived VERBATIM from the TRANSITIONS keys in order.machine.ts.
 * This is the single vocabulary shared by:
 *   - The XState order machine (TRANSITIONS keys)
 *   - The Prisma schema enum OrderState (apps/web/prisma/schema.prisma)
 *   - Any Zod schema, API DTO, or display component that needs the full state set
 *
 * Drift is enforced by order-states.spec.ts which asserts:
 *   SET(ORDER_STATES) == SET(TRANSITIONS keys) == SET(schema OrderState members)
 *
 * Never add a state here without also updating order.machine.ts and schema.prisma.
 */

export const ORDER_STATES = [
  "DRAFT",
  "OCR_FAILED",
  "QUOTED",
  "AWAITING_PAYMENT",
  "PAYMENT_FAILED",
  "PAID",
  "ISSUING_CERTIFICATE",
  "CERT_FAILED",
  "REFUNDING",
  "COMPLETED",
  "REFUNDED",
  "CANCELLED",
] as const;

/** Union type derived from the canonical tuple — `"DRAFT" | "OCR_FAILED" | ...` */
export type OrderStateValue = (typeof ORDER_STATES)[number];
