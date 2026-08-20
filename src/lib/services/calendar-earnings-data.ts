import "server-only";
import { cacheTag, cacheLife } from "next/cache";
import { getYahooClient } from "@/lib/services/yahoo-client";
import { getCalendarEarningsWatch } from "@/lib/services/calendar-earnings-service";
import {
  mapEarningsCallToTaiwanDay,
  mapEarningsTimestampToTaiwanDay,
  type EarningsSession,
} from "@/lib/calendar-earnings";

export type CalendarEarningsItem = {
  date: string;
  symbol: string;
  name: string;
  session: EarningsSession;
  isEstimate: boolean;
  epsForward: number | null;
};

export async function getCalendarEarnings(
  userId: string,
  from: string,
  to: string,
): Promise<CalendarEarningsItem[]> {
  "use cache";
  cacheTag(`calendar-earnings:${userId}`);
  cacheLife("hours");

  const watch = await getCalendarEarningsWatch(userId);
  const symbols = watch.map((w) => w.symbol);
  if (symbols.length === 0) return [];

  const yahooFinance = await getYahooClient();
  const quotes = await yahooFinance.quote(symbols);
  const list = Array.isArray(quotes) ? quotes : [quotes];

  const items: CalendarEarningsItem[] = [];
  for (const q of list) {
    if (!q?.symbol) continue;
    const name = watch.find((w) => w.symbol === q.symbol)?.name ?? q.symbol;
    const callStart = q.earningsCallTimestampStart;
    const mapped = callStart
      ? mapEarningsCallToTaiwanDay(callStart)
      : mapEarningsTimestampToTaiwanDay(q.earningsTimestamp ?? new Date(0));
    if (mapped.date < from || mapped.date > to) continue;
    items.push({
      date: mapped.date,
      symbol: q.symbol,
      name,
      session: mapped.session,
      isEstimate: q.isEarningsDateEstimate ?? false,
      epsForward: typeof q.epsForward === "number" ? q.epsForward : null,
    });
  }
  return items;
}
