/**
 * KeyProvider seam — env now, KMS later, zero call-site change.
 *
 * All key material must flow through this interface.
 * No key literal must exist in any source file — keys come from process.env
 * (via EnvKeyProvider) or from injected test stubs.
 *
 * To swap to an external KMS or Vault: implement KeyProvider against the external API
 * and inject it in place of EnvKeyProvider. CryptoService never changes.
 */

export interface KeyProvider {
  /** The key version used for NEW encryptions (integer, e.g. 1, 2, 3…) */
  currentKeyVersion(): number;

  /**
   * Return the 32-byte AES-256 master encryption key for a given version.
   * Throws if the version is not known (prevents silent data loss during rotation).
   */
  encryptionKey(version: number): Buffer;

  /**
   * Return the 32-byte HMAC key used exclusively for blind-index computation.
   * MUST be a different secret from encryptionKey() (locked decision — CONTEXT.md).
   */
  indexKey(): Buffer;
}
