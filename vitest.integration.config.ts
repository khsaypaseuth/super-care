/**
 * Vitest integration test configuration.
 *
 * Integration tests connect to a real Postgres database and exercise Prisma queries,
 * migrations, blind-index lookups, and audit-on-access behaviour end-to-end.
 *
 * Requirements:
 *   - TEST_DATABASE_URL must be set (separate DB from dev to avoid data pollution)
 *   - Run `prisma migrate deploy` against the test DB before executing suites
 *
 * To run:
 *   TEST_DATABASE_URL=<url> pnpm test:int
 *
 * Integration suites are NOT included in the default `pnpm test` (vitest.config.ts).
 * This enforces the DB-free unit-test guarantee for every task commit.
 *
 * Pattern: *.int.spec.ts — avoids accidental inclusion by the unit vitest.config.ts
 * which only matches *.spec.ts (not *.int.spec.ts, since it uses the same glob but
 * these files are excluded by convention; integration config is the only entry point).
 */
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Load local env files so `pnpm test:int` works from the repo root without manually
// exporting env. Node 22's process.loadEnvFile populates process.env from a .env file.
// In CI these files don't exist (env comes from the job env), so we ignore "not found".
for (const envPath of ["apps/web/.env", ".env"]) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // file absent (e.g. CI) — env is supplied by the environment instead
  }
}

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` is a Next.js package that throws at import time outside the
      // Next.js runtime. In the Vitest integration (Node.js) environment we alias it
      // to an empty shim so server modules marked `import "server-only"` load cleanly.
      "server-only": resolve(import.meta.dirname, "apps/web/src/test/server-only-shim.ts"),
    },
  },
  test: {
    include: ["apps/web/src/**/*.int.spec.ts"],
    // Run test FILES sequentially (Vitest 4 API — fileParallelism replaces singleFork).
    // This prevents concurrent DB access across test files which would cause
    // beforeEach(truncateAll) in one file from wiping another file's in-progress test data.
    fileParallelism: false,
    // No watch mode — integration tests are run explicitly
    watch: false,
    // Extend timeout: migrations + DB round-trips are slower than unit tests
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Fail fast — don't accumulate DB state from earlier failures
    bail: 1,
    env: {
      // Integration tests use TEST_DATABASE_URL, never DATABASE_URL (dev DB)
      DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "",
    },
    coverage: {
      provider: "v8",
      include: ["apps/web/src/**/*.ts"],
      exclude: [
        "apps/web/src/**/*.spec.ts",
        "apps/web/src/**/*.int.spec.ts",
        "apps/web/src/generated/**",
      ],
    },
  },
});
