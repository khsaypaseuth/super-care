/**
 * Layout for all intake wizard steps under /[locale]/intake/[id]/*.
 *
 * Provides the app shell: top bar with product name + intake context badge,
 * and the main content area that hosts the wizard step.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/src/server/db/client";
import Link from "next/link";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
};

export default async function IntakeLayout({ children, params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations("intake");
  const tNav = await getTranslations("nav");

  // Fetch the draft for context display (insurer badge, policy mode)
  let draftContext: {
    policyMode: string | null;
    insurerName?: string | null;
  } | null = null;

  try {
    const draft = await db.draftIntake.findUnique({
      where: { id },
      select: {
        policyMode: true,
        insuranceCompanyId: true,
      },
    });

    if (!draft) {
      notFound();
    }

    // Optionally fetch insurer name for the badge
    let insurerName: string | null = null;
    if (draft.insuranceCompanyId) {
      const insurer = await db.insuranceCompany.findUnique({
        where: { id: draft.insuranceCompanyId },
        select: { nameTh: true, name: true },
      });
      insurerName = insurer?.nameTh ?? insurer?.name ?? null;
    }

    draftContext = {
      policyMode: draft.policyMode,
      insurerName,
    };
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top app bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Product name */}
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity"
          >
            <span>{tNav("home")}</span>
          </Link>

          {/* Intake context badge */}
          {draftContext?.policyMode && (
            <div className="flex items-center gap-2">
              {draftContext.insurerName && (
                <span className="hidden sm:inline text-sm text-muted-foreground font-thai">
                  {draftContext.insurerName}
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  draftContext.policyMode === "NEW"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {draftContext.policyMode === "NEW"
                  ? t("start.policyMode.new")
                  : t("start.policyMode.renewal")}
              </span>
            </div>
          )}

          {/* Placeholder user menu (real auth Phase 7) */}
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
            {t("shell.userMenuPlaceholder")}
          </div>
        </div>
      </header>

      {/* Main wizard content */}
      <main className="container mx-auto px-4 sm:px-6 py-6 max-w-3xl">
        {children}
      </main>
    </div>
  );
}
