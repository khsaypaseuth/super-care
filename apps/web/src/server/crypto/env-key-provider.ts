/**
 * EnvKeyProvider — reads cryptographic keys exclusively from process.env.
 *
 * Expected env vars:
 *   MASTER_KEY_CURRENT  = "1"              (default; the active key version)
 *   MASTER_KEY_V1       = <base64 32 bytes> (master encryption key v1)
 *   MASTER_KEY_V2       = <base64 32 bytes> (optional; add during rotation)
 *   INDEX_KEY           = <base64 32 bytes> (HMAC blind-index key; MUST differ from master)
 *
 * Generate dev keys (NEVER hardcode):
 *   node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
 *
 * Throws at call time (not at construction) if a required variable is absent or
 * the decoded buffer is not exactly 32 bytes — fail-fast before any crypto op.
 *
 * Security contract (T-02-01):
 *   - No key literal appears here or anywhere in the codebase.
 *   - Keys are decoded only when needed — not cached in instance fields.
 *   - .env files are gitignored; secrets are provisioned via the VPS environment.
 */

import type { KeyProvider } from "./key-provider";

export class EnvKeyProvider implements KeyProvider {
  currentKeyVersion(): number {
    return Number(process.env["MASTER_KEY_CURRENT"] ?? "1");
  }

  encryptionKey(version: number): Buffer {
    const varName = `MASTER_KEY_V${version}`;
    const b64 = process.env[varName];
    if (!b64) {
      throw new Error(
        `EnvKeyProvider: ${varName} is not set. ` +
          `Generate with: node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'`,
      );
    }
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) {
      throw new Error(
        `EnvKeyProvider: ${varName} must decode to exactly 32 bytes (AES-256), got ${key.length}`,
      );
    }
    return key;
  }

  indexKey(): Buffer {
    const b64 = process.env["INDEX_KEY"];
    if (!b64) {
      throw new Error(
        "EnvKeyProvider: INDEX_KEY is not set. " +
          "Generate with: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))'",
      );
    }
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) {
      throw new Error(
        `EnvKeyProvider: INDEX_KEY must decode to exactly 32 bytes, got ${key.length}`,
      );
    }
    return key;
  }
}
