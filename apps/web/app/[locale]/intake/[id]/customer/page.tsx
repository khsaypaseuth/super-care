/**
 * Customer step page — Step 2 of the CMI intake wizard (CUST-01/02).
 *
 * Server component: loads all master data for the form Comboboxes.
 * Renders WizardSteps + CustomerForm (client component).
 *
 * @see UI-SPEC step 2; CUST-01/02
 */

import { getTranslations } from "next-intl/server";
import { db } from "@/src/server/db/client";
import { WizardSteps } from "@/src/components/intake/wizard-steps";
import { CustomerForm } from "@/src/components/intake/customer-form";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function CustomerStepPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations("intake");

  // Load all master data for the customer form
  const [titles, cardTypes, nationalities, provinces, districts, subdistricts] =
    await Promise.all([
      db.masterTitleName.findMany({
        select: { id: true, code: true, nameTh: true, nameEn: true },
        orderBy: { code: "asc" },
      }),
      db.masterCardType.findMany({
        select: { id: true, code: true, nameTh: true, nameEn: true },
        orderBy: { code: "asc" },
      }),
      db.masterNationality.findMany({
        select: { id: true, code: true, nameTh: true, nameEn: true },
        orderBy: { code: "asc" },
      }),
      db.masterProvince.findMany({
        select: { id: true, code: true, nameTh: true, nameEn: true },
        orderBy: { nameTh: "asc" },
      }),
      db.masterDistrict.findMany({
        select: { id: true, code: true, nameTh: true, nameEn: true, provinceId: true },
        orderBy: { nameTh: "asc" },
      }),
      db.masterSubdistrict.findMany({
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          postalCode: true,
          districtId: true,
        },
        orderBy: { nameTh: "asc" },
      }),
    ]);

  return (
    <div className="space-y-6">
      <WizardSteps currentStep="customer" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("customer.heading")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("customer.description")}
        </p>
      </div>

      <CustomerForm
        locale={locale}
        draftId={id}
        titles={titles}
        cardTypes={cardTypes}
        nationalities={nationalities}
        provinces={provinces}
        districts={districts}
        subdistricts={subdistricts}
      />
    </div>
  );
}
