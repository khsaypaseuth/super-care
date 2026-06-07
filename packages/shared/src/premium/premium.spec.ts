/**
 * premium.spec.ts — RED phase: failing tests for table-driven Premium lookup (FX-01)
 *
 * Tests are written first per TDD mandate (§A3 Engineering Standards).
 *
 * Shape locked; amounts are placeholder data [ASSUMED A2] — see premium.ts.
 * Tests assert:
 * - Every table row resolves to a Big THB amount (not a JS number)
 * - An unknown key throws a clear error
 * - Return type is Big, never number
 */
import { describe, it, expect } from "vitest";
import Big from "big.js";
import { lookupPremiumThb, type CoverageClass } from "./premium.js";

describe("Premium lookup — table-driven THB lookup (FX-01)", () => {
  describe("known rows resolve to Big THB amounts", () => {
    it("CMI sedan → a positive Big THB amount", () => {
      const premium = lookupPremiumThb("CMI", "sedan");
      expect(premium instanceof Big).toBe(true);
      expect(premium.gt(new Big("0"))).toBe(true);
    });

    it("CMI pickup → a positive Big THB amount", () => {
      const premium = lookupPremiumThb("CMI", "pickup");
      expect(premium instanceof Big).toBe(true);
      expect(premium.gt(new Big("0"))).toBe(true);
    });

    it("CMI motorcycle → a positive Big THB amount", () => {
      const premium = lookupPremiumThb("CMI", "motorcycle");
      expect(premium instanceof Big).toBe(true);
      expect(premium.gt(new Big("0"))).toBe(true);
    });

    it("VOLUNTARY sedan → a positive Big THB amount", () => {
      const premium = lookupPremiumThb("VOLUNTARY", "sedan");
      expect(premium instanceof Big).toBe(true);
      expect(premium.gt(new Big("0"))).toBe(true);
    });

    it("VOLUNTARY pickup → a positive Big THB amount", () => {
      const premium = lookupPremiumThb("VOLUNTARY", "pickup");
      expect(premium instanceof Big).toBe(true);
      expect(premium.gt(new Big("0"))).toBe(true);
    });
  });

  describe("specific placeholder amounts are exact Big values (not floats)", () => {
    it("CMI sedan placeholder amount is the exact decimal string value as Big", () => {
      const premium = lookupPremiumThb("CMI", "sedan");
      // The amount comes from a decimal string; it must NOT be a JS number literal
      // We verify it equals the research placeholder "645.21"
      expect(premium.eq(new Big("645.21"))).toBe(true);
    });

    it("CMI pickup placeholder amount matches research: 967.28 THB", () => {
      const premium = lookupPremiumThb("CMI", "pickup");
      expect(premium.eq(new Big("967.28"))).toBe(true);
    });

    it("CMI motorcycle placeholder amount matches research: 323.14 THB", () => {
      const premium = lookupPremiumThb("CMI", "motorcycle");
      expect(premium.eq(new Big("323.14"))).toBe(true);
    });
  });

  describe("return type is Big, not JS number", () => {
    it("returned value is a Big instance", () => {
      const result = lookupPremiumThb("CMI", "sedan");
      expect(typeof result).not.toBe("number");
      expect(result instanceof Big).toBe(true);
    });

    it("returned Big value is not a float (no precision drift)", () => {
      const result = lookupPremiumThb("CMI", "sedan");
      // The Big representation of "645.21" is exact; converting to number may drift
      const asNumber = Number(result.toString());
      // This just confirms Big's string is stable; Big itself never drifts
      expect(result.toString()).toBe("645.21");
      // A number representation is fine here — we're testing the Big is exact
      expect(asNumber).toBeCloseTo(645.21, 2);
    });
  });

  describe("unknown key throws a clear error", () => {
    it("throws on unknown coverage class", () => {
      expect(() =>
        // @ts-expect-error — testing unknown coverage at runtime
        lookupPremiumThb("UNKNOWN_COVERAGE" as CoverageClass, "sedan"),
      ).toThrow(/No premium/i);
    });

    it("throws on unknown vehicle type for known coverage", () => {
      expect(() => lookupPremiumThb("CMI", "spaceship")).toThrow(/No premium/i);
    });

    it("throws on unknown coverage AND vehicle type combination", () => {
      expect(() =>
        // @ts-expect-error — testing unknown coverage at runtime
        lookupPremiumThb("INVALID" as CoverageClass, "unknown"),
      ).toThrow(/No premium/i);
    });

    it("error message includes the coverage and vehicleType for debugging", () => {
      try {
        lookupPremiumThb("CMI", "spaceship");
        expect.fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).toMatch(/CMI/);
        expect((e as Error).message).toMatch(/spaceship/);
      }
    });
  });

  describe("CoverageClass type is a string union (shape locked)", () => {
    it("CMI and VOLUNTARY are valid CoverageClass values", () => {
      const cmi: CoverageClass = "CMI";
      const voluntary: CoverageClass = "VOLUNTARY";
      expect(cmi).toBe("CMI");
      expect(voluntary).toBe("VOLUNTARY");
    });
  });
});
