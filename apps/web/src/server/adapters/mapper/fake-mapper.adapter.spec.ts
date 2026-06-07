/**
 * FakeMapperAdapter unit tests.
 *
 * Contracts asserted:
 * 1. Exact seeded brand text ranks first (score 0) when given exact match (Toyota).
 * 2. Exact seeded province Thai text ranks first (กรุงเทพมหานคร).
 * 3. Returns at most 5 suggestions.
 * 4. Suggestions are ordered ascending by score (best first).
 * 5. STRUCTURAL: fake-mapper.adapter.ts source does NOT import the @super-care/shared
 *    validators barrel (CMI-04 / T-03-09).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { FakeMapperAdapter } from "./fake-mapper.adapter.js";
import type { MasterCandidate } from "./mapper.port.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Seeded brand candidates from prisma/seed.ts
const BRAND_CANDIDATES: MasterCandidate[] = [
  { id: "brand-1", label: "Toyota", labelTh: "โตโยต้า" },
  { id: "brand-2", label: "Honda", labelTh: "ฮอนด้า" },
  { id: "brand-3", label: "Nissan", labelTh: "นิสสัน" },
];

// Seeded province candidates
const PROVINCE_CANDIDATES: MasterCandidate[] = [
  { id: "prov-1", label: "Bangkok", labelTh: "กรุงเทพมหานคร" },
  { id: "prov-2", label: "Chiang Mai", labelTh: "เชียงใหม่" },
  { id: "prov-3", label: "Phuket", labelTh: "ภูเก็ต" },
];

describe("FakeMapperAdapter — ranking", () => {
  it("exact English match ranks first with score 0", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("Toyota", BRAND_CANDIDATES);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe("brand-1");
    expect(results[0]!.score).toBe(0);
  });

  it("exact Thai match ranks first — province กรุงเทพมหานคร", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("กรุงเทพมหานคร", PROVINCE_CANDIDATES);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe("prov-1");
    expect(results[0]!.score).toBe(0); // exact Thai match → distance 0
  });

  it("returns at most 5 suggestions", () => {
    const mapper = new FakeMapperAdapter();
    const manyCandidates: MasterCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      id: `id-${i}`,
      label: `Brand ${i}`,
    }));
    const results = mapper.map("Brand 0", manyCandidates);

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("suggestions are ordered ascending by score (best first)", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("Toyota", BRAND_CANDIDATES);

    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeGreaterThanOrEqual(results[i - 1]!.score);
    }
  });

  it("case-insensitive matching — 'toyota' matches 'Toyota'", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("toyota", BRAND_CANDIDATES);

    expect(results[0]!.id).toBe("brand-1");
    expect(results[0]!.score).toBe(0); // normalized: TOYOTA === TOYOTA
  });

  it("mixed case input with surrounding whitespace — Toyota still ranks first", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("  tOYoTa  ", BRAND_CANDIDATES);

    expect(results[0]!.id).toBe("brand-1");
    expect(results[0]!.score).toBe(0);
  });

  it("unrelated text produces higher scores than a close match", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("Toyota", BRAND_CANDIDATES);

    // Toyota should score lower than Honda or Nissan
    const toyotaScore = results.find((r) => r.id === "brand-1")?.score ?? Infinity;
    const hondaScore = results.find((r) => r.id === "brand-2")?.score ?? Infinity;
    expect(toyotaScore).toBeLessThan(hondaScore);
  });

  it("returns suggestions with id and label fields populated", () => {
    const mapper = new FakeMapperAdapter();
    const results = mapper.map("Toyota", BRAND_CANDIDATES);

    for (const suggestion of results) {
      expect(suggestion.id).toBeDefined();
      expect(suggestion.label).toBeDefined();
      expect(typeof suggestion.score).toBe("number");
    }
  });
});

describe("FakeMapperAdapter — structural contract (CMI-04 / T-03-09)", () => {
  it("fake-mapper.adapter.ts does NOT import the @super-care/shared validators barrel", () => {
    // Read the source file directly — assert no import from the validators barrel
    const adapterPath = join(__dirname, "fake-mapper.adapter.ts");
    const source = readFileSync(adapterPath, "utf-8");

    // Extract all import lines
    const importLines = source
      .split("\n")
      .filter((line) => line.trim().startsWith("import"));

    // None of the import lines should reference the validators barrel
    const validatorImports = importLines.filter(
      (line) =>
        line.includes("validators") ||
        line.includes("@super-care/shared"),
    );

    expect(validatorImports).toHaveLength(0);
  });

  it("map() returns suggestions without performing identifier validation", () => {
    const mapper = new FakeMapperAdapter();
    // A clearly invalid identifier string — mapper must NOT throw, must return suggestions
    const invalidId = "123-INVALID-CHECKSUM";
    const candidates: MasterCandidate[] = [
      { id: "c1", label: "123-INVALID-CHECKSUM" },
      { id: "c2", label: "Something Else" },
    ];

    // Should not throw — mapper doesn't validate, just matches text
    expect(() => mapper.map(invalidId, candidates)).not.toThrow();
    const results = mapper.map(invalidId, candidates);
    expect(results.length).toBeGreaterThan(0);
    // Exact match ranks first regardless of whether the value is a valid identifier
    expect(results[0]!.id).toBe("c1");
  });
});
