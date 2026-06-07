import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  // Apply TypeScript-ESLint recommended rules
  ...tseslint.configs.recommended,

  // Explicitly ban `any` — PLAT-01 enforcement
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Scope to source files only
  {
    files: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
  },

  // Prettier must be last to turn off any formatting-conflict rules
  prettierConfig,

  // Ignore generated/non-source directories
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "*.mjs",
      "*.config.ts",
    ],
  },
);
