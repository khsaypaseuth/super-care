/**
 * CryptoService unit tests — TDD RED phase
 *
 * Tests inject keys directly via a stub KeyProvider.
 * No process.env, no DATABASE_URL, no I/O.
 *
 * Behavior tested:
 * 1. encrypt(x) produces v{n}:..:..:.. envelope; decrypt(envelope) === x (round-trip)
 * 2. Two encryptions of the same plaintext yield different ciphertext (random IV)
 * 3. Tampered auth-tag causes decrypt() to throw (GCM authentication failure)
 * 4. Envelope carries keyVersion; decrypt resolves the key by version via KeyProvider
 * 5. blindIndex(value) is deterministic (same value+key → same 64-hex output)
 * 6. Normalization equality: "12-3456 7890123" === "1234567890123" (Thai ID digits-only rule)
 * 7. Normalization equality: " Abc-Def " → "ABCDEF" (passport/chassis trim+strip+upper rule)
 * 8. blindIndex uses indexKey (different key → different output)
 */

import { describe, it, expect } from "vitest";
import { CryptoService } from "./crypto.service.js";
import type { KeyProvider } from "./key-provider.js";

// ─── Stub KeyProvider (deterministic test keys, no env dependency) ────────────

function makeKeyProvider(
  masterKey: Buffer,
  indexKeyBuf: Buffer,
  version: number = 1,
): KeyProvider {
  return {
    currentKeyVersion: () => version,
    encryptionKey: (v: number) => {
      if (v !== version) throw new Error(`Unknown key version ${v}`);
      return masterKey;
    },
    indexKey: () => indexKeyBuf,
  };
}

/** Stable 32-byte test master key (never used outside unit tests) */
const MASTER_KEY = Buffer.alloc(32, 0xaa);
/** Stable 32-byte test index key (separate from master key) */
const INDEX_KEY = Buffer.alloc(32, 0xbb);
/** An alternate index key to verify indexKey separation */
const INDEX_KEY_ALT = Buffer.alloc(32, 0xcc);

const provider = makeKeyProvider(MASTER_KEY, INDEX_KEY);
const crypto = new CryptoService(provider);

// ─── 1. Round-trip ────────────────────────────────────────────────────────────

describe("CryptoService.encrypt / decrypt", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plaintext = "hello super-care 🔐";
    const envelope = crypto.encrypt(plaintext);
    expect(crypto.decrypt(envelope)).toBe(plaintext);
  });

  it("envelope has the shape v{n}:<ivB64>:<tagB64>:<ctB64>", () => {
    const envelope = crypto.encrypt("test");
    const parts = envelope.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toMatch(/^v\d+$/);
    // IV must be 12 bytes → 16 base64 chars
    expect(Buffer.from(parts[1]!, "base64")).toHaveLength(12);
    // Auth tag must be 16 bytes → 24 base64 chars
    expect(Buffer.from(parts[2]!, "base64")).toHaveLength(16);
  });

  // ─── 2. Random IV ─────────────────────────────────────────────────────────

  it("two encryptions of the same plaintext yield different ciphertext", () => {
    const a = crypto.encrypt("same-value");
    const b = crypto.encrypt("same-value");
    expect(a).not.toBe(b);
    // Specifically the IV segment must differ
    expect(a.split(":")[1]).not.toBe(b.split(":")[1]);
  });

  // ─── 3. Tamper detection ──────────────────────────────────────────────────

  it("tampered auth-tag makes decrypt() throw", () => {
    const envelope = crypto.encrypt("sensitive-data");
    const parts = envelope.split(":");
    // Flip the last byte of the auth-tag
    const tag = Buffer.from(parts[2]!, "base64");
    tag[tag.length - 1] = tag[tag.length - 1]! ^ 0xff;
    const tampered = [parts[0], parts[1], tag.toString("base64"), parts[3]].join(":");
    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  // ─── 4. keyVersion resolution ─────────────────────────────────────────────

  it("envelope keyVersion matches currentKeyVersion", () => {
    const v2provider = makeKeyProvider(Buffer.alloc(32, 0xdd), INDEX_KEY, 2);
    const cryptoV2 = new CryptoService(v2provider);
    const envelope = cryptoV2.encrypt("versioned");
    expect(envelope.startsWith("v2:")).toBe(true);
  });

  it("decrypt picks the right key by version from the provider", () => {
    // Create envelope with keyVersion=2 master key
    const v2master = Buffer.alloc(32, 0xdd);
    const v2provider = makeKeyProvider(v2master, INDEX_KEY, 2);
    const cryptoV2 = new CryptoService(v2provider);
    const envelope = cryptoV2.encrypt("v2-secret");

    // A provider that knows BOTH v1 and v2 can decrypt a v2 envelope
    const multiProvider: KeyProvider = {
      currentKeyVersion: () => 2,
      encryptionKey: (v: number) => {
        if (v === 1) return MASTER_KEY;
        if (v === 2) return v2master;
        throw new Error(`Unknown key version ${v}`);
      },
      indexKey: () => INDEX_KEY,
    };
    const cryptoMulti = new CryptoService(multiProvider);
    expect(cryptoMulti.decrypt(envelope)).toBe("v2-secret");
  });
});

// ─── 5-8. blindIndex ─────────────────────────────────────────────────────────

describe("CryptoService.blindIndex", () => {
  it("is deterministic: same value + same key → same 64-hex output", () => {
    const a = crypto.blindIndex("ABC123");
    const b = crypto.blindIndex("ABC123");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── 6. Thai national ID normalization ────────────────────────────────────
  // Rule: keep digits only → "12-3456 7890123" normalizes to "1234567890123"

  it("normalizes Thai national ID: strips dashes/spaces, digits only", () => {
    expect(crypto.blindIndex("12-3456 7890123")).toBe(
      crypto.blindIndex("1234567890123"),
    );
  });

  // ─── 7. Passport / chassis normalization ──────────────────────────────────
  // Rule: trim + strip internal whitespace/dashes + toUpperCase

  it("normalizes passport: trim + strip spaces/dashes + uppercase", () => {
    expect(crypto.blindIndex(" Abc-Def ")).toBe(crypto.blindIndex("ABCDEF"));
  });

  it("normalizes chassis: different spacing/case yields same index", () => {
    expect(crypto.blindIndex("ABC 123-XYZ")).toBe(
      crypto.blindIndex("abc123xyz"),
    );
  });

  // ─── 8. Uses indexKey (NOT encryptionKey) ─────────────────────────────────

  it("index depends on indexKey, not encryptionKey", () => {
    const sameEncKey = makeKeyProvider(MASTER_KEY, INDEX_KEY_ALT);
    const cryptoAlt = new CryptoService(sameEncKey);

    const indexWithOriginal = crypto.blindIndex("test-id");
    const indexWithAlt = cryptoAlt.blindIndex("test-id");

    // Same encryption key, different index key → different blind index
    expect(indexWithOriginal).not.toBe(indexWithAlt);
  });

  it("same blindIndex survives different encryption keys (index key is separate)", () => {
    const differentEncProvider = makeKeyProvider(Buffer.alloc(32, 0xee), INDEX_KEY);
    const cryptoDiff = new CryptoService(differentEncProvider);

    // Same indexKey → same blind index regardless of encryptionKey
    expect(crypto.blindIndex("same-value")).toBe(
      cryptoDiff.blindIndex("same-value"),
    );
  });
});
