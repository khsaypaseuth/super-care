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

export default defineConfig({
  test: {
    include: ["apps/web/src/**/*.int.spec.ts"],
    // Integration tests run serially to avoid parallel DB clobbering
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
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
