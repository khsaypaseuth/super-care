/**
 * money.spec.ts — RED phase: failing tests for Money value object (PLAT-03)
 *
 * Tests are written first per TDD mandate (§A3 Engineering Standards).
 * All assertions must fail before implementation is written.
 */
import { describe, it, expect } from "vitest";
import Big from "big.js";
import { Money, makeMoney, addMoney } from "./money.js";

describe("Money value object (PLAT-03)", () => {
  describe("construction from decimal string", () => {
    it("creates a THB Money from a decimal string", () => {
      const m = makeMoney("1000.50", "THB");
      expect(m.currency).toBe("THB");
      expect(m.amount.toFixed(2)).toBe("1000.50");
    });

    it("creates a LAK Money from a whole-number string", () => {
      const m = makeMoney("265000", "LAK");
      expect(m.currency).toBe("LAK");
      expect(m.amount.toFixed(0)).toBe("265000");
    });

    it("creates a Money from a Big instance", () => {
      const big = new Big("999.99");
      const m = makeMoney(big, "THB");
      expect(m.amount.eq(big)).toBe(true);
    });
  });

  describe("no-float-drift: Big is exact where JS number is lossy", () => {
    it("0.1 + 0.2 equals exactly 0.3 as Big (would fail as JS number)", () => {
      // This is THE canonical float-drift case: 0.1 + 0.2 !== 0.3 in JS
      const jsNumberResult = 0.1 + 0.2; // drifts to 0.30000000000000004
      expect(jsNumberResult).not.toBe(0.3); // proves the JS number problem exists

      // With Big: exact
      const a = makeMoney("0.1", "THB");
      const b = makeMoney("0.2", "THB");
      const sum = addMoney(a, b);
      expect(sum.amount.toFixed(1)).toBe("0.3");
      expect(sum.amount.eq(new Big("0.3"))).toBe(true);
    });

    it("a large fractional THB amount is exact as Big", () => {
      // A premium amount that would lose satang precision as a JS number
      // 1499.99 + 0.01 = 1500.00 (exact as Big, may drift as number)
      const a = makeMoney("1499.99", "THB");
      const b = makeMoney("0.01", "THB");
      const sum = addMoney(a, b);
      expect(sum.amount.eq(new Big("1500.00"))).toBe(true);
    });
  });

  describe("scale awareness per currency", () => {
    it("THB allows 2 dp (satang-level amounts)", () => {
      const m = makeMoney("645.21", "THB");
      expect(m.amount.toFixed(2)).toBe("645.21");
    });

    it("LAK is whole kip (0 dp) — fractional LAK amount is rejected", () => {
      // LAK has no sub-unit; fractional amounts must throw
      expect(() => makeMoney("265000.5", "LAK")).toThrow();
    });

    it("LAK with whole-kip amount is accepted", () => {
      const m = makeMoney("265001", "LAK");
      expect(m.amount.eq(new Big("265001"))).toBe(true);
    });
  });

  describe("type safety — JS number amount is rejected", () => {
    it("passing a JS number as amount is a type error (runtime rejection)", () => {
      // The overload must not accept JS numbers
      // We test the runtime guard path: passing number should throw or not compile
      // @ts-expect-error — testing runtime guard
      expect(() => makeMoney(1000, "THB")).toThrow();
    });
  });

  describe("Money equality", () => {
    it("two Money objects with the same amount and currency are equal", () => {
      const a = makeMoney("1000", "THB");
      const b = makeMoney("1000", "THB");
      expect(a.amount.eq(b.amount) && a.currency === b.currency).toBe(true);
    });
  });
});
