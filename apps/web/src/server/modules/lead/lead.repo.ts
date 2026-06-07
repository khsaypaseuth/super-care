/**
 * Lead repository — create and convert leads to customers.
 *
 * All mutations run inside db.$transaction so the data op and the audit_logs
 * row are written atomically (SEC-03, T-02-06).
 *
 * Lead email/phone are plaintext (not PII-encrypted here — they are optional
 * contact fields on a pre-customer record, not regulated PII at this stage).
 * Encryption applies to Customer PII via customer.repo.
 *
 * Actor context:
 *   - Phase 7 will populate actor from the session JWT.
 *   - Until then callers pass { actor: "system" } or { actor: "test" }.
 */

import type { PrismaClient, Lead, Customer } from "../../../generated/prisma/client.js";
import type { ActorContext } from "../../audit/audit.service.js";
import { recordAudit } from "../../audit/audit.service.js";
import { type CreateCustomerInput } from "../customer/customer.repo.js";
import { CryptoService } from "../../crypto/crypto.service.js";
import { EnvKeyProvider } from "../../crypto/env-key-provider.js";

function defaultCrypto(): CryptoService {
  return new CryptoService(new EnvKeyProvider());
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateLeadInput {
  email?: string;
  phone?: string;
  notes?: string;
}

export interface ConvertLeadInput extends CreateCustomerInput {
  // All fields come from CreateCustomerInput — firstName, lastName, nationalId, etc.
}

// ─── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a new Lead. Writes one audit_logs row (action=CREATE) in the same tx.
 */
export async function createLead(
  db: PrismaClient,
  ctx: ActorContext,
  input: CreateLeadInput,
): Promise<Lead> {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "Lead",
      subjectId: lead.id,
    });

    return lead;
  });
}

/**
 * Convert a Lead to a Customer.
 *
 * Creates the Customer (with encrypted PII via customer.repo), links the Lead by
 * setting Lead.customerId + Lead.convertedAt, and writes audit rows for BOTH the
 * Lead (action=CONVERT) and the Customer (action=CREATE) in ONE transaction.
 *
 * If the transaction fails (e.g. duplicate national ID), neither the Customer row
 * nor the Lead link nor any audit row will be committed.
 *
 * @param db          Prisma client
 * @param ctx         Actor context
 * @param leadId      The Lead to convert
 * @param input       Customer PII fields (firstName, lastName, nationalId, etc.)
 * @param crypto      CryptoService (injectable for testing)
 * @returns           The created Customer row
 */
export async function convertLeadToCustomer(
  db: PrismaClient,
  ctx: ActorContext,
  leadId: string,
  input: ConvertLeadInput,
  crypto: CryptoService = defaultCrypto(),
): Promise<Customer> {
  return db.$transaction(async (tx) => {
    // 1. Encrypt PII inline (mirror createCustomer's pattern within this tx)
    const nationalId = input.nationalId
      ? crypto.encrypt(input.nationalId)
      : null;
    const nationalIdIdx = input.nationalId
      ? crypto.blindIndex(input.nationalId, "id")
      : null;

    const passportNumber = input.passportNumber
      ? crypto.encrypt(input.passportNumber)
      : null;
    const passportNumberIdx = input.passportNumber
      ? crypto.blindIndex(input.passportNumber, "text")
      : null;

    // 2. Create the Customer row inside the transaction
    const customer = await tx.customer.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        nationalId,
        nationalIdIdx,
        passportNumber,
        passportNumberIdx,
        consentAt: input.consentAt ?? null,
        consentVersion: input.consentVersion ?? null,
      },
    });

    // 3. Link the Lead to the Customer
    await tx.lead.update({
      where: { id: leadId },
      data: {
        customerId: customer.id,
        convertedAt: new Date(),
      },
    });

    // 4. Audit BOTH subjects in the SAME transaction
    await recordAudit(tx, ctx, {
      action: "CONVERT",
      subjectType: "Lead",
      subjectId: leadId,
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "Customer",
      subjectId: customer.id,
    });

    return customer;
  });
}

