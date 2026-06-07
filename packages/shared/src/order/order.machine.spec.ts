/**
 * Order state machine spec — ORD-02
 *
 * Tests:
 *  - Happy path: DRAFT → QUOTED → AWAITING_PAYMENT → PAID → ISSUING_CERTIFICATE → COMPLETED
 *  - Failure states: OCR_FAILED, PAYMENT_FAILED, CERT_FAILED are reachable
 *  - Refund path from PAID: PAID → REFUNDING → REFUNDED
 *  - Refund path from CERT_FAILED: CERT_FAILED → REFUNDING → REFUNDED
 *  - Refund BEFORE PAID (DRAFT/QUOTED/AWAITING_PAYMENT) THROWS
 *  - Illegal transitions THROW with IllegalTransition error
 *  - Events from terminal states (COMPLETED/REFUNDED/CANCELLED) THROW
 */

import { describe, it, expect } from "vitest";
import { next, IllegalTransition } from "./order.machine.js";

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("Order state machine — happy path", () => {
  it("DRAFT + QUOTE_LOCKED → QUOTED", () => {
    expect(next("DRAFT", "QUOTE_LOCKED")).toBe("QUOTED");
  });

  it("QUOTED + INVOICE_ISSUED → AWAITING_PAYMENT", () => {
    expect(next("QUOTED", "INVOICE_ISSUED")).toBe("AWAITING_PAYMENT");
  });

  it("AWAITING_PAYMENT + PAYMENT_CAPTURED → PAID", () => {
    expect(next("AWAITING_PAYMENT", "PAYMENT_CAPTURED")).toBe("PAID");
  });

  it("PAID + CERT_ISSUANCE_STARTED → ISSUING_CERTIFICATE", () => {
    expect(next("PAID", "CERT_ISSUANCE_STARTED")).toBe("ISSUING_CERTIFICATE");
  });

  it("ISSUING_CERTIFICATE + CERT_ISSUED → COMPLETED", () => {
    expect(next("ISSUING_CERTIFICATE", "CERT_ISSUED")).toBe("COMPLETED");
  });

  it("full happy path chain", () => {
    const states = [
      next("DRAFT", "QUOTE_LOCKED"),
      next("QUOTED", "INVOICE_ISSUED"),
      next("AWAITING_PAYMENT", "PAYMENT_CAPTURED"),
      next("PAID", "CERT_ISSUANCE_STARTED"),
      next("ISSUING_CERTIFICATE", "CERT_ISSUED"),
    ];
    expect(states).toEqual([
      "QUOTED",
      "AWAITING_PAYMENT",
      "PAID",
      "ISSUING_CERTIFICATE",
      "COMPLETED",
    ]);
  });
});

// ─── OCR failure state ────────────────────────────────────────────────────────

describe("Order state machine — OCR failure state", () => {
  it("DRAFT + OCR_FAILED → OCR_FAILED", () => {
    expect(next("DRAFT", "OCR_FAILED")).toBe("OCR_FAILED");
  });

  it("OCR_FAILED + RETRY_OCR → DRAFT (retry is possible)", () => {
    expect(next("OCR_FAILED", "RETRY_OCR")).toBe("DRAFT");
  });
});

// ─── Payment failure state ────────────────────────────────────────────────────

describe("Order state machine — payment failure state", () => {
  it("AWAITING_PAYMENT + PAYMENT_FAILED → PAYMENT_FAILED", () => {
    expect(next("AWAITING_PAYMENT", "PAYMENT_FAILED")).toBe("PAYMENT_FAILED");
  });

  it("PAYMENT_FAILED + RETRY_PAYMENT → AWAITING_PAYMENT (retry is possible)", () => {
    expect(next("PAYMENT_FAILED", "RETRY_PAYMENT")).toBe("AWAITING_PAYMENT");
  });

  it("PAYMENT_FAILED + CANCEL → CANCELLED", () => {
    expect(next("PAYMENT_FAILED", "CANCEL")).toBe("CANCELLED");
  });
});

// ─── Certificate failure state ────────────────────────────────────────────────

describe("Order state machine — certificate failure state", () => {
  it("ISSUING_CERTIFICATE + CERT_FAILED → CERT_FAILED", () => {
    expect(next("ISSUING_CERTIFICATE", "CERT_FAILED")).toBe("CERT_FAILED");
  });

  it("CERT_FAILED + RETRY_ISSUANCE → ISSUING_CERTIFICATE (retry is possible)", () => {
    expect(next("CERT_FAILED", "RETRY_ISSUANCE")).toBe("ISSUING_CERTIFICATE");
  });
});

// ─── Refund path from PAID ────────────────────────────────────────────────────

describe("Order state machine — refund path from PAID", () => {
  it("PAID + INITIATE_REFUND → REFUNDING", () => {
    expect(next("PAID", "INITIATE_REFUND")).toBe("REFUNDING");
  });

  it("REFUNDING + REFUND_COMPLETED → REFUNDED", () => {
    expect(next("REFUNDING", "REFUND_COMPLETED")).toBe("REFUNDED");
  });

  it("full refund path from PAID reaches REFUNDED", () => {
    const s1 = next("PAID", "INITIATE_REFUND");
    const s2 = next(s1, "REFUND_COMPLETED");
    expect(s2).toBe("REFUNDED");
  });
});

// ─── Refund path from CERT_FAILED ─────────────────────────────────────────────

