/**
 * /[locale]/intake/new — creates a minimal DraftIntake stub and redirects to [id]/start.
 *
 * This server component creates a draft with no insurer selected yet (the user
 * will fill that in on the Start step), then redirects to the Start step route.
 *
 * The redirect is permanent from the user's perspective — they see the Start step
 * immediately. The URL is bookmarkable/resumable (CONTEXT decision: server-persisted draft).
 */

import { redirect } from "next/navigation";
import { db } from "@/src/server/db/client";
import { createDraftIntake } from "@/src/server/modules/draft-intake/draft-intake.repo";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function NewIntakePage({ params }: Props) {
  const { locale } = await params;

  // Create a new draft — step defaults to "insurer" (no insurer selected yet)
  const draft = await createDraftIntake(db, { actor: "system" }, {
    step: "insurer",
  });

  redirect(`/${locale}/intake/${draft.id}/start`);
}
