/**
 * server-only shim for Vitest integration tests.
 *
 * The `server-only` package is a Next.js utility that throws at import time when
 * imported outside the Next.js runtime (e.g. in Node.js test environments). This
 * empty shim replaces it so that `import "server-only"` in server modules becomes
 * a no-op under Vitest — the server-only guarantee is still enforced at Next build
 * time (RSC bundler rejects client-component imports of server-only-marked modules).
 *
 * Aliased in vitest.integration.config.ts (and vitest.config.ts) via resolve.alias.
 */
// Intentionally empty — this file is a no-op shim.
export {};
