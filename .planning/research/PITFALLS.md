# Pitfalls Research

**Domain:** Cross-border (Laos ↔ Thailand) vehicle insurance platform — money/FX, PII identifiers, payments, certificate issuance
**Researched:** 2026-06-06
**Confidence:** HIGH for money/FX, identifier, webhook, state-machine, security pitfalls (verified against engineering standards + algorithm/regulatory sources); MEDIUM for compliance/data-residency specifics (legal advice needed, not engineering).

> This file is domain-specific. It does not repeat OWASP basics or generic "write tests."
> It targets the exact failure modes for THIS platform: THB→LAK FX, Thai National ID
> validation, idempotent payment webhooks, the Order state machine, OCR-to-money handoff,
> and external certificate issuance.

---

## Critical Pitfalls

### Pitfall 1: Money stored/computed as floating-point (THB and LAK)

**What goes wrong:**
Premiums, FX rates, kip markup, and totals are held as JS `number` (IEEE-754 float).
`0.1 + 0.2 !== 0.3`. With LAK amounts in the tens-of-thousands and "+15 kips, round up",
float drift produces off-by-one-kip results that fail to reconcile against the payment
provider and against the insurer's books. Insurance reconciliation is unforgiving — a
1-kip mismatch across thousands of orders is a real audit finding.

**Why it happens:**
TypeScript `number` is the path of least resistance; Prisma `Float`/`Decimal` mapping is
chosen carelessly; LLM-generated code defaults to `number` arithmetic.

**How to avoid:**
- Represent money as **integer minor units** (LAK has no widely-used subunit in practice —
  store whole kip as integer; THB store satang as integer) OR use a Decimal type end to
  end. Pick ONE and enforce it in `packages/shared`.
- Prisma column type `Decimal` (not `Float`/`Double`) for any persisted money; never `Float`.
- All FX math in the pure `FxModule` operates on integers/Decimal, never float.
- TDD table includes a case proving no float drift (e.g. a rate that would lose precision).

**Warning signs:**
`Float`/`Double` in the Prisma schema for money; `.toFixed()` used to "fix" amounts;
`parseFloat` on currency; totals that occasionally end in `.0000001`.

**Phase to address:** Phase 1 (FX quote engine + Invoice — TDD-mandatory path). Lock the
money representation in the shared package before any amount is persisted.

---

### Pitfall 2: FX markup applied in the wrong direction / wrong currency base

**What goes wrong:**
The rule is: **Premium standard = THB → convert to LAK at source rate +15 kips, round UP**,
and the direction depends on the collection currency. Common breakages:
- Adding 15 kips to the THB amount instead of to the per-THB **rate**, or adding to the
  final LAK total instead of the rate — three different (wrong) numbers.
- Applying the markup when collecting in THB (Opn/Omise) where no THB→LAK conversion
  happens at all — markup should only apply on the LAK-collection path.
- Inverting the rate (multiplying by LAK-per-THB vs THB-per-LAK).
- Markup making the rate *worse for the platform* because the sign/direction was flipped.

**Why it happens:**
"+15 kips" is ambiguous in prose (per-rate vs per-total); the direction rule is a branch
that's easy to get backwards; rate feeds sometimes quote the inverse pair.

**How to avoid:**
- Write the rule as an executable spec FIRST: a fixed table of `(market, collectionCurrency,
  baseThb, sourceRate) → expectedLak` cases, including a TH-collection case where **no
  conversion** occurs. This is the TDD red phase for `FxModule.quote`.
- Define precisely in code comments + glossary: markup is **+15 kips on the per-THB source
  rate**, then `lak = ceil(baseThb * adjustedRate)` (round UP = `ceil`, never `round`/`floor`).
- `FxModule.quote(market, baseAmount)` is the ONLY place this math lives (deep module).
- Round-up direction has its own dedicated test (a value that would round down with `round`).

