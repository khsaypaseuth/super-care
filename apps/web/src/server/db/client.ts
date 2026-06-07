/**
 * PrismaClient singleton — HMR-safe (Next.js / Vitest).
 *
 * Prisma 7 uses driver adapters: PrismaPg wraps the `pg` pool and is passed to
 * PrismaClient({ adapter }). The URL is read from DATABASE_URL at startup.
 *
 * Next.js hot-module reload (HMR) re-imports server modules on every code change.
 * Without the globalThis cache, each reload opens a new PrismaClient connection —
 * quickly exhausting the Postgres connection pool (Pitfall 6 in 02-RESEARCH.md).
 *
 * Cache on globalThis so the *same* client instance survives repeated imports in
 * development; in production a fresh process gets exactly one instance.
 *
 * Import path: "../../generated/prisma/client.js" (ESM explicit extension — Prisma 7).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

function createClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const g = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = g.prisma ?? createClient();

if (process.env["NODE_ENV"] !== "production") {
  g.prisma = db;
}
