/**
 * LocalFsStorageAdapter — encrypted local filesystem storage for Phase 3.
 *
 * Security contracts (T-03-07, T-03-08):
 *   - Refs are server-generated UUIDs (crypto.randomUUID()) — NEVER derived from user input.
 *   - Resolved file path must stay inside the resolved UPLOAD_DIR — verified before every
 *     read/write. Refs containing ".." or starting with "/" are rejected immediately (T-03-08).
 *   - Files are written as AES-256-GCM ciphertext via CryptoService (T-03-07).
 *   - Storage directory is ./.uploads (gitignored, outside public/) — never web-served.
 *
 * Storage format:
 *   - <ref>.enc  — the encrypted payload
 *   - <ref>.mime — the MIME type in plaintext (not PII)
 *
 * Encryption:
 *   - File bytes are base64-encoded then passed to CryptoService.encrypt() (string in/out).
 *   - On get(), CryptoService.decrypt() returns the base64 string; Buffer.from(b64, "base64")
 *     reconstructs the original bytes.
 *
 * UPLOAD_DIR env key: from process.env["UPLOAD_DIR"] (default: ./.uploads relative to cwd).
 * The directory is created on first use if it does not exist.
 *
 * Server-only: this file touches fs and CryptoService — never import in a client component.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { StorageProvider } from "./storage.port";
import { CryptoService } from "../../crypto/crypto.service";
import { EnvKeyProvider } from "../../crypto/env-key-provider";

// ─── Path traversal guard ──────────────────────────────────────────────────────

/**
 * Reject any ref that would allow path traversal:
 *   - Refs containing ".." (directory traversal)
 *   - Refs starting with "/" (absolute paths)
 *
 * @throws {Error} if the ref is unsafe
 */
function assertSafeRef(ref: string): void {
  if (ref.includes("..")) {
    throw new Error(`StorageProvider: ref contains path traversal sequence: "${ref}"`);
  }
  if (ref.startsWith("/")) {
    throw new Error(`StorageProvider: ref must not be an absolute path: "${ref}"`);
  }
}

/**
 * Assert that the resolved absolute path stays inside the resolved base directory.
 * Defends against symlink and Unicode tricks beyond simple ".." checking.
 *
 * @throws {Error} if resolvedPath is outside resolvedBase
 */
function assertInsideBase(resolvedBase: string, resolvedPath: string): void {
  // Use path boundary: resolvedPath must equal resolvedBase OR start with resolvedBase + sep
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + "/")) {
    throw new Error(
      `StorageProvider: resolved path "${resolvedPath}" is outside upload directory "${resolvedBase}"`,
    );
  }
}

// ─── Adapter ───────────────────────────────────────────────────────────────────

export class LocalFsStorageAdapter implements StorageProvider {
  private readonly uploadDir: string;
  private readonly crypto: CryptoService;

  constructor(uploadDir?: string, crypto?: CryptoService) {
    // Resolve the upload directory relative to process.cwd() so it's deterministic
    const rawDir = uploadDir ?? process.env["UPLOAD_DIR"] ?? "./.uploads";
    this.uploadDir = resolve(process.cwd(), rawDir);
    this.crypto = crypto ?? new CryptoService(new EnvKeyProvider());

    // Create the upload directory on construction if it doesn't exist
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Encrypt bytes and write to disk under a server-generated UUID ref.
   * Returns the opaque ref (never derived from user input).
   */
  async put(bytes: Buffer, mime: string): Promise<string> {
    const ref = randomUUID();

    // Encode bytes → base64 string → encrypt with AES-256-GCM
    const b64 = bytes.toString("base64");
    const ciphertext = this.crypto.encrypt(b64);

    // Resolve paths and assert they stay inside UPLOAD_DIR
    const encPath = this.resolveSafe(ref + ".enc");
    const mimePath = this.resolveSafe(ref + ".mime");

    writeFileSync(encPath, ciphertext, "utf-8");
    writeFileSync(mimePath, mime, "utf-8");

    return ref;
  }

  /**
   * Read, decrypt, and return the stored bytes.
   * Rejects refs with ".." or absolute paths before any filesystem access.
   */
  async get(ref: string): Promise<{ bytes: Buffer; mime: string }> {
    assertSafeRef(ref);

    const encPath = this.resolveSafe(ref + ".enc");
    const mimePath = this.resolveSafe(ref + ".mime");

    if (!existsSync(encPath)) {
      throw new Error(`StorageProvider: ref not found: "${ref}"`);
    }

    const ciphertext = readFileSync(encPath, "utf-8");
    const mime = readFileSync(mimePath, "utf-8");

    // Decrypt → base64 string → decode to original bytes
    const b64 = this.crypto.decrypt(ciphertext);
    const bytes = Buffer.from(b64, "base64");

    return { bytes, mime };
  }

  /**
   * Delete the stored blob files for the given ref.
   * Rejects refs with ".." or absolute paths before any filesystem access.
   */
  async delete(ref: string): Promise<void> {
    assertSafeRef(ref);

    const encPath = this.resolveSafe(ref + ".enc");
    const mimePath = this.resolveSafe(ref + ".mime");

    if (existsSync(encPath)) unlinkSync(encPath);
    if (existsSync(mimePath)) unlinkSync(mimePath);
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Resolve a filename relative to UPLOAD_DIR and assert the result stays inside it.
   * This catches any remaining path traversal after the basic ref check.
   */
  private resolveSafe(filename: string): string {
    const resolved = resolve(this.uploadDir, filename);
    assertInsideBase(this.uploadDir, resolved);
    return resolved;
  }
}
