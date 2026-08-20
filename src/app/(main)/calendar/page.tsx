import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { CalendarView } from "@/components/calendar/calendar-view";
import { MobileHubRedirect } from "@/components/layout/mobile-hub-redirect";
import { taiwanCalendarDay } from "@/lib/app-day";
import {
  formatDateOnly,
  getVisibleCalendarRange,
  normalizeCalendarUrlState,
  parseDateOnly,
} from "@/lib/calendar-date";
import { getSession } from "@/lib/auth-session";
import { pickMessages } from "@/lib/i18n-utils";
import {
  CALENDAR_EARNINGS_RATE_LIMIT,
  getCalendarEarnings,
  type CalendarEarningsItem,
} from "@/lib/services/calendar-earnings-data";
import { getCalendarEntriesInRange } from "@/lib/services/calendar-entry-service";
import { rateLimitSubjectCheckWithPrune } from "@/lib/rate-limit";

const CLIENT_NAMESPACES = ["calendar", "common", "nav", "holdingSearch"];

type CalendarPageProps = {
  searchParams: Promise<{ month?: string; date?: string }>;
};

async function CalendarContent({ searchParams }: CalendarPageProps) {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const { month, date } = normalizeCalendarUrlState(await searchParams);
  const { from, to } = getVisibleCalendarRange(month);
  const earningsLimited = rateLimitSubjectCheckWithPrune(
    session.user.id,
    "yahoo",
    CALENDAR_EARNINGS_RATE_LIMIT,
  );
  const [messages, locale, entries, earnings] = await Promise.all([
    getMessages(),
    getLocale(),
    getCalendarEntriesInRange(session.user.id, parseDateOnly(from)!, parseDateOnly(to)!),
    earningsLimited
      ? Promise.resolve<CalendarEarningsItem[]>([])
      : getCalendarEarnings(session.user.id, from, to),
  ]);
  const earningsByDate = new Map<string, CalendarEarningsItem[]>();
  for (const item of earnings) {
    const day = earningsByDate.get(item.date) ?? [];
    day.push(item);
    earningsByDate.set(item.date, day);
  }
  const today = formatDateOnly(taiwanCalendarDay(new Date()));

  return (
    <NextIntlClientProvider messages={pickMessages(messages, CLIENT_NAMESPACES)}>
      <MobileHubRedirect hash="#calendar" search={`?month=${month}&date=${date}`} />
      <div className="hidden space-y-4 md:block md:space-y-8 md:animate-in md:fade-in md:duration-200">
        <CalendarView
          initialEntries={entries}
          month={month}
          selectedDate={date}
          today={today}
          locale={locale}
          earningsByDate={earningsByDate}
        />
      </div>
    </NextIntlClientProvider>
  );
}

export default function CalendarPage({ searchParams }: CalendarPageProps) {
  return <CalendarContent searchParams={searchParams} />;
}
