/**
 * IdentityDocument repository — PII encryption + blind-index + audit-in-transaction.
 *
 * All PII operations run inside db.$transaction so the data op and the audit_logs
 * row are written atomically (SEC-03, T-02-06).
 *
 * Encryption contract:
 *   - documentNumber / documentRef are stored as CryptoService envelope strings.
 *   - decrypt() is called ONLY inside this module — cleartext never leaves.
 *   - Blind-index companion (documentNumberIdx) allows equality lookup without decryption.
 */

import type {
  PrismaClient,
  IdentityDocument,
} from "../../../generated/prisma/client";
import { CryptoService } from "../../crypto/crypto.service";
import { EnvKeyProvider } from "../../crypto/env-key-provider";
import type { ActorContext } from "../../audit/audit.service";
import { recordAudit } from "../../audit/audit.service";

function defaultCrypto(): CryptoService {
  return new CryptoService(new EnvKeyProvider());
}

// ─── Input / Output types ──────────────────────────────────────────────────────

export interface CreateIdentityDocumentInput {
  customerId: string;
  cardTypeId?: string;
  /** Raw document number (will be encrypted + blind-indexed). */
  documentNumber?: string;
  /** Raw document reference / blob path (will be encrypted). */
  documentRef?: string;
  issuedAt?: Date;
  expiresAt?: Date;
}

/** IdentityDocument with PII fields decrypted (returned ONLY from readIdentityDocumentPii). */
export interface IdentityDocumentWithPii {
  id: string;
  customerId: string;
  cardTypeId: string | null;
  /** Decrypted plaintext document number. */
  documentNumber: string | null;
  /** Decrypted plaintext document reference. */
  documentRef: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a new identity document, encrypting documentNumber/documentRef and
 * computing the documentNumberIdx blind index. Writes one audit_logs row (CREATE) in tx.
 */
export async function createIdentityDocument(
  db: PrismaClient,
  ctx: ActorContext,
  input: CreateIdentityDocumentInput,
  crypto: CryptoService = defaultCrypto(),
): Promise<IdentityDocument> {
  return db.$transaction(async (tx) => {
    const documentNumber = input.documentNumber
      ? crypto.encrypt(input.documentNumber)
      : null;
    const documentNumberIdx = input.documentNumber
      ? crypto.blindIndex(input.documentNumber, "text")
      : null;

    const documentRef = input.documentRef
      ? crypto.encrypt(input.documentRef)
      : null;

    const doc = await tx.identityDocument.create({
      data: {
        customerId: input.customerId,
        cardTypeId: input.cardTypeId ?? null,
        documentNumber,
        documentNumberIdx,
        documentRef,
        issuedAt: input.issuedAt ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "IdentityDocument",
      subjectId: doc.id,
    });

    return doc;
  });
}

/**
 * Find an identity document by raw document number using the blind index (no decryption).
 * Writes one audit_logs row (READ) in the same tx.
 */
export async function findIdentityDocumentByDocumentNumber(
  db: PrismaClient,
  ctx: ActorContext,
  rawDocumentNumber: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<IdentityDocument | null> {
  return db.$transaction(async (tx) => {
    const idx = crypto.blindIndex(rawDocumentNumber, "text");

    const doc = await tx.identityDocument.findUnique({
      where: { documentNumberIdx: idx },
    });

    if (doc) {
      await recordAudit(tx, ctx, {
        action: "READ",
        subjectType: "IdentityDocument",
        subjectId: doc.id,
      });
    }

    return doc;
  });
}

/**
 * Load an identity document and decrypt PII fields. Decryption happens ONLY inside this module.
 * Writes one audit_logs row (READ) in the same tx.
 */
export async function readIdentityDocumentPii(
  db: PrismaClient,
  ctx: ActorContext,
  documentId: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<IdentityDocumentWithPii> {
  return db.$transaction(async (tx) => {
    const doc = await tx.identityDocument.findUniqueOrThrow({
      where: { id: documentId },
    });

    await recordAudit(tx, ctx, {
      action: "READ",
      subjectType: "IdentityDocument",
      subjectId: doc.id,
    });

    return {
      id: doc.id,
      customerId: doc.customerId,
      cardTypeId: doc.cardTypeId,
      documentNumber: doc.documentNumber
        ? crypto.decrypt(doc.documentNumber)
        : null,
      documentRef: doc.documentRef ? crypto.decrypt(doc.documentRef) : null,
      issuedAt: doc.issuedAt,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  });
}
