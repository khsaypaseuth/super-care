/**
 * Adapter registry — config-selected provider factory.
 *
 * This file is marked `import "server-only"` so it never bundles into a client
 * component (T-03-10). It reads env vars and returns the appropriate adapter
 * implementation for each provider port.
 *
 * Env keys:
 *   OCR_PROVIDER      - selects the OCR adapter (default: "fake")
 *   MAPPER_PROVIDER   - selects the mapper adapter (default: "fake")
 *   STORAGE_PROVIDER  - selects the storage adapter (default: "localfs")
 *   UPLOAD_DIR        - base directory for LocalFsStorageAdapter (default: ./.uploads)
 *
 * Phase 3: all providers default to the fake/local adapters.
 * Phase 10: set env vars to "google" / "llm" / "s3" to swap real adapters.
 *
 * Real adapters are Phase 10 — dropping them in requires zero consumer changes.
 */

import "server-only";

import type { OcrModule } from "./ocr/ocr.port";
import type { MapperProvider } from "./mapper/mapper.port";
import type { StorageProvider } from "./storage/storage.port";

import { FakeOcrAdapter } from "./ocr/fake-ocr.adapter";
import { FakeMapperAdapter } from "./mapper/fake-mapper.adapter";
import { LocalFsStorageAdapter } from "./storage/localfs-storage.adapter";

// ─── OCR module factory ────────────────────────────────────────────────────────

/**
 * Return the configured OCR module.
 *
 * OCR_PROVIDER values:
 *   "fake" (default) — FakeOcrAdapter (canned reg-book dataset)
 *   "google"         — GoogleDocumentAiAdapter (Phase 10)
 */
export function getOcrModule(): OcrModule {
  const provider = process.env["OCR_PROVIDER"] ?? "fake";

  switch (provider) {
    case "fake":
      return new FakeOcrAdapter();
    default:
      // Future: "google" → new GoogleDocumentAiAdapter()
      // For now, any unknown provider falls back to fake (safe default for Phase 3)
      console.warn(`[registry] Unknown OCR_PROVIDER "${provider}" — falling back to fake`);
      return new FakeOcrAdapter();
  }
}

// ─── Mapper provider factory ───────────────────────────────────────────────────

/**
 * Return the configured mapper provider.
 *
 * MAPPER_PROVIDER values:
 *   "fake" (default) — FakeMapperAdapter (deterministic normalized-distance ranking)
 *   "llm"            — LlmMapperAdapter (Phase 10, Claude/GPT)
 */
export function getMapperProvider(): MapperProvider {
  const provider = process.env["MAPPER_PROVIDER"] ?? "fake";

  switch (provider) {
    case "fake":
      return new FakeMapperAdapter();
    default:
      // Future: "llm" → new LlmMapperAdapter()
      console.warn(`[registry] Unknown MAPPER_PROVIDER "${provider}" — falling back to fake`);
      return new FakeMapperAdapter();
  }
}

// ─── Storage provider factory ──────────────────────────────────────────────────

/**
 * Return the configured storage provider.
 *
 * STORAGE_PROVIDER values:
 *   "localfs" (default) — LocalFsStorageAdapter (AES-256-GCM, ./.uploads, gitignored)
 *   "s3"                — S3StorageAdapter (Phase 10)
 *
 * UPLOAD_DIR — directory for localfs storage (default: ./.uploads)
 */
export function getStorageProvider(): StorageProvider {
  const provider = process.env["STORAGE_PROVIDER"] ?? "localfs";

  switch (provider) {
    case "localfs":
      return new LocalFsStorageAdapter();
    default:
      // Future: "s3" → new S3StorageAdapter()
      console.warn(`[registry] Unknown STORAGE_PROVIDER "${provider}" — falling back to localfs`);
      return new LocalFsStorageAdapter();
  }
}