**Warning signs:**
Markup added outside `FxModule`; `Math.round`/`Math.floor` where `ceil` is required;
no test asserting the TH-collection path skips conversion; rate variable named ambiguously.

**Phase to address:** Phase 1 (FX quote engine — TDD-mandatory). This is the single
highest-risk money path; gate the phase on the FX test table passing.

---

### Pitfall 3: Stale / unlocked FX quote applied at payment time

**What goes wrong:**
A quote is shown to the customer, then the actual charge uses a *re-fetched* rate at
capture time — customer pays a different LAK amount than quoted. Or the locked quote has no
expiry and is reused days later at an obsolete rate. Either way: money the customer didn't
agree to, and a reconciliation gap.

**Why it happens:**
Treating FX as a live lookup rather than a captured artifact; no TTL on the quote; the
Order references "current rate" instead of the `FxQuote` it was created with.

**How to avoid:**
- `FxQuote` is **locked + time-stamped** (already in glossary) — persist the exact rate,
  markup, computed LAK, and `quotedAt`/`expiresAt`. The Order/Invoice references the quote
  by id; payment charges the **stored** LAK from that quote, never a re-fetch.
- Enforce an explicit TTL; expired quote → must re-quote before payment (state machine
  guard), never silently re-rate.

**Warning signs:**
Payment code calls the rate feed; Invoice total computed at capture rather than read from
`FxQuote`; no `expiresAt`; quote reused across Orders.

**Phase to address:** Phase 1 (FxQuote + Order state machine + Invoice).

---

### Pitfall 4: Currency mismatch — charging the wrong provider/currency for a Market

**What goes wrong:**
LA market routed to Opn/Omise (THB) or TH market routed to Phapay (LAK); or the amount is
correct numerically but the currency code attached to the charge is wrong (charging "30000"
as THB instead of LAK). Off by ~1000x. This is a catastrophic, customer-visible error.

**Why it happens:**
One payment interface over two providers (Phapay LAK / Opn-Omise THB) with routing-by-Market
logic that's a single untested branch; currency carried as a loose string.

**How to avoid:**
- Routing is a pure, tested function: `Market → (provider, collectionCurrency)`.
- Money values carry their currency as a typed unit (branded type / `{ amount, currency }`),
  not a bare number; the payment adapter rejects a charge whose currency ≠ its expected one.
- Test: every Market routes to exactly one provider+currency; a mismatched currency throws.

**Warning signs:**
Bare numeric amounts passed to payment; currency hard-coded in the shared interface;
no assertion that provider currency matches the charge currency.

**Phase to address:** Phase 1 (PaymentModule interface + Market routing).

---

### Pitfall 5: Letting the LLM "clean" / parse / validate identifiers (FORBIDDEN)

**What goes wrong:**
Passport number, Thai National ID, plate, chassis, or engine number is passed through the
LLM/chatbot/OCR-cleanup step to "normalize" it. The model silently corrects an O→0, drops a
leading zero, transposes digits, or hallucinates a plausible-but-wrong value. The result is
a **legally wrong identifier on an insurance certificate** — uninsured in practice.

**Why it happens:**
It's tempting to reuse the LLM that's already in the OCR/chat pipeline to tidy noisy input;
the failure is invisible because the output *looks* clean and valid.

**How to avoid:**
- Hard architectural rule (already in standards): `OcrResult` is **raw, never cleaned**.
  Identifiers are validated ONLY by **pure functions** in `packages/shared`. The LLM never
  touches identifier validation — not in OCR post-processing, not in chat.
- Chatbot is explicitly barred from identifier validation (glossary/standards).
- Validators are exhaustively unit-tested incl. invalid inputs (TDD-mandatory).
- Code-review checklist item: "does any identifier flow through a model call?" → reject.

**Warning signs:**
Any prompt containing an identifier with "normalize/clean/fix/correct"; OCR adapter
returning post-processed identifiers; validator imports anything LLM-related.

