# Phase 1: Foundation & Money/Legal Cores - Research

**Researched:** 2026-06-06
**Domain:** TypeScript monorepo scaffolding + pure money/legal domain logic (FX, identifier validators, Order state machine, commission, premium) — no I/O, no DB, no HTTP, no UI
**Confidence:** HIGH (all library versions verified against the live npm registry 2026-06-06; big.js rounding API and XState v5 headless API verified by execution / official docs; Thai-ID test vectors computed and verified locally)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Money representation (CONFIRMED with user):**
- **Decimal everywhere.** DB columns are Prisma `Decimal` (Phase 2); in-code money/rate math uses **big.js** with explicit rounding modes. **JS `number` is never used for money.** (PLAT-03)
- FX `+15 kips` markup is applied **per rate unit**, then **rounded up (`ceil` / `Big.roundUp`)**.
- Handles THB (2-dp satang) and LAK (whole kip) in one model.

**Monorepo tooling (CONFIRMED with user):**
- **Plain pnpm workspaces + TypeScript project references.** No Turborepo/Nx. Root scripts drive build/test/lint across `apps/api`, `apps/web`, `packages/shared`.

**Stack (locked unless flagged):**
- **TypeScript strict** (`noImplicitAny`, `any` banned in committed code). (PLAT-01)
- **Vitest** as the single TDD test runner for `packages/shared`.
- **XState v5** for the Order state machine, used **headless** as a pure, exhaustively-testable transition function (not a running actor). (ORD-02)
- **Zod** for schema/type definitions of domain objects. (PLAT-02)
- **big.js** for decimal money math.
- Lint: ESLint + typescript-eslint, `any` disallowed; Prettier for formatting.

**Pure-logic placement:** all TDD-critical pure functions live in `packages/shared` with **no I/O imports**, reused by both apps.

**Walking-skeleton interpretation:** Phase 1 "thinnest working slice" = **monorepo builds + CI green + all pure-core test suites passing.** Do NOT force a DB read/write or UI interaction into Phase 1.

### Claude's Discretion
- Exact file/folder layout within each package; ESLint/Prettier/tsconfig specifics; CI provider config (GitHub Actions assumed); naming of internal pure functions (must match glossary domain terms where they represent domain concepts).

### Deferred Ideas (OUT OF SCOPE)
- Prisma schema, migrations, PII encryption, audit logging → Phase 2.
- Wiring pure cores into NestJS services / live boundaries → Phase 3–4.
- Fake adapters (OCR/payment/messaging/certificate) → Phases 3–6.
- Real providers + compliance gate → Phase 10.
- **NestJS HTTP, Next.js UI, any adapter (even fakes), any persistence — all out of Phase 1.** Only the `apps/api` and `apps/web` *shells* (typecheck-clean skeletons) are scaffolded so project references resolve and CI is green.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | pnpm monorepo (`apps/api`, `apps/web`, `packages/shared`) builds with strict TS (`any` banned) | §Standard Stack + §Monorepo Architecture (pnpm-workspace.yaml, project refs, strict tsconfig base, ESLint flat config banning `any`) |
| PLAT-02 | Zod schemas validate every untrusted boundary | §Zod scaffolding pattern — define domain schemas in `packages/shared/schemas` now; no live boundary yet |
| PLAT-03 | Money is decimal (big.js / Prisma `Decimal`), never float | §big.js Money Math (Money/Fx value objects, `Big.roundUp`) |
| PLAT-04 | CI gate runs typecheck + lint + tests, red on failure | §CI (GitHub Actions workflow) |
| CUST-05 | Thai National ID 13-digit checksum (pure validator) | §Thai National ID Checksum (algorithm + verified vector table) |
| CUST-06 | Passport number format (pure validator) | §Passport / Plate / Chassis / Engine Validators |
| VEH-02 | Plate / chassis / engine format validators (pure) | §Passport / Plate / Chassis / Engine Validators |
| FX-01 | Table-driven Premium lookup in THB (no underwriting engine) | §Premium Lookup |
| FX-02 | FxQuote: THB→LAK at source rate +15 kips/unit, ceil | §big.js Money Math + §FX Math |
| FX-03 | FX direction rule: no conversion/markup on THB-collection path | §FX Math (direction rule) |
| ORD-02 | Order state machine; illegal transitions throw | §XState v5 Order Machine (full transition table) |
| COMM-01 | Commission tier ladder (volume thresholds; % and/or flat per-order; defined base) | §Commission Tier Ladder |
| COMM-02 | Commission boundary cases exhaustively tested | §Commission Tier Ladder (boundary vector table) |
</phase_requirements>

## Summary

Phase 1 is a **pure-logic + scaffolding** phase. There is no database, no HTTP server, no UI, and no adapter (not even a fake) in scope. The deliverable is a pnpm workspace that typechecks under strict TS, a green GitHub Actions CI gate, and a set of exhaustively-tested pure functions in `packages/shared`: FX math, identifier validators, the Order state machine (headless XState), table-driven Premium lookup, and the commission tier ladder. Two app *shells* (`apps/api` NestJS skeleton, `apps/web` Next.js skeleton) exist only so project references resolve and CI exercises the whole graph — they contain no business logic.

All library versions are current and verified against the npm registry on 2026-06-06: `big.js@7.0.1`, `xstate@5.32.0`, `vitest@4.1.8`, `zod@4.4.3`, `typescript@6.0.3`, `typescript-eslint@8.60.1`, `prettier@3.8.3`, `eslint@10.4.1`. Local environment confirmed: Node v22.14.0, pnpm 10.33.2, git 2.49.0. The big.js rounding constant for "round up / ceil" is **`Big.roundUp` (numeric value `3`)** — verified by execution; it rounds away from zero, which equals `ceil` for the positive money amounts in scope. The XState v5 headless API is the pure **`transition(machine, state, event)`** function — confirmed against official docs.

**Primary recommendation:** Build `packages/shared` first and TDD-first (validators → fx.math → premium → commission → order machine), each pure function in its own file with a colocated `.spec.ts`. Scaffold the two app shells minimally. Wire the strict tsconfig base + project references + ESLint flat config (ban `any`) + Prettier + a single Vitest workspace config, then the CI workflow. Money math uses a `Money { amount: Big; currency }` value object with `Big.roundUp` applied **only at the FX-quote boundary, on the per-THB rate**.

## Architectural Responsibility Map

