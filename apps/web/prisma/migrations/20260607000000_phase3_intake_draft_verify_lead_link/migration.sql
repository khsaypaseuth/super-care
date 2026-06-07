-- Phase 3: Add Lead→Customer link, verifiedBy/verifiedAt on Customer & Vehicle, DraftIntake model
-- Required by: CUST-02 (Lead→Customer conversion), CUST-07 (verify gate), VEH-01, intake wizard

-- AlterTable: Customer — add verifiedBy/verifiedAt
ALTER TABLE "customers" ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "verifiedBy" TEXT;

-- AlterTable: Lead — add customerId FK + convertedAt
ALTER TABLE "leads" ADD COLUMN "convertedAt" TIMESTAMP(3),
ADD COLUMN "customerId" TEXT;

-- AlterTable: Vehicle — add verifiedBy/verifiedAt
ALTER TABLE "vehicles" ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "verifiedBy" TEXT;

-- CreateTable: DraftIntake
CREATE TABLE "draft_intakes" (
    "id" TEXT NOT NULL,
    "insuranceCompanyId" TEXT,
    "policyMode" TEXT,
    "leadId" TEXT,
    "customerId" TEXT,
    "identityDocumentId" TEXT,
    "ocrResultId" TEXT,
    "vehicleId" TEXT,
    "mapping" JSONB,
    "verified" JSONB NOT NULL DEFAULT '{}',
    "step" TEXT NOT NULL DEFAULT 'insurer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: leads.customerId unique
CREATE UNIQUE INDEX "leads_customerId_key" ON "leads"("customerId");

-- AddForeignKey: leads.customerId → customers.id
ALTER TABLE "leads" ADD CONSTRAINT "leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