**Phase to address:** Phase 1 (validators + OCR adapter contract). This is a load-bearing
invariant — bake it into the OCR adapter interface so it's structurally impossible.

---

### Pitfall 6: Thai National ID checksum implemented wrong

**What goes wrong:**
The 13-digit Thai ID checksum is mis-implemented and either rejects valid IDs or (worse)
accepts invalid ones. The algorithm: multiply the first 12 digits by weights 13,12,…,2; sum;
the check digit (13th) = **`(11 − (sum mod 11)) mod 10`**. The two classic bugs:
1. Using `sum mod 11` directly as the check digit (skipping the `11 − x` step).
2. Forgetting the final `mod 10`, which breaks when `11 − (sum mod 11)` is 10 or 11.
Also: not rejecting non-13-length / non-numeric input before checksumming.

**Why it happens:**
Copy-pasted snippets vary; the `(11 - r) % 10` nuance is subtle; happy-path tests pass
while edge cases (check digit derived from remainder 0 or 1) silently fail.

**How to avoid:**
- TDD with a vector table of **known-valid** and **known-invalid** IDs, explicitly including
  IDs whose correct check digit is 0 (i.e. where the `mod 10` matters), and length/charset
  rejection cases. Pure function, no I/O, no LLM.
- Encode the exact formula in a comment next to the code.

**Warning signs:**
No test where `(11 - (sum % 11))` ≥ 10; checksum returns the remainder directly; validator
accepts a 12- or 14-digit string.

**Phase to address:** Phase 1 (critical-field validators — TDD-mandatory).

---

### Pitfall 7: Over-strict / under-strict passport, plate, chassis, engine validators

**What goes wrong:**
- Passport: assuming a fixed national format. Lao and Thai (and other-nationality) passports
  differ; rejecting valid foreign passports blocks real customers, while accepting anything
  defeats the check. Mishandling the letter-O vs zero, embedded spaces.
- Plate: Thai plates include **Thai-script** characters and a province; Lao plates differ.
  A `[A-Z0-9]` regex rejects legitimate Thai plates.
- Chassis (VIN) vs engine number: VIN is 17 chars excluding I/O/Q for modern vehicles, but
  many regional/older vehicles don't conform — a strict 17-char VIN check rejects them.

**Why it happens:**
Validators written against one assumed format (often Western/Latin) without surveying the
actual document/plate populations in scope.

**How to avoid:**
- Define the accepted character sets and length ranges per identifier explicitly, including
  Thai script for plates and multi-nationality passports; document the source of each rule.
- Validators are **format/charset** validators (reject impossible input) — they are not
  authoritative existence checks. Pair with human verification for the money/legal fields.
- TDD with real-shaped examples (Thai-script plate, Lao plate, foreign passport).

**Warning signs:**
Latin-only regex for plates; hard 17-char VIN with no exception path; passport regex tied to
one country; no Thai-script test case.

**Phase to address:** Phase 1 (validators). Revisit charset coverage when new Markets open.

---

### Pitfall 8: Non-idempotent payment webhook handler (double-charge / double-issue)

**What goes wrong:**
Phapay/Opn-Omise deliver the same webhook **more than once** (at-least-once delivery is the
norm). A non-idempotent handler captures the Payment twice, issues two Certificates, or
pays Commission twice on one Order. In insurance/payments this is direct financial loss and
a compliance incident.

**Why it happens:**
Handler treats each delivery as a new event; no dedupe key; effects (capture, cert request,
commission) run before/without an idempotency guard.

**How to avoid:**
- Idempotency on the **provider event id** (or a unique constraint on
  `(provider, eventId)`): persist-first, then act; second delivery is a no-op that returns 200.
- Make the *effect* idempotent too: payment capture, certificate request, and commission
  accrual each guarded by Order-state checks (only transition once).
- TDD: deliver the same event twice → exactly one Payment, one Certificate, one Commission
  (already mandated by standards §A3).

**Warning signs:**
No unique constraint on event id; handler does `create` not `upsert`/guarded transition;
test suite lacks a "same event twice" case.

