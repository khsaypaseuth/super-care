import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  // Apply TypeScript-ESLint recommended rules
  ...tseslint.configs.recommended,

  // Explicitly ban `any` — PLAT-01 enforcement
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
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
