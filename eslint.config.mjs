import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  // Apply TypeScript-ESLint recommended rules
  ...tseslint.configs.recommended,

  // Global rule overrides applied across all TS source files
  {
    rules: {
      // Ban `any` — PLAT-01 enforcement
      "@typescript-eslint/no-explicit-any": "error",
      // Allow unused args/vars when prefixed with "_" (standard TypeScript convention
      // for intentionally unused parameters, e.g. interface implementations).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "all",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Scope TypeScript-ESLint rules to source files (packages + apps/web/src)
  {
    files: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
  },

  // Next.js App Router files (app/ dir + tsx components in apps/web)
  {
    files: [
      "apps/web/app/**/*.{ts,tsx}",
      "apps/web/src/**/*.{ts,tsx}",
      "apps/web/proxy.ts",
    ],
    ...nextPlugin.configs["core-web-vitals"],
    settings: {
      next: {
        rootDir: "apps/web",
      },
    },
  },

  // Re-apply strict rules for web app files after Next config
  {
    files: [
      "apps/web/app/**/*.{ts,tsx}",
      "apps/web/src/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Prettier must be last to turn off any formatting-conflict rules
  prettierConfig,

  // Ignore generated/non-source directories
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.next/**",
      "**/src/generated/**",
      "*.mjs",
      "*.config.ts",
      "apps/web/next-env.d.ts",
    ],
  },
);