**Phase to address:** Phase 1 (webhook handlers — TDD-mandatory), even against stubbed
providers (the stub should be able to replay events).

---

### Pitfall 9: Out-of-order webhooks and the webhook-vs-redirect race

**What goes wrong:**
- Out of order: a `payment.failed` arrives after a later `payment.succeeded` (or a refund
  before the capture) and naively overwrites state, leaving an Order marked failed when it
  actually paid (or vice versa).
- Redirect race: the customer's browser redirect ("success" page) arrives before the
  authoritative webhook. Code that marks the Order paid on the redirect double-counts when
  the webhook later lands, or shows "paid" with no Payment record.

**Why it happens:**
Webhook order is not guaranteed; the synchronous redirect feels authoritative but isn't.

**How to avoid:**
- Treat the **webhook as the single source of truth** for money; the redirect only triggers
  a "we're confirming your payment" UI, never a state change.
- State machine ignores transitions that aren't legal from the current state (a stale
  `failed` after `paid` is rejected, not applied). Use event ordering/timestamps to discard
  older events.
- TDD includes out-of-order and redirect-before-webhook scenarios.

**Warning signs:**
Order marked paid in the redirect/return controller; state set by raw assignment instead of
guarded transition; no test for events arriving out of order.

**Phase to address:** Phase 1 (Order state machine + webhook handlers).

---

### Pitfall 10: Order state machine allows illegal transitions / drops failure states

**What goes wrong:**
- Illegal transitions: jumping to `certificate_issued` without a captured Payment; reviving
  a `refunded`/`cancelled` Order; paying Commission on a failed Order.
- Lost failure states: OCR-failed, payment-failed, and cert-gen-failed collapse into a
  generic "error" or are not modelled — so the system can't drive retries/refunds and Orders
  get stuck with money taken but no Certificate and no refund path.
- **No refund path**: payment captured, certificate issuance fails at the insurer, and there
  is no modelled transition to refund → customer charged for nothing.

**Why it happens:**
State modelled as a loose enum/string set arbitrarily; failure paths are an afterthought;
"refund" feels out of scope for an MVP but is a legal/financial necessity once money moves.

**How to avoid:**
- Explicit state machine where the **only** legal transitions are encoded; illegal
  transitions **throw** and are tested (standards §A3 mandates this, including failure
  states: OCR failed, payment failed, cert-gen failed, refund).
- Model the money-taken-but-no-certificate state and its **refund transition** from day one,
  even if the actual refund execution is stubbed in Phase 1.
- Commission accrual is a transition guarded on a terminal "successfully issued" state.

**Warning signs:**
Order status set by direct assignment; no failure states in the enum; no `refund` transition;
state machine accepts any → any; cert issuance not gated on captured Payment.

**Phase to address:** Phase 1 (Order state machine — TDD-mandatory). The refund path is the
most-skipped piece — make it a phase exit criterion.

---

### Pitfall 11: Trusting OCR output as clean for money/legal fields

**What goes wrong:**
OCR-extracted Premium-affecting or legal fields (ID number, name, plate, dates) are written
straight onto the Order/Certificate without human confirmation. OCR misreads (8↔B, 0↔O,
1↔7, dropped diacritics, wrong field routing) flow into a legal certificate.

**Why it happens:**
The "agent-assisted back office" makes it tempting to auto-fill from OCR to save keystrokes;
OCR confidence looks high; the raw-vs-clean rule (Pitfall 5) addresses LLM cleaning but not
the separate question of *human verification*.

**How to avoid:**
- `OcrResult` is **raw + advisory**: it pre-fills the agent screen but the agent must
  **confirm/correct** every money/legal field before the Order can advance (a state-machine
  guard: cannot leave the capture state without human-verified fields).
- Validators (Pitfalls 6–7) run on the human-confirmed value, not on raw OCR.
- Record who verified and when in `audit_logs`.