> Phase 1 is single-tier (one Node/TS toolchain). "Tier" here means *which package owns the capability* — the load-bearing boundary for this phase.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| FX math (rate +15 kips/unit, ceil, direction rule) | `packages/shared` (pure) | — | Money/legal pure function, reused by api + web; no I/O |
| Identifier validators (Thai-ID, passport, plate, chassis, engine) | `packages/shared/validators` (pure) | — | Deterministic, exhaustively testable; LLM never touches them |
| Premium lookup (THB, table-driven) | `packages/shared` (pure) | — | A lookup, not a risk model; pure data + function |
| Commission tier ladder | `packages/shared` (pure) | — | Money path; boundary-tested; THB base |
| Order state machine (headless) | `packages/shared` (pure XState) | `apps/api` (later: OrderService wraps it) | Pure transition table now; orchestration deferred to Phase 4 |
| Zod domain schemas | `packages/shared/schemas` | api + web (consumers, later) | Single source of truth for boundary shapes |
| Monorepo build/typecheck/lint/test orchestration | repo root (pnpm + scripts) | CI | Drives all packages; no business logic |
| App HTTP / UI behavior | OUT OF SCOPE (shells only) | — | Deferred to Phases 3–4+ per roadmap |

## Standard Stack

### Core (Phase 1 only — supporting libraries for later phases are documented in `.planning/research/STACK.md` and NOT installed now)

| Library | Version (verified npm 2026-06-06) | Purpose | Why Standard |
|---------|-----------|---------|--------------|
| **typescript** | `6.0.3` | Strict typing across all packages | Fixed by standards; `6.x` current; supports project references + ESM |
| **big.js** | `7.0.1` | Decimal money/rate math (FX, premium, commission) | Small, zero-dep, immutable, explicit rounding modes; `Big.roundUp` = ceil. The locked money choice |
| **xstate** | `5.32.0` | Order state machine (headless, pure `transition`) | `5.x` is the stable line; pure `transition(machine,state,event)` makes illegal transitions trivially testable |
| **zod** | `4.4.3` | Domain schema definitions in `packages/shared` | Fixed by standards; `v4` current; one schema reused by api + web |
| **vitest** | `4.1.8` | TDD test runner for all packages | Native ESM/TS, no ts-jest tax, fast watch; one runner for the monorepo |
| **@vitest/coverage-v8** | `4.1.8` | Coverage for the pure cores | Matches Vitest version exactly; enables coverage gating on the money/legal cores |

### Supporting (tooling)

| Library | Version (verified) | Purpose | When to Use |
|---------|---------|---------|-------------|
| **eslint** | `10.4.1` | Linting (flat config) | Root flat config across all packages |
| **typescript-eslint** | `8.60.1` | TS-aware lint rules incl. `no-explicit-any` | The package that bans `any` (PLAT-01) |
| **prettier** | `3.8.3` | Formatting | Root config; `eslint-config-prettier` to disable conflicting rules |
| **eslint-config-prettier** | `^10` (verify at install) | Turn off formatting rules ESLint would fight Prettier on | Always alongside Prettier + ESLint |
| **@types/node** | `^25` (Node 22 types) | Node typings | tsconfig `types` for the api shell + scripts |
| **tsx** | latest (verify at install) | Run TS directly if a script needs it | Optional; Vitest already handles TS test transform |

> **Scope discipline:** Do NOT install NestJS, Next.js runtime deps, Prisma, omise, @google-cloud/vision, BullMQ, etc. in Phase 1 beyond the *minimum* needed to make the two app shells typecheck. `apps/api` needs only enough to be a valid TS project (a `main.ts` that exports/no-ops); `apps/web` similarly. The full supporting stack lands in its primary phase per the roadmap. [CITED: .planning/research/STACK.md, .planning/ROADMAP.md]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| big.js | decimal.js / bignumber.js | Only if you need transcendental math or advanced base/format config; big.js is leaner for +/×/round [CITED: STACK.md] |
| big.js | dinero.js v2 | Avoid — `@dinero.js/core` is stalled `2.0.0-alpha.*` [CITED: STACK.md] |
| XState | hand-rolled `Record<State, Record<Event, State>>` map | Defensible for a tiny machine and zero-dep; user locked XState. A plain transition table is still the *mental model* — XState's `transition()` makes it pure and typed [CITED: CONTEXT.md decision] |
| Vitest | Jest 30 + ts-jest 29 | Only if team has deep Jest investment; user locked Vitest [CITED: CONTEXT.md] |
| pnpm workspaces + project refs | Turborepo / Nx | Explicitly rejected by user [CITED: CONTEXT.md] |

**Installation (Phase 1):**
```bash
# Root dev tooling (workspace root)
pnpm add -D -w typescript@6.0.3 vitest@4.1.8 @vitest/coverage-v8@4.1.8 \
  eslint@10.4.1 typescript-eslint@8.60.1 prettier@3.8.3 eslint-config-prettier \
  @types/node

# packages/shared (the pure-logic home)
pnpm --filter @super-care/shared add big.js@7.0.1 xstate@5.32.0 zod@4.4.3
pnpm --filter @super-care/shared add -D @types/big.js

# App shells: only what makes them valid TS projects (defer NestJS/Next runtime to later phases)
```

**Version verification (run 2026-06-06):**
```
big.js -> 7.0.1   xstate -> 5.32.0   vitest -> 4.1.8   zod -> 4.4.3
typescript -> 6.0.3   eslint -> 10.4.1   typescript-eslint -> 8.60.1   prettier -> 3.8.3
@vitest/coverage-v8 -> 4.1.8
Node v22.14.0 | pnpm 10.33.2 | git 2.49.0  (all present locally)
```
[VERIFIED: npm registry, `npm view <pkg> version`, 2026-06-06]

## Package Legitimacy Audit

> slopcheck was not available in this research environment. All packages below are nonetheless well-known, multi-year, high-download libraries with public source repos; each was confirmed present on the npm registry at the verified version. Per protocol, since slopcheck could not run, the planner should still treat any *new* package added during planning as `[ASSUMED]` and gate it. The packages below are `[CITED]` from the locked stack and verified on-registry.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| typescript | npm | 12+ yrs | ~70M/wk | github.com/microsoft/TypeScript | (unavailable) | Approved |
| big.js | npm | 10+ yrs | ~9M/wk | github.com/MikeMcl/big.js | (unavailable) | Approved |
| xstate | npm | 9+ yrs | ~3M/wk | github.com/statelyai/xstate | (unavailable) | Approved |
| zod | npm | 5+ yrs | ~30M/wk | github.com/colinhacks/zod | (unavailable) | Approved |
| vitest | npm | 3+ yrs | ~20M/wk | github.com/vitest-dev/vitest | (unavailable) | Approved |
| eslint | npm | 12+ yrs | ~50M/wk | github.com/eslint/eslint | (unavailable) | Approved |
| typescript-eslint | npm | 7+ yrs | ~25M/wk | github.com/typescript-eslint/typescript-eslint | (unavailable) | Approved |
| prettier | npm | 8+ yrs | ~40M/wk | github.com/prettier/prettier | (unavailable) | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
*slopcheck unavailable at research time — planner should run the legitimacy gate on any package not in this table before adding it.*

