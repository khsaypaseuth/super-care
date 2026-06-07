/**
 * CryptoService — AES-256-GCM field encryption + HMAC-SHA256 blind index.
 *
 * All PII fields at rest must be encrypted via this service.
 * Keys are resolved through the injected KeyProvider (env now, KMS later).
 *
 * Envelope format (stored as a single TEXT column):
 *   v{keyVersion}:{ivBase64}:{authTagBase64}:{ciphertextBase64}
 *
 * Security properties (T-02-02, T-02-03, T-02-04):
 *   - IV = 12 random bytes per encryption → identical plaintext ≠ identical ciphertext
 *   - auth tag = 16 bytes → tamper-evident; decrypt() throws on any bit flip
 *   - keyVersion prefix → key rotation without bulk re-encryption
 *   - blindIndex uses a SEPARATE indexKey, not the master encryption key
 *
 * Server-only (T-02-05): never import this module into a client component.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { KeyProvider } from "./key-provider";
import { normalizeIdentifier, type IdentifierKind } from "./normalize-identifier";

export class CryptoService {
  constructor(private readonly keys: KeyProvider) {}

  /**
   * Encrypt a plaintext string to a self-describing envelope.
   * A fresh 12-byte random IV is generated for every call (T-02-03).
   *
   * @returns envelope string: `v{n}:{ivB64}:{tagB64}:{ctB64}`
   */
  encrypt(plaintext: string): string {
    const version = this.keys.currentKeyVersion();
    const key = this.keys.encryptionKey(version); // 32 bytes
    const iv = randomBytes(12); // GCM standard: 96-bit IV

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag(); // 16 bytes

    return [
      `v${version}`,
      iv.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  /**
   * Decrypt an envelope produced by encrypt().
   * Throws if the auth tag does not match — catches any tampering (T-02-02).
   *
   * @throws {Error} on auth-tag failure (GCM authentication), unknown key version, or malformed envelope
   */
  decrypt(envelope: string): string {
    const parts = envelope.split(":");
    if (parts.length !== 4) {
      throw new Error(`CryptoService: malformed envelope (expected 4 parts, got ${parts.length})`);
    }
    const [vTag, ivB64, tagB64, ctB64] = parts as [string, string, string, string];

    const version = Number(vTag.slice(1));
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`CryptoService: invalid key version tag "${vTag}"`);
    }

    const key = this.keys.encryptionKey(version);
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag); // auth failure during final() → throws (T-02-02)

    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return decrypted.toString("utf8");
  }

  /**
   * Compute the blind index for an identifier.
   * = HMAC-SHA256(normalizeIdentifier(value, kind), indexKey) → 64 hex chars.
   *
   * Must be called with the SAME `kind` at write and query time to guarantee
   * consistent normalization (Pitfall 2 in 02-RESEARCH.md).
   *
   * @param value - raw identifier value (e.g. national ID, passport number, chassis)
   * @param kind  - normalization rule ("id" = digits-only; "text" = strip+upper)
   * @returns 64-character lowercase hex string (deterministic for same value+key+kind)
   */
  blindIndex(value: string, kind: IdentifierKind = "text"): string {
    return createHmac("sha256", this.keys.indexKey())
      .update(normalizeIdentifier(value, kind))
      .digest("hex"); // 64 hex chars [VERIFIED in-session]
  }
}