**Warning signs:**
Order advances directly from OCR with no human-confirm step; certificate fields sourced from
`OcrResult` without a `verifiedBy`; no audit entry for verification.

**Phase to address:** Phase 1 (OCR capture → human verification gate in the back-office flow).

---

### Pitfall 12: Certificate issuance (external insurer system) failure modes

**What goes wrong:**
Certificates are issued in an **external insurer system** via manual key-in + PDF upload now,
AI-agent auto-issue later. Failure modes:
- Issuance fails *after* payment captured → money taken, no cover (ties to Pitfall 10 refund).
- Duplicate issuance on retry (no idempotency on the insurer side → two policies, double cost).
- The uploaded PDF is accepted without verifying it actually matches the Order's
  identity/vehicle/Premium — a wrong or mismatched certificate is legally void cover.
- Later, an AI-agent auto-issuer acts on stored data and silently mis-keys a field into the
  insurer system with no human gate (re-introduces Pitfalls 5/11 at the issuance boundary).

**Why it happens:**
The insurer system is outside our control; the "manual upload" path feels low-risk; AI
auto-issue is assumed to be a drop-in later.

**How to avoid:**
- `CertificateModule` is a deep module with an adapter interface; issuance is a guarded Order
  transition that can **fail** and route to refund.
- Require a verification step that the issued Certificate's key fields (ID, plate, Premium,
  cover dates) match the Order before marking `certificate_issued`; store the mapping.
- Idempotency token per Order toward the insurer so a retry never double-issues.
- When the AI-agent issuer arrives, keep a human approval gate on the legal/money fields it
  submits (standards §B governance: AI never replaces human review of compliance logic).

**Warning signs:**
No failure→refund path from issuance; PDF accepted without field-match check; no
per-Order idempotency toward the insurer; AI auto-issue planned with no human gate.

**Phase to address:** Phase 1 (CertificateModule adapter contract + issuance-fail→refund
transition, with stub). Re-address when the AI-agent issuer adapter is built (later phase).

---

### Pitfall 13: Commission miscalculation (tier ladder)

**What goes wrong:**
- Tier **boundary** errors: at exactly the volume threshold, is the order in the lower or
  higher tier? Off-by-one at boundaries silently over/under-pays Partners.
- Whole-volume vs marginal application: applying the higher tier rate retroactively to ALL
  orders vs only orders above the threshold — large divergence.
- Commission computed on the LAK total incl. FX markup vs on the THB Premium — different base.
- Commission accrued before the Order reaches a terminal success state → paid on
  later-failed/refunded Orders.

**Why it happens:**
Tier ladders are deceptively simple; the base-amount question (THB vs LAK, pre/post markup)
is under-specified; accrual timing is coupled to the wrong event.

**How to avoid:**
- TDD table of `(partnerVolume, orderAmount) → commission` covering each tier and **both
  sides of every boundary** (standards §A3 mandates this).
- Define explicitly in glossary/spec: the commission **base currency/amount** and whether
  tiers are marginal or whole-volume.
- Accrual is a guarded transition off the terminal "successfully issued" state; refund
  reverses accrual.

**Warning signs:**
No test exactly at a threshold; ambiguous base amount; commission rows for refunded Orders;
tier logic outside `CommissionModule`.

