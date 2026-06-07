import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cover all spec files in packages/shared
    include: ["packages/shared/src/**/*.spec.ts"],
    // No watch mode — CI uses `vitest run`
    watch: false,
    coverage: {
      provider: "v8",
      include: ["packages/shared/src/**/*.ts"],
      exclude: ["packages/shared/src/**/*.spec.ts"],
    },
  },
});
