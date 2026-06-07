/**
 * Vehicle repository — PII encryption + blind-index + audit-in-transaction.
 *
 * All PII operations run inside db.$transaction so the data op and the audit_logs
 * row are written atomically (SEC-03, T-03-03).
 *
 * Encryption contract:
 *   - chassisNumber / engineNumber are stored as CryptoService envelope strings.
 *   - decrypt() is called ONLY inside this module — cleartext never leaves.
 *   - Blind-index companion (chassisNumberIdx) allows equality lookup without decryption.
 *
 * Actor context:
 *   - Phase 7 will populate actor from the session JWT.
 *   - Until then callers pass { actor: "system" } or { actor: "test" }.
 */

import type { PrismaClient, Vehicle } from "../../../generated/prisma/client";
import { CryptoService } from "../../crypto/crypto.service";
import { EnvKeyProvider } from "../../crypto/env-key-provider";
import type { ActorContext } from "../../audit/audit.service";
import { recordAudit } from "../../audit/audit.service";

function defaultCrypto(): CryptoService {
  return new CryptoService(new EnvKeyProvider());
}

// ─── Input / Output types ──────────────────────────────────────────────────────

export interface CreateVehicleInput {
  customerId: string;
  /** Raw chassis number (will be encrypted + blind-indexed). */
  chassisNumber?: string;
  /** Raw engine number (will be encrypted only). */
  engineNumber?: string;
  platePrefix?: string;
  plateNumber?: string;
  plateProvince?: string;
  year?: number;
  engineCC?: number;
  seatCount?: number;
  /** Weight as a numeric value (stored as Decimal). */
  weight?: number;
  brandId?: string;
  modelId?: string;
  colorId?: string;
  vehicleTypeId?: string;
  /** Staff actor who verified this vehicle's identifiers (CUST-07). */
  verifiedBy?: string;
  /** Timestamp of verification (CUST-07). */
  verifiedAt?: Date;
}

/** Vehicle with PII fields decrypted (returned ONLY from readVehiclePii). */
export interface VehicleWithPii {
  id: string;
  customerId: string;
  /** Decrypted plaintext chassis number. */
  chassisNumber: string | null;
  /** Decrypted plaintext engine number. */
  engineNumber: string | null;
  platePrefix: string | null;
  plateNumber: string | null;
  plateProvince: string | null;
  year: number | null;
  engineCC: number | null;
  seatCount: number | null;
  /** Weight as string (Decimal boundary — never use Float). */
  weight: string | null;
  brandId: string | null;
  modelId: string | null;
  colorId: string | null;
  vehicleTypeId: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a new Vehicle, encrypting chassisNumber + engineNumber and computing the
 * chassisNumberIdx blind index. Writes one audit_logs row (action=CREATE) in the same tx.
 */
export async function createVehicle(
  db: PrismaClient,
  ctx: ActorContext,
  input: CreateVehicleInput,
  crypto: CryptoService = defaultCrypto(),
): Promise<Vehicle> {
  return db.$transaction(async (tx) => {
    const chassisNumber = input.chassisNumber
      ? crypto.encrypt(input.chassisNumber)
      : null;
    const chassisNumberIdx = input.chassisNumber
      ? crypto.blindIndex(input.chassisNumber, "text")
      : null;

    const engineNumber = input.engineNumber
      ? crypto.encrypt(input.engineNumber)
      : null;

    const vehicle = await tx.vehicle.create({
      data: {
        customerId: input.customerId,
        chassisNumber,
        chassisNumberIdx,
        engineNumber,
        platePrefix: input.platePrefix ?? null,
        plateNumber: input.plateNumber ?? null,
        plateProvince: input.plateProvince ?? null,
        year: input.year ?? null,
        engineCC: input.engineCC ?? null,
        seatCount: input.seatCount ?? null,
        weight: input.weight ?? null,
        brandId: input.brandId ?? null,
        modelId: input.modelId ?? null,
        colorId: input.colorId ?? null,
        vehicleTypeId: input.vehicleTypeId ?? null,
        verifiedBy: input.verifiedBy ?? null,
        verifiedAt: input.verifiedAt ?? null,
      },
    });

    await recordAudit(tx, ctx, {
      action: "CREATE",
      subjectType: "Vehicle",
      subjectId: vehicle.id,
    });

    return vehicle;
  });
}

/**
 * Find a Vehicle by raw chassis number using the blind index (no decryption).
 * Writes one audit_logs row (action=READ) in the same tx.
 *
 * @returns The vehicle row (PII fields still encrypted), or null if not found.
 */
export async function findVehicleByChassisNumber(
  db: PrismaClient,
  ctx: ActorContext,
  rawChassisNumber: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<Vehicle | null> {
  return db.$transaction(async (tx) => {
    const idx = crypto.blindIndex(rawChassisNumber, "text");

    const vehicle = await tx.vehicle.findUnique({
      where: { chassisNumberIdx: idx },
    });

    if (vehicle) {
      await recordAudit(tx, ctx, {
        action: "READ",
        subjectType: "Vehicle",
        subjectId: vehicle.id,
      });
    }

    return vehicle;
  });
}

/**
 * Load a vehicle and decrypt PII fields. Decryption happens ONLY inside this module.
 * Writes one audit_logs row (action=READ) in the same tx.
 *
 * @returns VehicleWithPii with decrypted chassisNumber/engineNumber.
 * @throws Prisma.NotFoundError if the vehicle does not exist.
 */
export async function readVehiclePii(
  db: PrismaClient,
  ctx: ActorContext,
  vehicleId: string,
  crypto: CryptoService = defaultCrypto(),
): Promise<VehicleWithPii> {
  return db.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });

    await recordAudit(tx, ctx, {
      action: "READ",
      subjectType: "Vehicle",
      subjectId: vehicle.id,
    });

    // Decimal boundary: convert weight to string to avoid float precision loss (Pitfall 5).
    // Callers that need numeric math should parse via Big.js.
    // vehicle.weight is a Prisma Decimal object — its .toString() returns the numeric string.
    const weight = vehicle.weight ? vehicle.weight.toString() : null;

    return {
      id: vehicle.id,
      customerId: vehicle.customerId,
      chassisNumber: vehicle.chassisNumber
        ? crypto.decrypt(vehicle.chassisNumber)
        : null,
      engineNumber: vehicle.engineNumber
        ? crypto.decrypt(vehicle.engineNumber)
        : null,
      platePrefix: vehicle.platePrefix,
      plateNumber: vehicle.plateNumber,
      plateProvince: vehicle.plateProvince,
      year: vehicle.year,
      engineCC: vehicle.engineCC,
      seatCount: vehicle.seatCount,
      weight,
      brandId: vehicle.brandId,
      modelId: vehicle.modelId,
      colorId: vehicle.colorId,
      vehicleTypeId: vehicle.vehicleTypeId,
      verifiedBy: vehicle.verifiedBy,
      verifiedAt: vehicle.verifiedAt,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
  });
}