## Architecture Patterns

### System Architecture (Phase 1 build/data flow)

```
                         repo root
                  pnpm-workspace.yaml
          tsconfig.base.json (strict)   eslint.config.mjs   .prettierrc
                          │
        ┌─────────────────┼──────────────────────┐
        ▼                 ▼                        ▼
  packages/shared     apps/api (shell)        apps/web (shell)
  ─────────────────   ────────────────        ────────────────
  validators/  ◄──────── (imports later)  ◄──────── (imports later)
  fx.math.ts            references @super-care/shared
  premium.ts            references @super-care/shared
  commission.ts
  order.machine.ts (XState, headless)
  schemas/ (Zod)
  types/ (Market, OrderState, ...)
        │
        ▼  (every file has colocated *.spec.ts)
   Vitest  ──►  red→green→refactor
        │
        ▼
   CI (GitHub Actions):  pnpm install ──► typecheck ──► lint ──► test
        │
        ▼   green = phase gate; red on any failure
```

Data flow at runtime (later phases): `apps/api` and `apps/web` both import pure functions from `@super-care/shared`. In Phase 1 the apps are shells; the *only* live "flow" is the build graph: TS project references make `shared` build before the apps, and Vitest runs every `*.spec.ts`.

### Recommended Project Structure
```
super-care/
├── pnpm-workspace.yaml
├── package.json                 # root scripts: build, typecheck, lint, test, format
├── tsconfig.base.json           # strict compiler options, shared by all
├── tsconfig.json                # solution file: references all packages (build orchestration)
├── eslint.config.mjs            # flat config, typescript-eslint, no-explicit-any: error
├── .prettierrc
├── vitest.config.ts             # or vitest.workspace.ts covering all packages
├── .github/workflows/ci.yml
├── packages/
│   └── shared/
│       ├── package.json         # name: @super-care/shared
│       ├── tsconfig.json        # extends base; composite: true
│       └── src/
│           ├── index.ts
│           ├── types/           # Market, Currency, OrderState, OrderEvent
│           ├── schemas/         # Zod: FxQuote, OrderInput, ... (PLAT-02 scaffold)
│           ├── money/
│           │   ├── money.ts            # Money value object over Big
│           │   └── money.spec.ts
│           ├── fx/
│           │   ├── fx.math.ts          # quote(market, premiumThb, sourceRate) (FX-02/03)
│           │   └── fx.math.spec.ts
│           ├── premium/
│           │   ├── premium.ts          # table-driven lookup (FX-01)
│           │   └── premium.spec.ts
│           ├── commission/
│           │   ├── commission.ts       # tier ladder (COMM-01)
│           │   └── commission.spec.ts
│           ├── order/
│           │   ├── order.machine.ts    # XState headless (ORD-02)
│           │   └── order.machine.spec.ts
│           └── validators/
│               ├── thai-national-id.ts + .spec.ts   (CUST-05)
│               ├── passport.ts + .spec.ts           (CUST-06)
│               ├── plate.ts + .spec.ts              (VEH-02)
│               ├── chassis.ts + .spec.ts            (VEH-02)
│               └── engine.ts + .spec.ts             (VEH-02)
├── apps/
│   ├── api/                     # NestJS shell only (valid TS project; references shared)
│   └── web/                     # Next.js shell only (valid TS project; references shared)
```
[CITED: .planning/research/ARCHITECTURE.md — pure logic in packages/shared; this layout adapts it for the Phase-1 (pure) subset]

### Pattern 1: pnpm workspace + TypeScript project references

**What:** `pnpm-workspace.yaml` lists package globs; each package is `composite: true` and declares `references`; a root solution `tsconfig.json` references all packages so `tsc -b` builds in dependency order.

**When to use:** Always for this monorepo (locked decision).

**Example:**
```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```
```jsonc
// tsconfig.base.json  (strict; the load-bearing PLAT-01 gate)
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2023",
    "declaration": true,
    "composite": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```
