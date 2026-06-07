/**
 * Start step page — Step 1 of the CMI intake wizard.
 *
 * Server component: loads insurance companies from DB for the Combobox.
 * Renders WizardSteps + StartForm (client component).
 *
 * @see UI-SPEC step 1; CMI-02
 */

import { getTranslations } from "next-intl/server";
import { db } from "@/src/server/db/client";
import { WizardSteps } from "@/src/components/intake/wizard-steps";
import { StartForm } from "@/src/components/intake/start-form";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function StartStepPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("intake");

  // Load insurance companies for the Combobox (master data)
  const insuranceCompanies = await db.insuranceCompany.findMany({
    select: { id: true, code: true, name: true, nameTh: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <WizardSteps currentStep="start" />

      {/* Step heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("start.heading")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("start.description")}
        </p>
      </div>

      {/* Start form: insurance company combobox + new/renewal radio */}
      <StartForm
        locale={locale}
        insuranceCompanies={insuranceCompanies}
      />
    </div>
  );
}
