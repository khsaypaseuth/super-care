import { useTranslations } from "next-intl";

export default function HealthPage() {
  const t = useTranslations("health");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-sm w-full">
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{t("status")}:</span>
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              {t("ok")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>
    </main>
  );
}
