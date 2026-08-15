import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getSession } from "@/lib/auth-session";
import { getOrCreateSettings } from "@/lib/services/settings-service";
import { getCachedAnalysisPayload } from "@/lib/services/analysis-payload-service";
import { pickMessages } from "@/lib/i18n-utils";
import { LargeTitleHeading } from "@/components/layout/large-title-heading";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { countActiveAccounts } from "@/lib/services/account-service";

const CLIENT_NAMESPACES = ["analysis", "categories", "nav", "trendChart", "history", "freshness"];

async function AnalysisContent() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [t, messages, locale, settings, accountCount] = await Promise.all([
    getTranslations("analysis"),
    getMessages(),
    getLocale(),
    getOrCreateSettings(userId),
    countActiveAccounts(userId),
  ]);
  const { seriesByRange, investmentCostBasis, snapshots, meta } = await getCachedAnalysisPayload(
    userId,
    settings.baseCurrency,
    locale,
  );

  return (
    <NextIntlClientProvider messages={pickMessages(messages, CLIENT_NAMESPACES)}>
      <div className="space-y-4 md:space-y-8 animate-in fade-in duration-200">
        <LargeTitleHeading>{t("title")}</LargeTitleHeading>

        <AnalysisView
          seriesByRange={seriesByRange}
          investmentCostBasis={investmentCostBasis}
          snapshots={snapshots}
          meta={meta}
          baseCurrency={settings.baseCurrency}
          locale={locale}
          hasAccounts={accountCount > 0}
        />
      </div>
    </NextIntlClientProvider>
  );
}

export default function AnalysisPage() {
  return <AnalysisContent />;
}
