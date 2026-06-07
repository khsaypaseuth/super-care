/**
 * Order state machine — ORD-02
 *
 * Pure transition table implementing the Order lifecycle.
 * Exports `next(stateValue, eventType): string` which THROWS `IllegalTransition`
 * for any illegal transition (event not defined for the current state).
 *
 * Design choice (per research Assumption A6 / Open Question 3):
 *   A plain readonly TRANSITIONS table is used as the throw-on-illegal mechanism.
 *   xstate `createMachine` is also exported for visualization/tooling purposes,
 *   but `next()` is backed by the plain table — this is the lowest-risk approach
 *   for the ORD-02 "throws on illegal" requirement (avoids XState no-op detection complexity).
 *
 * States:
 *   DRAFT, OCR_FAILED, QUOTED, AWAITING_PAYMENT, PAYMENT_FAILED,
 *   PAID, ISSUING_CERTIFICATE, CERT_FAILED, REFUNDING,
 *   COMPLETED (final), REFUNDED (final), CANCELLED (final)
 *
 * Refund reachable ONLY after PAID (from PAID or CERT_FAILED → REFUNDING → REFUNDED).
 */

import { createMachine } from "xstate";

// ─── Error class ──────────────────────────────────────────────────────────────

/**
 * Thrown by `next()` when an event is not defined for the current state.
 * T-04-01: Illegal Order transitions must not slip through silently.
 */
export class IllegalTransition extends Error {
  constructor(event: string, state: string) {
    super(`IllegalTransition: ${event} from ${state}`);
    this.name = "IllegalTransition";
  }
}

// ─── Transition table ─────────────────────────────────────────────────────────

/**
 * Canonical Order transition table.
 * Keys: OrderState values. Values: Record<EventType, next-state>.
 * Terminal states (COMPLETED, REFUNDED, CANCELLED) have no events → any event throws.
 *
 * Self-transitions are explicitly included:
 *   - DRAFT + OCR_SUCCEEDED → DRAFT (re-run OCR after success)
 *   - QUOTED + REQUOTE → QUOTED (refresh quote)
 */
const TRANSITIONS: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    DRAFT: {
      OCR_SUCCEEDED: "DRAFT",
      OCR_FAILED: "OCR_FAILED",
      QUOTE_LOCKED: "QUOTED",
      CANCEL: "CANCELLED",
    },
    OCR_FAILED: {
      RETRY_OCR: "DRAFT",
    },
    QUOTED: {
      REQUOTE: "QUOTED",
      INVOICE_ISSUED: "AWAITING_PAYMENT",
      CANCEL: "CANCELLED",
    },
    AWAITING_PAYMENT: {
      PAYMENT_CAPTURED: "PAID",
      PAYMENT_FAILED: "PAYMENT_FAILED",
      CANCEL: "CANCELLED",
    },
    PAYMENT_FAILED: {
      RETRY_PAYMENT: "AWAITING_PAYMENT",
      CANCEL: "CANCELLED",
    },
    PAID: {
      CERT_ISSUANCE_STARTED: "ISSUING_CERTIFICATE",
      INITIATE_REFUND: "REFUNDING",
    },
    ISSUING_CERTIFICATE: {
      CERT_ISSUED: "COMPLETED",
      CERT_FAILED: "CERT_FAILED",
    },
    CERT_FAILED: {
      RETRY_ISSUANCE: "ISSUING_CERTIFICATE",
      INITIATE_REFUND: "REFUNDING",
    },
    REFUNDING: {
      REFUND_COMPLETED: "REFUNDED",
    },
    // Terminal states — no events defined; any event throws
    COMPLETED: {},
    REFUNDED: {},
    CANCELLED: {},
  } as const;

// ─── Pure next() function ─────────────────────────────────────────────────────

/**
 * Pure Order state transition function.
 *
 * @param stateValue - Current Order state (must be a valid key in TRANSITIONS)
 * @param eventType - Event to apply
 * @returns The next state value
 * @throws {IllegalTransition} if the event is not defined for the current state
 */
export function next(stateValue: string, eventType: string): string {
  const stateTransitions = TRANSITIONS[stateValue];
  if (stateTransitions === undefined) {
    // Unknown state — this is a programming error; still throw
    throw new IllegalTransition(eventType, stateValue);
  }
  const target = stateTransitions[eventType];
  if (target === undefined) {
    throw new IllegalTransition(eventType, stateValue);
  }
  return target;
}

// ─── XState machine (for visualization/tooling — headless, no actor) ─────────

/**
 * XState representation of the Order machine.
 * NOT used by `next()` — backed by the plain TRANSITIONS table above.
 * Exported for visualization tools (Stately inspector, xstate/graph, etc.).
 */
export const orderMachine = createMachine({
  id: "order",
  initial: "DRAFT",
  states: {
    DRAFT: {
      on: {
        OCR_SUCCEEDED: "DRAFT",
        OCR_FAILED: "OCR_FAILED",
        QUOTE_LOCKED: "QUOTED",
        CANCEL: "CANCELLED",
      },
    },
    OCR_FAILED: {
      on: { RETRY_OCR: "DRAFT" },
    },
    QUOTED: {
      on: {
        REQUOTE: "QUOTED",
        INVOICE_ISSUED: "AWAITING_PAYMENT",
        CANCEL: "CANCELLED",
      },
    },
    AWAITING_PAYMENT: {
      on: {
        PAYMENT_CAPTURED: "PAID",
        PAYMENT_FAILED: "PAYMENT_FAILED",
        CANCEL: "CANCELLED",
      },
    },
    PAYMENT_FAILED: {
      on: { RETRY_PAYMENT: "AWAITING_PAYMENT", CANCEL: "CANCELLED" },
    },
    PAID: {
      on: {
        CERT_ISSUANCE_STARTED: "ISSUING_CERTIFICATE",
        INITIATE_REFUND: "REFUNDING",
      },
    },
    ISSUING_CERTIFICATE: {
      on: { CERT_ISSUED: "COMPLETED", CERT_FAILED: "CERT_FAILED" },
    },
    CERT_FAILED: {
      on: {
        RETRY_ISSUANCE: "ISSUING_CERTIFICATE",
        INITIATE_REFUND: "REFUNDING",
      },
    },
    REFUNDING: {
      on: { REFUND_COMPLETED: "REFUNDED" },
    },
    COMPLETED: { type: "final" },
    REFUNDED: { type: "final" },
    CANCELLED: { type: "final" },
  },
});