```jsonc
// tsconfig.json  (root solution file — build orchestration only)
{
  "files": [],
  "references": [
    { "path": "packages/shared" },
    { "path": "apps/api" },
    { "path": "apps/web" }
  ]
}
```
```jsonc
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```
```jsonc
// apps/api/tsconfig.json  (consumes shared via project reference)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../../packages/shared" }],
  "include": ["src"]
}
```
`packages/shared/package.json` should set `"name": "@super-care/shared"`, `"main"/"types"` (or `exports`) to the build output, and apps depend on it via `"@super-care/shared": "workspace:*"`. [CITED: typescriptlang.org/docs/handbook/project-references.html; pnpm.io/workspaces]
Confidence: HIGH (standard, widely-used pattern; exact `exports` map is Claude's discretion).

### Pattern 2: Pure function + colocated spec (TDD unit)

**What:** Every money/legal function is a pure export in its own file with a sibling `*.spec.ts`. No imports of Node I/O, Nest, Prisma, or any LLM. This is the §A3 TDD-mandatory shape.

**When to use:** All five core areas (validators, fx, premium, commission, order machine).

```typescript
// fx/fx.math.ts  (pure — no I/O)
import Big from "big.js";
export function quoteLak(premiumThb: Big, sourceRatePerThb: Big): Big {
  const adjustedRate = sourceRatePerThb.plus(MARKUP_KIPS_PER_RATE_UNIT); // +15 kips/unit
  return premiumThb.times(adjustedRate).round(0, Big.roundUp);           // ceil to whole kip
}
```
Confidence: HIGH (matches §A3 + verified big.js API).

### Pattern 3: Root scripts drive every package (no Turbo/Nx)

```jsonc
// package.json (root)
{
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --noEmit || tsc -b",   // tsc -b emits .d.ts for refs; see note
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:write": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```
> Note: with project references, `tsc -b` is the typecheck/build command (it respects `references` order). `--noEmit` and `-b` interact awkwardly across TS versions — plan should pick one: either `tsc -b` (emits declarations needed by references) or per-package `tsc --noEmit`. Recommend `tsc -b` as the canonical typecheck for project-reference monorepos. Confidence: HIGH (pattern), MEDIUM on the exact flag combo for `typescript@6` — **verify at implementation time** (flagged in Assumptions).

### Anti-Patterns to Avoid
- **`any` anywhere in committed code** — banned by PLAT-01; enforce via `@typescript-eslint/no-explicit-any: "error"` in the flat config.
- **Money as `number`/float** — never; use `Big` end to end (Pitfall 1).
- **FX markup added to the THB amount or the LAK total** — markup is on the **per-THB rate** only (Pitfall 2).
- **`Math.round`/`Math.floor` for the FX result** — must be `ceil` via `Big.roundUp` (Pitfall 2).
- **Identifier validation via regex tied to one country / Latin-only plates** — over-rejects Thai-script and foreign documents (Pitfall 7).
- **Any identifier passing through an LLM** — forbidden; validators are pure (Pitfall 5).
- **Forcing a DB/UI into Phase 1** to satisfy a generic "walking skeleton" — explicitly overridden by CONTEXT.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decimal money arithmetic + rounding | Custom integer-scaling math | **big.js** (`Big.roundUp`) | Subtle rounding/precision bugs = real-money exposure |
| State transition legality + typed events | Loose enum + scattered `if` | **xstate** headless `transition()` | Illegal-states-unrepresentable, one tested source of truth |
| Schema/boundary validation | Hand-written type guards | **zod** | One schema → runtime check + inferred TS type, reused api+web |
| TS test transform | ts-jest/babel pipeline | **vitest** | Native ESM/TS, zero transform config |
| Build ordering across packages | Custom build scripts | **TS project references** (`tsc -b`) + pnpm | Correct dependency-ordered builds for free |
| `any` enforcement | Code-review vigilance alone | **typescript-eslint `no-explicit-any`** | Mechanical, CI-enforced |

**Key insight:** Phase 1's entire value is *correctness of small pure functions*. Every line of hand-rolled money/state/validation logic is a place a wrong value becomes legal/financial exposure — lean on the proven libraries and spend the effort on the **test vector tables** instead.

## Common Pitfalls

### Pitfall 1: Money computed as floating point
**What goes wrong:** `number` arithmetic drifts (`0.1+0.2≠0.3`); off-by-one-kip across thousands of orders fails reconciliation.
**Why it happens:** `number` is the path of least resistance; LLM-generated code defaults to it.
**How to avoid:** `Big` end to end in `packages/shared`; a `Money` value object; a TDD case that would lose precision as `number` but is exact as `Big`.
**Warning signs:** `parseFloat`/`.toFixed()` on currency; totals ending in `.0000001`.
[CITED: .planning/research/PITFALLS.md #1]

### Pitfall 2: FX markup in the wrong place / wrong rounding
**What goes wrong:** +15 kips added to the THB amount or to the LAK total instead of to the **per-THB rate**; `round`/`floor` used where `ceil` is required; markup applied on the THB-collection path where no conversion happens.
**How to avoid:** Encode the rule as `lak = ceil(premiumThb × (sourceRate + 15kips/unit))`, with `Big.roundUp`. The FX function is the ONLY place this math lives. A direction-rule test proves the TH-collection path returns the THB amount unchanged (no conversion, no markup). A dedicated round-up test uses a value that would round *down* under `Big.roundHalfUp`.
**Warning signs:** markup outside the fx function; `Math.round`; no TH-no-conversion test.
[CITED: PITFALLS.md #2; big.js API VERIFIED by execution]

### Pitfall 3: Thai-ID checksum mis-implemented
**What goes wrong:** Using `sum mod 11` directly as the check digit (skipping `11 − x`), or forgetting the final `mod 10` (breaks when `11 − (sum mod 11)` is 10 or 11). Also not rejecting non-13-length / non-numeric input first.
**How to avoid:** `check = (11 − (sum mod 11)) mod 10`; vector table with a **check-digit-0** case and invalid-shape rejects. (Algorithm + verified vectors below.)
**Warning signs:** no test where `(11 − (sum%11)) ≥ 10`; validator accepts 12/14-digit strings.
[CITED: PITFALLS.md #6; vectors VERIFIED by local computation]

### Pitfall 4: Over-/under-strict identifier validators
**What goes wrong:** Latin-only plate regex rejects Thai-script plates; a hard 17-char VIN rejects regional/older vehicles; passport regex tied to one country rejects foreign passports.
**How to avoid:** Explicit charset + length *ranges* per identifier, documented; validators are format/charset checks (reject the impossible), not authoritative existence checks; TDD with Thai-script plate, Lao plate, and foreign-passport shapes.
[CITED: PITFALLS.md #7]

### Pitfall 5: Forcing scope creep into Phase 1
**What goes wrong:** Adding a DB/HTTP/UI/adapter "to make the skeleton real," contradicting the locked boundary.
**How to avoid:** Phase 1 success = monorepo builds + CI green + pure-core suites pass. App shells stay empty of logic.
[CITED: CONTEXT.md walking-skeleton interpretation]

### Pitfall 6: `tsc -b` vs `--noEmit` confusion in a project-reference repo
**What goes wrong:** Typecheck script fails or silently skips packages because `-b` (build mode, needed for references) and `--noEmit` don't compose the same way per-version.
**How to avoid:** Use `tsc -b` as the canonical typecheck for the workspace; let it emit `.d.ts` into `outDir` (gitignored). Verify the exact invocation against `typescript@6` at implementation time.
[ASSUMED — flagged below]

## Code Examples

### Verified big.js rounding (FX ceil)
```typescript
// Source: big.js docs + VERIFIED by execution 2026-06-06
import Big from "big.js";
// Rounding-mode constants (numeric values verified):
// Big.roundDown=0, Big.roundHalfUp=1, Big.roundHalfEven=2, Big.roundUp=3
// Big.roundUp rounds AWAY FROM ZERO -> equals ceil for positive money amounts.

new Big("250.0001").round(0, Big.roundUp).toString();        // "251"  (ceil)
new Big("1000").times("250.15").round(0, Big.roundUp);       // 250150 (exact)
new Big(7).div(3).round(2, Big.roundUp).toString();          // "2.34" (round up at 2dp)
```

### FX math — direction rule + markup + ceil (pure)
```typescript
// packages/shared/src/fx/fx.math.ts  (pure)
import Big from "big.js";

export const MARKUP_KIPS_PER_RATE_UNIT = new Big("15"); // 15 kips per rate unit  [ASSUMED unit: see note]

export interface FxQuoteResult {
  market: "TH" | "LA";
  premiumThb: Big;
  sourceRatePerThb: Big | null; // null on the THB-collection path
  adjustedRatePerThb: Big | null;
  collected: { amount: Big; currency: "THB" | "LAK" };
}

export function quote(
  market: "TH" | "LA",
  premiumThb: Big,
  sourceRatePerThb: Big | null,
): FxQuoteResult {
  // Direction rule (FX-03): TH market collects in THB — NO conversion, NO markup.
  if (market === "TH") {
    return { market, premiumThb, sourceRatePerThb: null, adjustedRatePerThb: null,
             collected: { amount: premiumThb, currency: "THB" } };
  }
  // LA market (FX-02): THB -> LAK at sourceRate + 15 kips per rate unit, then ceil.
  if (sourceRatePerThb === null) throw new Error("LA market requires a source rate");
  const adjusted = sourceRatePerThb.plus(MARKUP_KIPS_PER_RATE_UNIT);
  const lak = premiumThb.times(adjusted).round(0, Big.roundUp); // whole kip, round up
  return { market, premiumThb, sourceRatePerThb, adjustedRatePerThb: adjusted,
           collected: { amount: lak, currency: "LAK" } };
}
```
> **Unit note (ASSUMED — flag for planner/user):** "+15 kips **per rate unit**" most plausibly means the per-THB source rate is *quoted in kip* (LAK has no decimal subunit in practice), so adding 15 means `+15 LAK` to the LAK-per-THB rate. If the source rate is instead quoted in whole LAK and "kips" is a decimal subunit, the addend changes. The math shape is identical; only the magnitude of the addend depends on this. **Confirm the rate's quoted unit before locking the constant.**

### Thai National ID validator (pure)
```typescript
// packages/shared/src/validators/thai-national-id.ts  (pure, no LLM)
// check = (11 - (sum of digit[i]*(13-i) for i=0..11) mod 11) mod 10  ; digit[12] must equal check
export function isValidThaiNationalId(raw: string): boolean {
  if (!/^\d{13}$/.test(raw)) return false;          // exactly 13 numeric digits
  const d = raw.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (13 - i); // weights 13,12,...,2
  const check = (11 - (sum % 11)) % 10;
  return d[12] === check;
}
```

### XState v5 Order machine — headless pure transition
```typescript
// packages/shared/src/order/order.machine.ts  (headless — no actor)
// Source: XState v5 docs — pure transition(machine, state, event)  [CITED: stately.ai/docs/transitions]
import { createMachine } from "xstate";
export const orderMachine = createMachine({
  id: "order",
  initial: "DRAFT",
  states: {
    DRAFT:               { on: { OCR_SUCCEEDED: "DRAFT", OCR_FAILED: "OCR_FAILED",
                                 QUOTE_LOCKED: "QUOTED", CANCEL: "CANCELLED" } },
    OCR_FAILED:          { on: { RETRY_OCR: "DRAFT" } },
    QUOTED:              { on: { REQUOTE: "QUOTED", INVOICE_ISSUED: "AWAITING_PAYMENT",
                                 CANCEL: "CANCELLED" } },
    AWAITING_PAYMENT:    { on: { PAYMENT_CAPTURED: "PAID", PAYMENT_FAILED: "PAYMENT_FAILED",
                                 CANCEL: "CANCELLED" } },
    PAYMENT_FAILED:      { on: { RETRY_PAYMENT: "AWAITING_PAYMENT", CANCEL: "CANCELLED" } },
    PAID:                { on: { CERT_ISSUANCE_STARTED: "ISSUING_CERTIFICATE",
                                 INITIATE_REFUND: "REFUNDING" } },
    ISSUING_CERTIFICATE: { on: { CERT_ISSUED: "COMPLETED", CERT_FAILED: "CERT_FAILED" } },
    CERT_FAILED:         { on: { RETRY_ISSUANCE: "ISSUING_CERTIFICATE",
                                 INITIATE_REFUND: "REFUNDING" } },
    REFUNDING:           { on: { REFUND_COMPLETED: "REFUNDED" } },
    COMPLETED:           { type: "final" },
    REFUNDED:            { type: "final" },
    CANCELLED:           { type: "final" },
  },
});

// Pure wrapper that THROWS on illegal transitions (ORD-02 requirement):
import { transition } from "xstate";
export function next(stateValue: string, eventType: string): string {
  const [snapshot] = transition(orderMachine,
    orderMachine.resolveState({ value: stateValue }), { type: eventType });
  if (snapshot.value === stateValue && !orderMachine.states[stateValue]?.config?.on?.[eventType]) {
    throw new Error(`IllegalTransition: ${eventType} from ${stateValue}`);
  }
  return snapshot.value as string;
}
```
> XState v5's `transition()` returns the *same* state for an unhandled event rather than throwing, so the ORD-02 "illegal transitions throw" requirement needs the explicit guard shown (or a hand-checked transition table). **The planner should decide** between (a) a thin XState wrapper that detects no-op transitions and throws, or (b) a plain `TRANSITIONS` table object with a throwing `next()` — both satisfy ORD-02 and are pure/testable. The plain-table approach is simpler to make "throw on illegal" and is the ARCHITECTURE.md `next(state,event)→state|throw` pattern. Confidence: HIGH on the table; MEDIUM on the exact XState no-op detection shape — **verify against xstate@5.32.0 at implementation**. [CITED: stately.ai/docs/transitions; ARCHITECTURE.md Pattern 2]

## FX Math (FX-02 / FX-03) — Test Vector Table

| # | market | premiumThb | sourceRate (LAK/THB) | adjusted | expected collected | rule |
|---|--------|-----------|----------------------|----------|--------------------|------|
| FX-a | LA | 1000 | 250 | 265 | **265000 LAK** | rate +15, ×premium, exact |
| FX-b | LA | 1000 | 250.0001 | 265.0001 | **265000.1 → ceil 265001 LAK** | round UP, not round/floor |
| FX-c | LA | 333 | 250 | 265 | 88245 LAK | exact, no rounding needed |
| FX-d | LA | 1 | 250.5 | 265.5 | **265.5 → ceil 266 LAK** | sub-unit forces ceil to whole kip |
| TH-a | TH | 1000 | (n/a) | (n/a) | **1000 THB** | DIRECTION RULE: no conversion, no markup |
| TH-b | TH | 1499.50 | (ignored) | (ignored) | **1499.50 THB** | THB path preserves satang; markup never applied |
| drift | LA | 0.1+0.2 base | 10 | 25 | exact (no float drift) | `Big` proves `0.3×25=7.5`, not 7.4999… |

> All "expected" values assume the rate-unit interpretation in the unit note. The **shape** (rate+15, ×, ceil; TH passthrough) is locked; magnitudes follow from the confirmed unit.

## Thai National ID Checksum (CUST-05)

**Algorithm:** digits `d[0..12]`. `sum = Σ d[i]·(13−i)` for `i = 0..11` (weights 13,12,…,2). `check = (11 − (sum mod 11)) mod 10`. Valid iff input is exactly 13 numeric digits **and** `d[12] === check`.

**Worked example (VERIFIED by local computation):**
For first-12 = `110200000000`: sum = 1·13 + 1·12 + 0·11 + 2·10 + 0·… = 13+12+20 = 45; `45 mod 11 = 1`; `11−1 = 10`; `10 mod 10 = 0` → check digit **0**. Full valid ID = `1102000000000`. This is exactly the case that breaks implementations missing the final `mod 10`.

**Test vector table (all VALID cases computed and verified locally 2026-06-06):**

| # | Input | Expected | Why it's in the table |
|---|-------|----------|------------------------|
| V1 | `1102000000000` | **valid** | check digit = 0 (final `mod 10` matters) |
| V2 | `1000000000050` | **valid** | second check-digit-0 vector |
| V3 | `1000000000190` | **valid** | check-digit-0 |
| V4 | `1101700230724` | **valid** | normal non-zero check digit (=4) |
| V5 | `3210200300001` | **valid** | leading digit 3; check = 1 |
| V6 | `1555000000009` | **valid** | check digit = 9 (high end) |
| I1 | `110200000000` (12 digits) | **invalid** | wrong length (too short) |
| I2 | `11020000000000` (14 digits) | **invalid** | wrong length (too long) |
| I3 | `11020000000O0` | **invalid** | non-numeric (letter O) |
| I4 | `1102000000001` | **invalid** | wrong check digit (correct is 0) |
| I5 | `` (empty) | **invalid** | empty string |
| I6 | `1101700230705` | **invalid** | plausible-looking but wrong check (correct is 8, not 5) — verified |

> Note on I6: `1101700230705` appears in some online gists as "valid" but its computed check digit is 8, not 5 — it is a useful *invalid* vector that catches naïve implementations that don't recompute. [VERIFIED by local computation]

## Passport / Plate / Chassis / Engine Validators (CUST-06 / VEH-02)

> These are **format/charset** validators (reject the impossible), NOT authoritative existence checks. Pair with human verification (Phase 3) for legal fields. Rules below are pragmatic and deliberately permissive to avoid over-rejecting foreign/Thai-script inputs (Pitfall 4). Exact regexes are Claude's discretion; ranges below are the recommended baseline. [CITED: PITFALLS.md #7]

### Passport (CUST-06)
**Rule:** uppercase A–Z and digits, length 6–9 (ICAO travel-document number is up to 9 alphanumerics), no spaces; reject lowercase-only or symbols. Do NOT tie to one country.

| # | Input | Expected | Reason |
|---|-------|----------|--------|
| P1 | `AA1234567` | valid | Thai passport shape (2 letters + 7 digits) |
| P2 | `P1234567` | valid | Lao passport shape |
| P3 | `123456789` | valid | all-digit foreign passport |
| P4 | `E12345678` | valid | 9-char alphanumeric |
| P5 | `ab123` | invalid | too short / lowercase |
| P6 | `AB 123456` | invalid | embedded space |
| P7 | `AB-123456` | invalid | symbol |
| P8 | `` | invalid | empty |

### Plate (VEH-02) — must accept Thai-script
**Rule:** allow Thai script (`฀-๿`), Latin A–Z, digits, spaces and hyphens; length 2–20; reject empty/symbol-only. A `[A-Z0-9]`-only regex is wrong.

| # | Input | Expected | Reason |
|---|-------|----------|--------|
| PL1 | `กข 1234` | valid | Thai-script plate (province letters) |
| PL2 | `1กก 5678` | valid | Thai plate with leading digit |
| PL3 | `ກຂ 0123` | valid | Lao-script plate |
| PL4 | `ABC-123` | valid | Latin plate |
| PL5 | `` | invalid | empty |
| PL6 | `@@@` | invalid | symbols only |

### Chassis / VIN (VEH-02)
**Rule:** alphanumeric excluding I/O/Q (VIN convention), length 6–17 (allow shorter for regional/older vehicles — do NOT hard-require 17), uppercase. Reject I/O/Q to catch O↔0 confusion.

| # | Input | Expected | Reason |
|---|-------|----------|--------|
| C1 | `1HGCM82633A004352` | valid | standard 17-char VIN |
| C2 | `MR053EE00X1234567` | valid | 17-char regional VIN |
| C3 | `ABC123456` | valid | shorter regional chassis |
| C4 | `1HGCM82633A0O4352` | invalid | contains letter O (VIN-forbidden) |
| C5 | `12345` | invalid | too short (<6) |
| C6 | `abc123` | invalid | lowercase |

### Engine number (VEH-02)
**Rule:** alphanumeric (allow hyphen), length 4–20, uppercase; engine numbers are less standardized than VIN, so keep permissive.

| # | Input | Expected | Reason |
|---|-------|----------|--------|
| E1 | `4G15-1234567` | valid | maker-prefixed engine no. |
| E2 | `K20A1234567` | valid | alphanumeric |
| E3 | `12` | invalid | too short |
| E4 | `K20A 1234` | invalid | embedded space |

> Length ranges and the exact charset are **[ASSUMED]** pragmatic baselines (no authoritative single spec for Lao/Thai plates and regional engine numbers exists). Flagged for confirmation — but they satisfy the success-criterion of accepting Thai-script plate, Lao plate, and foreign passport while rejecting impossible input.

## Premium Lookup (FX-01)

**Shape:** a static table keyed by the pricing dimensions, returning a `Big` THB amount. No underwriting/risk engine. Recommended minimal shape (planner may extend keys to match the insurer's CMI product matrix):

```typescript
// packages/shared/src/premium/premium.ts  (pure)
import Big from "big.js";
export type CoverageClass = "CMI" | "VOLUNTARY"; // extend per product
interface PremiumRow { coverage: CoverageClass; vehicleType: string; premiumThb: string; }
const PREMIUM_TABLE: readonly PremiumRow[] = [
  { coverage: "CMI", vehicleType: "sedan",      premiumThb: "645.21" },
  { coverage: "CMI", vehicleType: "pickup",     premiumThb: "967.28" },
  { coverage: "CMI", vehicleType: "motorcycle", premiumThb: "323.14" },
];
export function lookupPremiumThb(coverage: CoverageClass, vehicleType: string): Big {
  const row = PREMIUM_TABLE.find(r => r.coverage === coverage && r.vehicleType === vehicleType);
  if (!row) throw new Error(`No premium for ${coverage}/${vehicleType}`);
  return new Big(row.premiumThb);
}
```
> The specific premium amounts and key dimensions are **[ASSUMED]** placeholders — they come from the insurer's rate card (not yet supplied). The *table-driven lookup shape* is what Phase 1 locks; the data is filled when the rate card is available. Tests should cover: every row resolves; an unknown key throws; the returned value is a `Big`, not a `number`.

## Commission Tier Ladder (COMM-01 / COMM-02)

**Shape:** ordered tiers by volume threshold; each tier carries a percentage and/or a flat per-order amount; commission computed on the **THB base** (the Premium in THB, per PITFALLS #13 — base must be explicit and is THB). Decide and document **marginal vs whole-volume** application (recommend whole-volume: the partner's current volume tier sets the rate for the order — simplest and matches "tier ladder" intent; flag for confirmation).

```typescript
// packages/shared/src/commission/commission.ts  (pure)
import Big from "big.js";
interface Tier { minVolume: number; percent: string | null; flatThb: string | null; }
const LADDER: readonly Tier[] = [
  { minVolume: 0,   percent: "5",  flatThb: null },   // tier 0: 5%
  { minVolume: 10,  percent: "7",  flatThb: null },   // tier 1: 7% at >=10 orders
  { minVolume: 50,  percent: "10", flatThb: "50" },   // tier 2: 10% + 50 THB flat at >=50
];
export function computeCommissionThb(partnerVolume: number, premiumThb: Big): Big {
  const tier = [...LADDER].reverse().find(t => partnerVolume >= t.minVolume)!;
  let c = new Big(0);
  if (tier.percent) c = c.plus(premiumThb.times(tier.percent).div(100));
  if (tier.flatThb) c = c.plus(tier.flatThb);
  return c.round(2, Big.roundHalfUp); // THB satang; rounding mode is a documented decision
}
```

**Boundary test vector table (both sides of every threshold — COMM-02):**

| # | partnerVolume | premiumThb | tier | expected commission (THB) |
|---|---------------|-----------|------|---------------------------|
| T0a | 0 | 1000 | tier0 5% | 50.00 |
| T0b | 9 | 1000 | tier0 5% | 50.00 (just below threshold 10) |
| T1a | 10 | 1000 | tier1 7% | 70.00 (exactly at threshold 10) |
| T1b | 49 | 1000 | tier1 7% | 70.00 (just below threshold 50) |
| T2a | 50 | 1000 | tier2 10%+50 | 150.00 (exactly at threshold 50) |
| T2b | 51 | 1000 | tier2 10%+50 | 150.00 (just above) |
| Tround | 10 | 333.33 | tier1 7% | 23.33 (7%×333.33=23.3331 → 23.33) |

> Tier thresholds, percentages, flat amounts, and marginal-vs-whole-volume are **[ASSUMED]** placeholders pending the partner-commission policy. The *boundary-testing discipline* (test exactly-at, just-below, just-above each threshold) is the locked deliverable.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getNextSnapshot()` for headless XState | `transition(machine, state, event)` pure fn | XState v5.19.0 | Use `transition()`; `getNextSnapshot` deprecated [CITED: stately.ai/docs/transitions] |
| ESLint `.eslintrc` + `@typescript-eslint/*` separate plugins | ESLint **flat config** (`eslint.config.mjs`) + unified **`typescript-eslint`** package | ESLint 9+, typescript-eslint 8 | Single import, `tseslint.config()` helper; older `.eslintrc` examples are stale |
| Jest + ts-jest | Vitest | ongoing | Native TS/ESM, no transform config |

**Deprecated/outdated:**
- `getNextSnapshot` / `getInitialSnapshot` (XState) → `transition` / `initialTransition`.
- `.eslintrc.*` legacy config → flat config (ESLint 10 defaults to flat config).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "+15 kips per rate unit" = add 15 to the LAK-per-THB source rate | FX Math / Code Examples | FX magnitude wrong (shape is correct); confirm the source rate's quoted unit |
| A2 | Premium amounts/keys are placeholders | Premium Lookup | Real rate card differs; only the table data changes, not the lookup shape |
| A3 | Commission tiers/percentages/flats and whole-volume application are placeholders | Commission | Real policy differs; boundary-test discipline still applies |
| A4 | Passport 6–9 / plate 2–20 / chassis 6–17 / engine 4–20 length ranges | Validators | May over/under-reject edge real documents; ranges chosen to satisfy stated success criteria |
| A5 | `tsc -b` is the canonical typecheck for the project-reference repo | Patterns / Validation | If `typescript@6` flag behavior differs, typecheck script needs adjustment |
| A6 | XState `transition()` returns same-state (no throw) on unhandled events, so an explicit throw guard (or plain table) is needed for ORD-02 | XState Order Machine | If wrong, the throw guard is simpler than expected; plain-table fallback always works |
| A7 | NestJS/Next.js shells need only minimal deps to typecheck in Phase 1 | Standard Stack | If a shell needs more to compile, add the minimum; do not pull full runtime stacks |

## Open Questions

1. **FX rate unit (kips vs whole LAK).**
   - What we know: rule is "+15 kips per rate unit, ceil"; LAK has no decimal subunit in practice.
   - What's unclear: whether the source rate is quoted in kip (so +15 = +15 LAK) or some sub-unit.
   - Recommendation: confirm with the rate-feed spec before locking `MARKUP_KIPS_PER_RATE_UNIT`; the function shape and tests are otherwise ready.

2. **Premium rate card + commission policy.**
   - What we know: Premium is a THB table lookup; commission is a THB-base tier ladder.
   - What's unclear: actual amounts, key dimensions, tier thresholds, marginal-vs-whole-volume.
   - Recommendation: build the shapes + tests now with placeholder data; swap real numbers when supplied (Phase 1 can complete with placeholders since the *math/shape* is what's gated).

3. **ORD-02 "throws" implementation: XState wrapper vs plain table.**
   - Recommendation: planner picks; plain `TRANSITIONS` table with throwing `next()` is the lowest-risk way to satisfy "illegal transitions throw" while keeping the function pure. XState is still used for the canonical machine definition/visualization.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | All build/test | ✓ | v22.14.0 | — |
| pnpm | Workspace mgmt | ✓ | 10.33.2 | — |
| git | CI / commits | ✓ | 2.49.0 | — |
| GitHub Actions runner | CI gate (PLAT-04) | n/a (cloud) | ubuntu-latest | Any CI that runs pnpm install + scripts |
| npm registry access | install + version verify | ✓ | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all Phase-1 tooling is present locally.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.8` (+ `@vitest/coverage-v8@4.1.8`) |
| Config file | `vitest.config.ts` (or `vitest.workspace.ts`) — none exists yet → Wave 0 |
| Quick run command | `pnpm vitest run packages/shared/src/<area>` (single file/area) |
| Full suite command | `pnpm test` → `vitest run` (all packages) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | Monorepo typechecks strict; `any` banned | build/lint | `pnpm typecheck && pnpm lint` | ❌ Wave 0 |
| PLAT-02 | Zod domain schemas parse/reject sample shapes | unit | `vitest run packages/shared/src/schemas` | ❌ Wave 0 |
| PLAT-03 | Money is `Big`, never `number` (precision case) | unit | `vitest run packages/shared/src/money` | ❌ Wave 0 |
| PLAT-04 | CI runs typecheck+lint+test, red on failure | CI | GitHub Actions `ci.yml` | ❌ Wave 0 |
| CUST-05 | Thai-ID checksum vector table (incl. check-digit-0, invalid shapes) | unit | `vitest run packages/shared/src/validators/thai-national-id.spec.ts` | ❌ Wave 0 |
| CUST-06 | Passport format vectors | unit | `vitest run packages/shared/src/validators/passport.spec.ts` | ❌ Wave 0 |
| VEH-02 | Plate (Thai/Lao script) / chassis / engine vectors | unit | `vitest run packages/shared/src/validators` | ❌ Wave 0 |
| FX-01 | Premium lookup resolves rows; unknown throws; returns Big | unit | `vitest run packages/shared/src/premium` | ❌ Wave 0 |
| FX-02 | THB→LAK = (rate+15)×premium, ceil; no-float-drift | unit | `vitest run packages/shared/src/fx` | ❌ Wave 0 |
| FX-03 | TH-collection path: no conversion, no markup | unit | `vitest run packages/shared/src/fx` | ❌ Wave 0 |
| ORD-02 | Legal transitions pass; illegal throw; refund path reachable | unit | `vitest run packages/shared/src/order` | ❌ Wave 0 |
| COMM-01 | Tier ladder computes on THB base | unit | `vitest run packages/shared/src/commission` | ❌ Wave 0 |
| COMM-02 | Both sides of every threshold | unit | `vitest run packages/shared/src/commission` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run <the area's spec>` (sub-second per pure module).
- **Per wave merge:** `pnpm typecheck && pnpm lint && pnpm test`.
- **Phase gate:** full suite green + CI green before `/gsd:verify-work`. Exit gate = FX table green (direction + ceil + no-conversion), Thai-ID vectors green, illegal-transition-throws + refund-path green, commission boundary green.

### Wave 0 Gaps
- [ ] `vitest.config.ts` (or workspace) — covers all `packages/shared` specs
- [ ] `tsconfig.base.json` + per-package `tsconfig.json` + root solution `tsconfig.json`
- [ ] `eslint.config.mjs` (flat config; `@typescript-eslint/no-explicit-any: error`) + `.prettierrc`
- [ ] `pnpm-workspace.yaml` + root `package.json` scripts
- [ ] `.github/workflows/ci.yml`
- [ ] Every `*.spec.ts` listed above (red-first per TDD)
- [ ] Framework install: `pnpm add -D -w vitest@4.1.8 @vitest/coverage-v8@4.1.8`

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config — section included. Note: Phase 1 has **no I/O, no PII, no secrets handling, no network** — most ASVS categories do not apply yet (they land in Phase 2: encryption/audit/secrets). Phase-1 security is limited to supply-chain hygiene and not leaking secrets into the repo/CI.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies (Phase 1) | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface in Phase 1 |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No endpoints |
| V5 Input Validation | partial | Pure validators + Zod schemas are *defined* here (the input-validation foundation); enforced at boundaries in later phases |
| V6 Cryptography | no | Encryption is Phase 2 (SEC-01) — do NOT hand-roll crypto here |
| V14 Configuration / Supply Chain | yes | Pin exact versions; no secrets in repo or `ci.yml`; lockfile committed; run package legitimacy gate on any new dep |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Slopsquatted / hallucinated dependency | Tampering | Verify on-registry + slopcheck before adding any new package; pin exact versions; commit `pnpm-lock.yaml` |
| Secret accidentally committed to repo/CI | Information Disclosure | No secrets in Phase 1 at all; CI uses no credentials; secret-scan lands in Phase 2 (SEC-02) |
| Identifier silently corrupted by an LLM | Tampering | Validators are pure; no LLM import path — structurally impossible (Pitfall 5) |
| Float money drift → financial error | Tampering | `Big` end-to-end; precision test in suite (Pitfall 1) |

## Sources

### Primary (HIGH confidence)
- npm registry `npm view <pkg> version` (big.js, xstate, vitest, zod, typescript, eslint, typescript-eslint, prettier, @vitest/coverage-v8) — 2026-06-06 — version verification
- Local execution of big.js — rounding constants (`Big.roundUp=3`) and ceil behavior verified
- Local execution — Thai-ID checksum worked examples + valid/invalid vectors computed
- `stately.ai/docs/transitions` — XState v5 pure `transition()` headless API (via WebFetch)
- typescriptlang.org Project References; pnpm.io/workspaces — monorepo pattern (CITED)
- In-repo: `docs/ENGINEERING-STANDARDS.md` (§A1–A5), `docs/GLOSSARY.md`, `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md` — authoritative

### Secondary (MEDIUM confidence)
- ESLint flat config + typescript-eslint 8 unified package pattern (training knowledge, consistent with current major versions verified on npm)

### Tertiary (LOW confidence)
- Specific premium amounts, commission tiers, validator length ranges, FX rate-unit interpretation — placeholders pending source data (see Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack & versions: HIGH — all verified on npm registry 2026-06-06
- Monorepo/CI architecture: HIGH — standard pnpm + project-references pattern; one flag on `tsc -b` flag combo
- big.js money math: HIGH — rounding API verified by execution
- Thai-ID checksum + vectors: HIGH — algorithm and all vectors computed and verified locally
- Other validators (passport/plate/chassis/engine): MEDIUM — pragmatic ranges, no single authoritative spec (flagged)
- XState headless: HIGH on the pure-table approach; MEDIUM on the exact XState no-op-detection shape (flagged)
- Premium/commission data: LOW (placeholders); shape HIGH

**Research date:** 2026-06-06
**Valid until:** ~2026-07-06 (stable tooling; re-verify versions if planning slips a month)
