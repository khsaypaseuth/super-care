import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` shim for Vitest (same reason as vitest.integration.config.ts)
      "server-only": resolve(import.meta.dirname, "apps/web/src/test/server-only-shim.ts"),
    },
  },
  test: {
    // Cover all unit spec files in packages/shared AND apps/web server modules
    // (no DATABASE_URL needed — unit tests inject keys directly, no DB I/O)
    include: [
      "packages/shared/src/**/*.spec.ts",
      "apps/web/src/**/*.spec.ts",
    ],
    // Exclude integration specs — they require a live DB and run via pnpm test:int
    exclude: [
      "apps/web/src/**/*.int.spec.ts",
      "node_modules/**",
    ],
    // No watch mode — CI uses `vitest run`
    watch: false,
    coverage: {
      provider: "v8",
      include: [
        "packages/shared/src/**/*.ts",
        "apps/web/src/**/*.ts",
      ],
      exclude: [
        "packages/shared/src/**/*.spec.ts",
        "apps/web/src/**/*.spec.ts",
        // Generated Prisma client is a build artifact — not our code
        "apps/web/src/generated/**",
      ],
    },
  },
});
