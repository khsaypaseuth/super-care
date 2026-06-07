/**
 * AuditService — writes one audit_logs row per PII access.
 *
 * DESIGN DECISION (02-CONTEXT.md):
 *   - Repository-based audit, NOT Prisma $extends/middleware.
 *   - The caller passes the Prisma transaction client `tx` so the audit row is written
 *     in the SAME transaction as the data operation (SEC-03 atomicity requirement).
 *   - Actor is supplied via CallerContext; "system"/"test" until Phase 7 wires real auth.
 *   - If the data op rolls back, the audit row rolls back with it.
 *   - If the audit write fails, the surrounding transaction fails (no silent audit gap).
 *
 * Usage:
 *   await AuditService.record(tx, ctx, { action: "CREATE", subjectType: "Customer", subjectId: id });
 *
 * Do NOT use Prisma $extends or $use middleware for audit — see Anti-Patterns in 02-RESEARCH.md.
 */

import type { PrismaClient } from "../../generated/prisma/client.js";

// The transaction client type — the arg passed to db.$transaction(async (tx) => { ... })
// Prisma wraps the client in an Omit to remove $transaction and lifecycle methods inside a tx.
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Caller-provided actor context.
 * Until Phase 7 wires real authentication, pass { actor: "system" } or { actor: "test" }.
 * Phase 7 will populate actor from the session/JWT without changing any call sites.
 */
export interface ActorContext {
  /** The actor performing the action. e.g. "system", "test", or a userId in Phase 7. */
  actor: string;
}

export interface AuditParams {
  /** The operation being recorded: CREATE, READ, UPDATE, DELETE, etc. */
  action: string;
  /** The Prisma model name (e.g. "Customer", "IdentityDocument"). */
  subjectType: string;
  /** The primary key of the affected row. */
  subjectId: string;
}

/**
 * Record a PII access event in audit_logs, within the caller's transaction.
 *
 * @param tx         - The Prisma transaction client (from db.$transaction callback)
 * @param ctx        - Caller-supplied actor context
 * @param params     - action, subjectType, subjectId
 */
export async function recordAudit(
  tx: TransactionClient,
  ctx: ActorContext,
  params: AuditParams,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actor: ctx.actor,
      action: params.action,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
    },
  });
}
