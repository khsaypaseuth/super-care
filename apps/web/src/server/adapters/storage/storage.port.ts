/**
 * StorageProvider port — the deep-module seam for encrypted document storage.
 *
 * Security contracts (T-03-07, T-03-08):
 *   - put() returns an opaque, server-generated ref (UUID). The ref is NEVER derived
 *     from user input — the client never controls the on-disk file path.
 *   - get() rejects any ref containing ".." or starting with "/" — path traversal
 *     is impossible at the adapter level.
 *   - Files are stored encrypted at rest (AES-256-GCM via CryptoService).
 *   - Storage location is NEVER under the web root / public/ directory.
 *   - Real adapter (S3/R2/Hostinger) swaps in at Phase 10 with zero consumer changes.
 *
 * The DB stores only the opaque ref (in IdentityDocument.documentRef, encrypted by the repo).
 * The storage adapter holds the actual blob. Refs from the DB are server-managed cuids/UUIDs.
 */

// ─── Port interface ────────────────────────────────────────────────────────────

/**
 * The storage provider port — config-selected at runtime by the registry.
 * LocalFsStorageAdapter is the Phase-3 implementation; cloud object storage lands Phase 10.
 */
export interface StorageProvider {
  /**
   * Store bytes at rest and return an opaque server-generated ref.
   *
   * @param bytes - the raw file bytes to store (will be encrypted at rest)
   * @param mime  - the MIME type of the file (stored alongside for retrieval)
   * @returns an opaque ref string (UUID) that identifies the stored blob
   * @throws if the bytes cannot be encrypted or written
   */
  put(bytes: Buffer, mime: string): Promise<string>;

  /**
   * Retrieve and decrypt bytes by ref.
   *
   * @param ref - the opaque ref returned by put()
   * @returns the original bytes and mime type
   * @throws if the ref contains ".." or is an absolute path (path traversal guard)
   * @throws if the ref does not exist or decryption fails
   */
  get(ref: string): Promise<{ bytes: Buffer; mime: string }>;

  /**
   * Delete the stored blob by ref.
   *
   * @param ref - the opaque ref returned by put()
   * @throws if the ref contains ".." or is an absolute path (path traversal guard)
   * @throws if the ref does not exist
   */
  delete(ref: string): Promise<void>;
}
