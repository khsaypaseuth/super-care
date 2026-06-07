/**
 * LocalFsStorageAdapter unit tests.
 *
 * Contracts asserted:
 * 1. Round-trip: put(bytes) → get(ref) returns the original bytes unchanged.
 * 2. Encrypted at rest: the .enc file content differs from the plaintext base64.
 * 3. Path traversal rejected: refs with ".." throw before any filesystem access.
 * 4. Absolute paths rejected: refs starting with "/" throw.
 * 5. Resolved write path stays inside UPLOAD_DIR.
 * 6. Non-existent ref throws on get().
 * 7. delete() removes the stored files.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { LocalFsStorageAdapter } from "./localfs-storage.adapter.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import type { KeyProvider } from "../../crypto/key-provider.js";

// ─── Test key provider (in-memory deterministic keys for unit tests) ───────────

class TestKeyProvider implements KeyProvider {
  private readonly key: Buffer;
  private readonly index: Buffer;

  constructor() {
    // 32 bytes of fixed values — deterministic for tests, NEVER use in production
    this.key = Buffer.alloc(32, 0x42);
    this.index = Buffer.alloc(32, 0x43);
  }

  currentKeyVersion(): number { return 1; }
  encryptionKey(version: number): Buffer {
    if (version !== 1) throw new Error(`Unknown key version ${version}`);
    return this.key;
  }
  indexKey(): Buffer { return this.index; }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let testUploadDir: string;
let adapter: LocalFsStorageAdapter;
let crypto: CryptoService;

beforeEach(() => {
  testUploadDir = join(tmpdir(), `super-care-storage-test-${Date.now()}`);
  mkdirSync(testUploadDir, { recursive: true });
  crypto = new CryptoService(new TestKeyProvider());
  adapter = new LocalFsStorageAdapter(testUploadDir, crypto);
});

afterEach(() => {
  // Clean up test upload dir after each test
  if (existsSync(testUploadDir)) {
    rmSync(testUploadDir, { recursive: true, force: true });
  }
});

describe("LocalFsStorageAdapter — round-trip", () => {
  it("put → get returns the original bytes unchanged", async () => {
    const originalBytes = Buffer.from("Hello, encrypted world!", "utf-8");
    const mime = "text/plain";

    const ref = await adapter.put(originalBytes, mime);
    const result = await adapter.get(ref);

    expect(result.bytes.equals(originalBytes)).toBe(true);
    expect(result.mime).toBe(mime);
  });

  it("round-trips binary bytes correctly", async () => {
    const binaryBytes = Buffer.from([0x00, 0xff, 0xde, 0xad, 0xbe, 0xef, 0x42, 0x00]);
    const mime = "application/octet-stream";

    const ref = await adapter.put(binaryBytes, mime);
    const result = await adapter.get(ref);

    expect(result.bytes.equals(binaryBytes)).toBe(true);
  });

  it("stores and retrieves correct MIME type", async () => {
    const bytes = Buffer.from("fake-pdf-content");
    const ref = await adapter.put(bytes, "application/pdf");
    const result = await adapter.get(ref);

    expect(result.mime).toBe("application/pdf");
  });
});

describe("LocalFsStorageAdapter — encrypted at rest", () => {
  it("the .enc file content differs from the plaintext (encrypted at rest)", async () => {
    const originalBytes = Buffer.from("sensitive-document-bytes");
    const b64Plaintext = originalBytes.toString("base64");

    const ref = await adapter.put(originalBytes, "image/jpeg");

    // Read the raw .enc file from disk
    const encPath = join(testUploadDir, ref + ".enc");
    expect(existsSync(encPath)).toBe(true);

    const rawOnDisk = readFileSync(encPath, "utf-8");

    // The on-disk content must NOT equal the plaintext base64
    expect(rawOnDisk).not.toBe(b64Plaintext);
    // The on-disk content must NOT contain the plaintext string
    expect(rawOnDisk).not.toContain("sensitive-document-bytes");
    // The on-disk content should be in the CryptoService envelope format v1:...:...:...
    expect(rawOnDisk).toMatch(/^v\d+:.+:.+:.+$/);
  });
});

describe("LocalFsStorageAdapter — path traversal guard (T-03-08)", () => {
  it("get() rejects a ref containing '../'", async () => {
    await expect(adapter.get("../etc/passwd")).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("get() rejects a ref with '..' anywhere in the path", async () => {
    await expect(adapter.get("valid-prefix/../../../etc/shadow")).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("get() rejects an absolute path ref (starts with '/')", async () => {
    await expect(adapter.get("/etc/passwd")).rejects.toThrow(
      /absolute path/i,
    );
  });

  it("delete() rejects a ref containing '../'", async () => {
    await expect(adapter.delete("../some/path")).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("delete() rejects an absolute path ref", async () => {
    await expect(adapter.delete("/tmp/evil")).rejects.toThrow(
      /absolute path/i,
    );
  });

  it("resolved .enc path is inside UPLOAD_DIR", async () => {
    const bytes = Buffer.from("test");
    const ref = await adapter.put(bytes, "image/png");

    const resolvedUploadDir = resolve(testUploadDir);
    const encPath = join(testUploadDir, ref + ".enc");
    const resolvedEncPath = resolve(encPath);

    expect(resolvedEncPath.startsWith(resolvedUploadDir + "/")).toBe(true);
  });
});

describe("LocalFsStorageAdapter — error handling", () => {
  it("get() throws when ref does not exist", async () => {
    await expect(adapter.get("nonexistent-uuid-ref")).rejects.toThrow(
      /not found/i,
    );
  });

  it("delete() succeeds silently when ref does not exist", async () => {
    // Should not throw for a missing ref
    await expect(adapter.delete("nonexistent-ref")).resolves.toBeUndefined();
  });
});

describe("LocalFsStorageAdapter — delete", () => {
  it("delete() removes both .enc and .mime files", async () => {
    const bytes = Buffer.from("to be deleted");
    const ref = await adapter.put(bytes, "text/plain");

    const encPath = join(testUploadDir, ref + ".enc");
    const mimePath = join(testUploadDir, ref + ".mime");

    expect(existsSync(encPath)).toBe(true);
    expect(existsSync(mimePath)).toBe(true);

    await adapter.delete(ref);

    expect(existsSync(encPath)).toBe(false);
    expect(existsSync(mimePath)).toBe(false);
  });

  it("get() throws after delete()", async () => {
    const bytes = Buffer.from("content");
    const ref = await adapter.put(bytes, "text/plain");
    await adapter.delete(ref);

    await expect(adapter.get(ref)).rejects.toThrow(/not found/i);
  });
});
