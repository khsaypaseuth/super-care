# Phase 2 — Environment Setup Guide

This guide covers the database and encryption key setup required before running integration tests
or migrating the database for development or the Hostinger VPS production deployment.

## Prerequisites

- PostgreSQL 17.x installed and running
- A `super_care` Postgres role created (see below)
- Node.js 22.x installed

---

## Step 1: Create the Postgres role and databases

```bash
# Connect as postgres superuser
psql -U postgres

# Create the application role (use a strong password in production)
CREATE ROLE super_care WITH LOGIN PASSWORD 'dev_only_local_pw';

# Create the development database
CREATE DATABASE super_care_dev OWNER super_care;

# Create the integration test database (separate from dev — tests reset state)
CREATE DATABASE super_care_test OWNER super_care;

\q
```

---

## Step 2: Generate cryptographic keys

**NEVER use the same key in development and production.**
**NEVER commit real keys — .env is gitignored.**

```bash
# Generate MASTER_KEY_V1 (AES-256, 32 bytes)
node -e 'console.log("MASTER_KEY_V1=" + require("crypto").randomBytes(32).toString("base64"))'

# Generate INDEX_KEY (HMAC, 32 bytes — MUST be a different secret)
node -e 'console.log("INDEX_KEY=" + require("crypto").randomBytes(32).toString("base64"))'
```

---

## Step 3: Create the gitignored `.env` file

Copy `.env.example` to `.env` (in the project root or `apps/web/`), then replace the placeholder
values with the real ones generated above:

```env
DATABASE_URL=postgresql://super_care:<password>@localhost:5432/super_care_dev?schema=public
TEST_DATABASE_URL=postgresql://super_care:<password>@localhost:5432/super_care_test?schema=public
MASTER_KEY_V1=<output from Step 2>
MASTER_KEY_CURRENT=1
INDEX_KEY=<output from Step 2>
```

Verify that `.env` is ignored:
```bash
git check-ignore -v .env apps/web/.env
# Should print lines from .gitignore — if not, add .env to .gitignore immediately
```

---

## Step 4: Run database migrations (blocks integration tests and Plan 02-02)

Integration tests and the Plan 02-02 schema migration are **BLOCKED** until `DATABASE_URL` is set
and the migration is applied:

```bash
# Migrate the dev database
cd apps/web
export DATABASE_URL=<your dev URL>
pnpm db:migrate

# Migrate the test database (required for integration tests)
export DATABASE_URL=<your TEST_DATABASE_URL>
pnpm db:deploy
```

---

## Hostinger VPS Deploy Setup

On the production VPS, set the following as environment variables (never in a committed file):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string for the production database |
| `MASTER_KEY_V1` | Base64-encoded 32-byte AES-256 master key (generate fresh for prod) |
| `MASTER_KEY_CURRENT` | Active key version integer (starts at `1`) |
| `INDEX_KEY` | Base64-encoded 32-byte HMAC key (separate from master key) |

For key rotation on VPS:
1. Generate a new key: `node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'`
2. Add `MASTER_KEY_V2=<new key>` to the VPS env
3. Set `MASTER_KEY_CURRENT=2` (new encryptions use v2; existing v1 rows still decrypt)
4. After all v1 rows are re-encrypted, remove `MASTER_KEY_V1`

---

## What's blocked without DATABASE_URL

- `pnpm test:int` (integration tests) — requires a migrated Postgres database
- `pnpm --filter @super-care/web db:migrate` — requires a running Postgres instance
- `apps/web/src/server/db/client.ts` PrismaClient instantiation at runtime

**Unit tests (`pnpm test`) do NOT require DATABASE_URL** — crypto keys are injected directly
in unit test stubs and no DB I/O occurs.
