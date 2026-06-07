/**
 * Prisma 7 configuration file.
 * The datasource URL must be defined here (not in schema.prisma) per Prisma 7's new config model.
 * See: https://pris.ly/d/config-datasource
 *
 * Never commit real DATABASE_URL values — use a gitignored .env file.
 * The URL is optional here so that `prisma generate` (which only needs the schema) can run
 * without DATABASE_URL set (e.g. during postinstall in CI without a DB service yet running).
 * Migration and query commands still require DATABASE_URL at runtime.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
