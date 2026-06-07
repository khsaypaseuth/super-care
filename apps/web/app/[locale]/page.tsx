import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        <div className="pt-4">
          <a
            href="/en/health"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition-opacity"
          >
            {tCommon("continue")}
          </a>
        </div>
      </div>
    </main>
  );
}
