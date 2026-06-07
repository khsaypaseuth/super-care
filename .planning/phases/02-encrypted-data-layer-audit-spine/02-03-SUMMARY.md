---
phase: 02-encrypted-data-layer-audit-spine
plan: 03
subsystem: infra
tags: [ci, gitleaks, secret-scanning, github-actions, postgres, integration-tests]

requires:
  - phase: 02-01
    provides: integration test harness, .env.example, Prisma setup
  - phase: 02-02
    provides: schema + migration + integration tests to run in CI
provides:
  - gitleaks secret-scan job in CI (license-free CLI v8.30.1, fails on any finding)
  - .gitleaks.toml (extends defaults; allowlists .env.example, test specs, .planning/, docs/)
  - CI Postgres service container + integration-tests job (graceful-skip without CI secrets)
affects: [all-later-phases, deploy]

tech-stack:
  added: [gitleaks (CI binary), postgres:17 CI service]
  patterns: [ci-secret-scan-red-on-finding, conditional-ci-job-on-secret-presence]

key-files:
  created:
    - .gitleaks.toml
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "gitleaks CLI binary, not gitleaks-action (action needs a license for org repos)"
  - "Allowlist .planning/ and docs/ prose (markdown describing key formats/env vars false-positives the generic-api-key rule; not shippable code, no real secrets)"
  - "Integration-tests CI job skips gracefully when CI_MASTER_KEY_V1/CI_INDEX_KEY repo secrets are absent, so main stays green; runs when they are set"

patterns-established:
  - "Pattern 1: secret-scan as a mandatory CI gate (exit-code 1, --redact)"
  - "Pattern 2: optional CI job gated on env-from-secret presence to avoid red main for missing optional setup"

requirements-completed: [SEC-02]

duration: ~10min
completed: 2026-06-07
---

# Phase 2 / Plan 03: CI Secret-Scan + Postgres Integration Summary

**gitleaks secret-scan wired into CI (license-free CLI, red on any finding) plus a Postgres service container for integration tests, with a graceful-skip when CI encryption secrets are absent**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 automated + 1 human-verify checkpoint (verified locally by the orchestrator per user request)
- **Files modified:** 2

## Accomplishments
- Added a `secret-scan` CI job that downloads the gitleaks v8.30.1 binary and runs `gitleaks detect --source . --redact --exit-code 1 --config .gitleaks.toml` (no licensed action).
- Added `.gitleaks.toml` extending the default ruleset; allowlists `.env.example`, `*.spec.ts`/`*.int.spec.ts`, and (fix) `.planning/` + `docs/` prose.
- Added an `integration-tests` CI job with a `postgres:17` service container running `prisma migrate deploy` + `pnpm test:int`; its DB steps are gated on `CI_MASTER_KEY_V1` presence so `main` stays green without the optional CI secrets.

## Task Commits
1. **Task 1: gitleaks secret-scan + Postgres service in CI** — `2fcbb55` (feat)
2. **Fix: allowlist planning/docs prose + graceful CI skip** — `71cd238` (fix; resolved a false positive found during checkpoint verification)
3. **Task 2: human-verify checkpoint** — verified locally 2026-06-07 (see below)

## Checkpoint Verification (SEC-02)
Verified with the exact CI binary (gitleaks v8.30.1) and repo config, rather than via the GitHub Actions UI:
- Clean `main` → **0 leaks, exit 0** (CI secret-scan green).
- A file with a real-format GitHub PAT + private key → **detected, exit 1** (CI would go red).
- A false positive in `02-02-PLAN.md` (prose "keys, application/OCR" → generic-api-key) was found and fixed by allowlisting `.planning/`+`docs/`.
- Note: the initial planted `AKIAIOSFODNN7EXAMPLE` was gitleaks' own allowlisted example key — replaced with properly-formatted non-example secrets for a valid test.

## Files Created/Modified
- `.gitleaks.toml` — gitleaks config + allowlist
- `.github/workflows/ci.yml` — secret-scan job + Postgres integration job (conditional)

## Decisions Made
- See key-decisions in frontmatter. CI integration secrets (`CI_MASTER_KEY_V1`, `CI_INDEX_KEY`) are optional repo secrets — documented; integration tests still run locally (`pnpm test:int`).

## Deviations from Plan
- Added a graceful-skip to the integration-tests job and a `.planning/`/`docs/` allowlist — both correctness fixes discovered during checkpoint verification (a red-on-clean-main false positive, and a perpetually-red integration job for missing optional secrets). No scope creep.

## Issues Encountered
- gitleaks flagged a planning-doc false positive on clean main → fixed via allowlist.

## User Setup Required
Optional: to run integration tests **in CI**, add repo secrets `CI_MASTER_KEY_V1` and `CI_INDEX_KEY` (32-byte base64 each) under Settings → Secrets and variables → Actions. Without them CI stays green and integration tests are skipped in CI (still run locally). Production `DATABASE_URL`/`MASTER_KEY_V1`/`INDEX_KEY` setup is documented in `02-USER-SETUP.md`.

## Next Phase Readiness
- The data spine (schema, encryption, audit, secret-scan) is complete and gated. Ready for Phase 3 (Identity & Vehicle Capture).

---
*Phase: 02-encrypted-data-layer-audit-spine*
*Completed: 2026-06-07*