**Phase to address:** Phase 1 if Partners are in the first slice; otherwise the phase that
introduces Partners — but with the same TDD rigor (it's a money path).

---

### Pitfall 14: PII unencrypted at rest, secrets in code, missing audit logs

**What goes wrong:**
Passport/National-ID numbers and document files stored in plaintext; provider/insurer API
keys committed to the repo or baked into the image; access to PII not recorded. Any of these
is a regulated-data breach (Thai PDPA + Lao Law 25/NA both govern this data).

**Why it happens:**
Encryption and audit logging are "cross-cutting" and easy to defer; secrets get hard-coded
during local dev and leak into commits; LLM-generated code often inlines example keys.

**How to avoid:**
- Standards already mandate: **no secrets in code (env-managed); PII encrypted at rest;
  access logged in `audit_logs`.** Implement these in Phase 1 as part of the data layer, not
  retrofitted.
- Encrypt identity numbers and document blobs at the field/storage level; restrict and log
  every read of PII (who, what, when) — needed for compliance, not just security.
- Secret-scanning in CI; `.env` never committed; the AI dev tooling (claude-mem etc.) is
  dev-only and must never ingest real PII (standards §B).

**Warning signs:**
ID numbers as plain columns; any API key literal in source; PII reads with no audit row;
`.env` in git history; an AI plugin configured with production data.

**Phase to address:** Phase 1 (data layer + audit logging baked in from the first migration).

---

### Pitfall 15: Cross-border data residency / KYC / certificate legal validity gaps

**What goes wrong:**
The platform moves Lao customers' passport/ID data to Thai insurer systems and stores it on
infrastructure that may be in a third country. **Thai PDPA** (Sections 28/29) restricts
cross-border transfer to adequate jurisdictions or requires safeguards (SCCs / consent);
**Lao Law 25/NA** requires consent and that transfer not contravene national interests. Get
this wrong and the data flow itself is unlawful — independent of any code bug. Separately, a
Certificate that isn't issued/recorded per insurer/regulator requirements may be **legally
invalid cover** even if the PDF looks fine.

**Why it happens:**
Engineering treats it as a storage choice; the legal basis for the THB→LAK cross-border flow
and for KYC retention isn't established; "the PDF exists" is mistaken for "valid cover."

**How to avoid:**
- Establish (with legal counsel — this is MEDIUM-confidence engineering territory) the lawful
  basis and mechanism for the Laos↔Thailand transfer: explicit customer **consent** captured
  and audit-logged, SCCs/safeguards as required, and a documented data-residency decision
  (where PII physically lives).
- Capture consent as a first-class, timestamped record tied to the Customer; gate document
  capture on it.
- Treat certificate legal validity as an insurer-defined contract: the field-match +
  acceptance check (Pitfall 12) is the engineering hook; the legal requirements are an input
  to confirm with the insurer before go-live.

**Warning signs:**
No recorded consent before capturing ID documents; data-residency location undecided; no
legal basis documented for the cross-border flow; "certificate = valid" assumed without
insurer/regulator confirmation.

**Phase to address:** Phase 1 (consent capture + audit + documented residency decision);
legal validity confirmation is a go-live gate (before real customers / real adapters).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Money as `number`/`Float` | Fast to write | Reconciliation drift, off-by-one-kip audit findings | **Never** for persisted money |
| FX math sprinkled outside `FxModule` | Inline convenience | Rule drift, untestable, wrong direction | **Never** |
| Mark Order paid on redirect | Snappy UX | Double-count vs webhook, ghost payments | **Never** |
| Auto-fill Order from raw OCR, no human confirm | Fewer keystrokes | Wrong identifiers on legal certificate | **Never** for money/legal fields |
| Skip refund/failure states ("happy path MVP") | Less modelling | Money taken, no cover, no recovery path | **Never** once real money moves |
| Stub externals behind adapters | Self-contained testable slice | Adapter contract must match real provider semantics (idempotency, delivery) | **Yes** in Phase 1 (intended) — make the stub replay/duplicate events |
| Commission base currency left implicit | Ship faster | Over/under-paying Partners | Never — specify base before coding |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Phapay (LAK) / Opn-Omise (THB) webhooks | Assuming exactly-once, in-order delivery | Idempotent on event id; webhook is source of truth; discard stale/out-of-order via state guards |
| Payment redirect/return URL | Treating it as authoritative | Confirmation UI only; never mutate money state |
| Google Vision OCR | Returning "cleaned" identifiers; high confidence ≠ correct | Raw `OcrResult`; pure validators + human verify money/legal fields |
| External insurer cert system | No idempotency → duplicate policy; no field-match check | Per-Order idempotency token; verify issued cert matches Order before `certificate_issued` |
| FX rate feed | Re-fetching at charge time; inverse pair confusion | Lock + timestamp `FxQuote`; charge stored amount; explicit pair direction |
| WhatsApp/LINE messaging | Leaking PII/identifiers into message templates/logs | Templated, minimal PII; chatbot never validates identifiers |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passport/National-ID stored plaintext | Regulated-data breach (PDPA / Law 25/NA) | Field/blob encryption at rest |
| Provider/insurer keys in code or image | Credential leak, financial fraud | Env-managed secrets; CI secret-scanning |
| No audit log on PII reads | Non-compliance; no breach forensics | `audit_logs` row per PII access (who/what/when) |
| Cross-border transfer with no consent/legal basis | Unlawful data flow | Timestamped consent record; documented residency + safeguards |
| AI dev plugin ingesting real PII | PII exfiltration via tooling | Plugins dev-only, local, never real customer data (standards §B) |
| Identifier passed through LLM | Silently corrupted legal identifier | Validators are pure; LLM barred from identifier handling |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous OCR call blocking the request | Slow capture, timeouts | OCR via adapter; async/queue when real provider lands | When real Vision latency replaces the stub |
| Webhook handler doing heavy work inline before ack | Provider retries → duplicate floods | Ack fast (persist event), process via guarded transition | Under real provider retry storms |
| Unindexed lookups on `(provider, eventId)` / Order status | Slow webhook dedupe | Unique index on event id; index hot status queries | Modest volume; cheap to add early |

> Scale is not the primary risk for this platform's first slices — correctness is. Do not
> over-engineer for hypothetical volume; do add the event-id unique index from day one.

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing one FX rate, charging another | Loss of trust; disputes | Show the locked `FxQuote`; charge that exact amount; surface expiry |
| "Payment successful" on redirect before webhook | Customer thinks paid when it failed (or vice versa) | "Confirming payment…" until webhook confirms |
| Silent OCR auto-fill with no review | Wrong details on legal certificate | Agent confirms/corrects every money/legal field |
| No clear failure/refund messaging | Customer charged, no cover, no explanation | Model failure states with customer-facing status + refund path |

## "Looks Done But Isn't" Checklist

- [ ] **FX quote:** Often missing — round-UP (`ceil`) test, TH-collection no-conversion case, locked-quote-charged-not-re-fetched. Verify the FX test table covers direction + rounding.
- [ ] **Thai ID validator:** Often missing — the `(11 − (sum mod 11)) mod 10` final step and a check-digit-0 case. Verify invalid-accepts are tested.
- [ ] **Payment webhook:** Often missing — same-event-twice = one effect; out-of-order; redirect-before-webhook. Verify all three have tests.
- [ ] **Order state machine:** Often missing — failure states (OCR/payment/cert-gen failed) and a **refund** transition. Verify illegal transitions throw.
- [ ] **Certificate issuance:** Often missing — issuance-fail→refund path; field-match check; per-Order idempotency. Verify money-taken-no-cover cannot dead-end.
- [ ] **OCR:** Often missing — human-verification gate on money/legal fields; `verifiedBy` in audit. Verify Order can't advance on raw OCR.
- [ ] **Commission:** Often missing — both-sides-of-boundary tests; defined base currency; reversal on refund. Verify no commission on failed Orders.
- [ ] **PII/security:** Often missing — encryption at rest, audit row per read, secret-scan in CI, consent record. Verify with a deliberate PII-read audit check.
- [ ] **Currency routing:** Often missing — currency carried as typed unit; adapter rejects wrong currency. Verify every Market routes to one provider+currency.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Money stored as float (Pitfall 1) | HIGH | Migrate columns to Decimal/int; re-derive/reconcile historical amounts; backfill |
| FX direction/rounding wrong (P2) | HIGH | Fix `FxModule`; recompute affected quotes/invoices; reconcile/refund deltas |
| Non-idempotent webhook double-charge (P8) | HIGH | Add dedupe; identify duplicate Payments/Certs/Commissions; refund/void; notify |
| Illegal transition / no refund path (P10) | MEDIUM | Add states + refund transition; sweep stuck money-taken-no-cover Orders; refund |
| OCR error on issued certificate (P11/12) | HIGH | Re-issue corrected certificate with insurer; legal/customer comms; audit |
| Cross-border consent/residency gap (P15) | HIGH | Halt non-compliant flow; obtain consent/safeguards retroactively where possible; legal review |
| Commission miscalc (P13) | MEDIUM | Recompute against corrected ladder; true-up Partner balances |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Float money | Phase 1 (data + FX) | No `Float` for money; precision test passes |
| 2 FX direction/markup | Phase 1 (FX engine) | FX test table green incl. TH no-conversion + ceil |
| 3 Stale/unlocked quote | Phase 1 (FxQuote/Order) | Payment charges stored quote; TTL enforced |
| 4 Currency mismatch | Phase 1 (PaymentModule) | Each Market → one provider+currency; mismatch throws |
| 5 LLM cleans identifiers | Phase 1 (OCR contract + validators) | No identifier touches a model call (review gate) |
| 6 Thai ID checksum | Phase 1 (validators) | Vector table incl. check-digit-0 + invalid accepts |
| 7 Passport/plate/VIN format | Phase 1 (validators) | Thai-script plate, Lao plate, foreign passport tests |
| 8 Non-idempotent webhook | Phase 1 (webhooks) | Same event twice → one effect |
| 9 Out-of-order / redirect race | Phase 1 (state machine + webhooks) | Out-of-order + redirect-first tests pass |
| 10 State machine / refund | Phase 1 (Order state machine) | Illegal transitions throw; refund path exists |
| 11 Trust raw OCR | Phase 1 (capture flow) | Human-verify gate; `verifiedBy` audited |
| 12 Cert issuance failure | Phase 1 (CertificateModule) + later (AI issuer) | Fail→refund; field-match; per-Order idempotency |
| 13 Commission miscalc | Phase with Partners | Boundary tests; defined base; refund reverses |
| 14 PII/secrets/audit | Phase 1 (data + CI) | Encryption + audit rows + secret-scan in place |
| 15 Cross-border compliance | Phase 1 (consent/residency) + go-live gate | Consent recorded; residency documented; legal sign-off |

## Sources

- `docs/ENGINEERING-STANDARDS.md` §A3 (TDD-mandatory paths), §A5 (boundary discipline, secrets, PII, audit), §B (AI governance) — HIGH.
- `.planning/PROJECT.md` (FX rule, adapters, state machine, externals stubbed) — HIGH.
- Thai National ID checksum algorithm: [AiPrise — Thailand PIN verification](https://www.aiprise.com/blog/thailand-personal-identification-number-pin-check-verification), [Thai identity card — Wikipedia](https://en.wikipedia.org/wiki/Thai_identity_card), [Validate Thai ID card — GitHub gist](https://gist.github.com/layerlre/a8cffb2713089235062334cb07e653bd) — HIGH.
- Cross-border data transfer (Thai PDPA §28/29; Lao Law 25/NA): [Securiti — Thailand cross-border transfer](https://securiti.ai/thailand-cross-border-personal-data-transfer-overview/), [DLA Piper — Laos data protection](https://www.dlapiperdataprotection.com/index.html?t=law&c=LA), [Digital Watch — Lao Law 25/NA](https://dig.watch/resource/laos-law-on-electronic-data-protection-no-25-na) — MEDIUM (legal counsel required for application).
- Idempotent webhook / at-least-once delivery: general payment-provider practice (Stripe/Omise docs pattern) — HIGH (well-established).

---
*Pitfalls research for: cross-border Laos↔Thailand vehicle insurance platform*
*Researched: 2026-06-06*