describe("Order state machine — refund path from CERT_FAILED", () => {
  it("CERT_FAILED + INITIATE_REFUND → REFUNDING", () => {
    expect(next("CERT_FAILED", "INITIATE_REFUND")).toBe("REFUNDING");
  });

  it("full refund path from CERT_FAILED reaches REFUNDED", () => {
    const s1 = next("CERT_FAILED", "INITIATE_REFUND");
    const s2 = next(s1, "REFUND_COMPLETED");
    expect(s2).toBe("REFUNDED");
  });
});

// ─── Refund NOT reachable before PAID ─────────────────────────────────────────

describe("Order state machine — refund throws before PAID (ORD-02)", () => {
  it("DRAFT + INITIATE_REFUND → throws IllegalTransition", () => {
    expect(() => next("DRAFT", "INITIATE_REFUND")).toThrow(IllegalTransition);
  });

  it("QUOTED + INITIATE_REFUND → throws IllegalTransition", () => {
    expect(() => next("QUOTED", "INITIATE_REFUND")).toThrow(IllegalTransition);
  });

  it("AWAITING_PAYMENT + INITIATE_REFUND → throws IllegalTransition", () => {
    expect(() => next("AWAITING_PAYMENT", "INITIATE_REFUND")).toThrow(
      IllegalTransition
    );
  });

  it("OCR_FAILED + INITIATE_REFUND → throws IllegalTransition", () => {
    expect(() => next("OCR_FAILED", "INITIATE_REFUND")).toThrow(
      IllegalTransition
    );
  });

  it("PAYMENT_FAILED + INITIATE_REFUND → throws IllegalTransition", () => {
    expect(() => next("PAYMENT_FAILED", "INITIATE_REFUND")).toThrow(
      IllegalTransition
    );
  });
});

// ─── Illegal transitions throw ────────────────────────────────────────────────

describe("Order state machine — illegal transitions throw (ORD-02)", () => {
  it("PAYMENT_CAPTURED from DRAFT throws IllegalTransition", () => {
    expect(() => next("DRAFT", "PAYMENT_CAPTURED")).toThrow(IllegalTransition);
  });

  it("CERT_ISSUANCE_STARTED from DRAFT throws IllegalTransition", () => {
    expect(() => next("DRAFT", "CERT_ISSUANCE_STARTED")).toThrow(
      IllegalTransition
    );
  });

  it("CERT_ISSUED from AWAITING_PAYMENT throws IllegalTransition", () => {
    expect(() => next("AWAITING_PAYMENT", "CERT_ISSUED")).toThrow(
      IllegalTransition
    );
  });

  it("REFUND_COMPLETED from PAID throws IllegalTransition (must go via REFUNDING)", () => {
    expect(() => next("PAID", "REFUND_COMPLETED")).toThrow(IllegalTransition);
  });

  it("throws IllegalTransition is instance check works", () => {
    try {
      next("DRAFT", "PAYMENT_CAPTURED");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransition);
      expect((err as IllegalTransition).message).toMatch(/IllegalTransition/);
    }
  });
});

// ─── Terminal states throw on any event ──────────────────────────────────────

describe("Order state machine — terminal states are sinks (any event throws)", () => {
  it("COMPLETED + CANCEL → throws IllegalTransition", () => {
    expect(() => next("COMPLETED", "CANCEL")).toThrow(IllegalTransition);
  });

  it("COMPLETED + CERT_ISSUED → throws IllegalTransition", () => {
    expect(() => next("COMPLETED", "CERT_ISSUED")).toThrow(IllegalTransition);
  });

  it("REFUNDED + REFUND_COMPLETED → throws IllegalTransition", () => {
    expect(() => next("REFUNDED", "REFUND_COMPLETED")).toThrow(
      IllegalTransition
    );
  });

  it("REFUNDED + INITIATE_REFUND → throws IllegalTransition", () => {
    expect(() => next("REFUNDED", "INITIATE_REFUND")).toThrow(
      IllegalTransition
    );
  });

  it("CANCELLED + CANCEL → throws IllegalTransition", () => {
    expect(() => next("CANCELLED", "CANCEL")).toThrow(IllegalTransition);
  });

  it("CANCELLED + QUOTE_LOCKED → throws IllegalTransition", () => {
    expect(() => next("CANCELLED", "QUOTE_LOCKED")).toThrow(IllegalTransition);
  });
});

// ─── Cancel transitions ────────────────────────────────────────────────────────

describe("Order state machine — cancel transitions", () => {
  it("DRAFT + CANCEL → CANCELLED", () => {
    expect(next("DRAFT", "CANCEL")).toBe("CANCELLED");
  });

  it("QUOTED + CANCEL → CANCELLED", () => {
    expect(next("QUOTED", "CANCEL")).toBe("CANCELLED");
  });

  it("AWAITING_PAYMENT + CANCEL → CANCELLED", () => {
    expect(next("AWAITING_PAYMENT", "CANCEL")).toBe("CANCELLED");
  });
});

// ─── OCR_SUCCEEDED self-transition on DRAFT ───────────────────────────────────

describe("Order state machine — OCR_SUCCEEDED self-transition", () => {
  it("DRAFT + OCR_SUCCEEDED → DRAFT (can re-run OCR)", () => {
    expect(next("DRAFT", "OCR_SUCCEEDED")).toBe("DRAFT");
  });
});

// ─── REQUOTE self-transition on QUOTED ───────────────────────────────────────

describe("Order state machine — REQUOTE self-transition", () => {
  it("QUOTED + REQUOTE → QUOTED (can refresh quote)", () => {
    expect(next("QUOTED", "REQUOTE")).toBe("QUOTED");
  });
});
