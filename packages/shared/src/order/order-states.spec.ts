/**
 * OrderState drift guard — TDD RED phase
 *
 * Tests:
 * 1. ORDER_STATES contains exactly the 12 TRANSITIONS keys from order.machine.ts
 * 2. The Prisma schema enum OrderState members equal ORDER_STATES
 *    (parsed from schema.prisma text — no generated client import into packages/shared)
 *
 * Both tests enforce single-vocabulary: machine ↔ shared tuple ↔ Prisma schema.
 * If any side adds/removes a state, this test fails.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ORDER_STATES } from "./order-states.js";

// ─── Expected states (from order.machine.ts TRANSITIONS keys) ────────────────

const EXPECTED_STATES: ReadonlySet<string> = new Set<string>([
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
]);

describe("ORDER_STATES tuple", () => {
  it("contains exactly the 12 TRANSITIONS keys from order.machine.ts (no extras, no missing)", () => {
    expect(ORDER_STATES).toHaveLength(12);
    const tupleSet = new Set<string>(ORDER_STATES);

    // Every expected state is in the tuple
    for (const state of EXPECTED_STATES) {
      expect(tupleSet.has(state), `ORDER_STATES missing state: ${state}`).toBe(true);
    }

    // No extra states in the tuple beyond the expected set
    for (const state of tupleSet) {
      expect(EXPECTED_STATES.has(state), `ORDER_STATES has unexpected state: ${state}`).toBe(true);
    }
  });
});

// ─── Prisma schema drift guard ────────────────────────────────────────────────

describe("Prisma schema OrderState enum drift guard", () => {
  it("schema.prisma OrderState enum members equal ORDER_STATES (no drift)", () => {
    // Parse the schema file — avoids importing the generated client into packages/shared
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const schemaPath = resolve(__dirname, "../../../../apps/web/prisma/schema.prisma");

    let schemaText: string;
    try {
      schemaText = readFileSync(schemaPath, "utf8");
    } catch {
      throw new Error(
        `Cannot read schema.prisma at ${schemaPath}. ` +
          "Did you forget to run prisma generate or is apps/web/prisma/schema.prisma missing?",
      );
    }

    // Extract the OrderState enum block
    const enumMatch = schemaText.match(/enum\s+OrderState\s*\{([^}]+)\}/);
    if (!enumMatch) {
      throw new Error("Could not find `enum OrderState { ... }` in schema.prisma");
    }

    // Parse the enum members (skip comments and empty lines)
    const enumMembers = enumMatch[1]!
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim()) // strip comments
      .filter((line) => line.length > 0);

    const schemaSet = new Set(enumMembers);
    const tupleSet = new Set<string>(ORDER_STATES);

    // Schema must have every tuple member
    for (const state of tupleSet) {
      expect(schemaSet.has(state), `schema.prisma OrderState missing: ${state}`).toBe(true);
    }

    // Tuple must have every schema member
    for (const state of schemaSet) {
      expect(tupleSet.has(state as string), `ORDER_STATES missing state from schema: ${state}`).toBe(true);
    }

    expect(schemaSet.size).toBe(tupleSet.size);
  });
});
