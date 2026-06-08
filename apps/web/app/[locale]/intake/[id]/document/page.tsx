/**
 * Document & OCR step page — Step 3 of the CMI intake wizard (CUST-03/04, CMI-03).
 *
 * Server component: renders WizardSteps + DocumentUpload (client component).
 * The upload + OCR extraction are handled by the client component via uploadDocumentAction.
 *
 * @see UI-SPEC step 3; CUST-03/04; CMI-03
 */

import { getTranslations } from "next-intl/server";
import { WizardSteps } from "@/src/components/intake/wizard-steps";
import { DocumentUpload } from "@/src/components/intake/document-upload";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function DocumentStepPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations("intake");

  return (
    <div className="space-y-6">
      <WizardSteps currentStep="document" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("document.heading")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("document.description")}
        </p>
      </div>

      <DocumentUpload locale={locale} draftId={id} />
    </div>
  );
}
