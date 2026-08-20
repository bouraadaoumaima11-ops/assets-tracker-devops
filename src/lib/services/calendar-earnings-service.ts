import "server-only";
import { cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { AuthPrincipal } from "@/lib/auth-principal";
import { invalidateScopedTag } from "@/lib/demo/demo-cache";

export type SerializedCalendarEarningsWatch = {
  id: string;
  symbol: string;
  name: string;
  source: "tracked" | "manual";
};

export function serializeCalendarEarningsWatch(row: {
  id: string;
  symbol: string;
  name: string;
  source: string;
}): SerializedCalendarEarningsWatch {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    source: row.source === "manual" ? "manual" : "tracked",
  };
}

export async function getCalendarEarningsWatch(
  userId: string,
): Promise<SerializedCalendarEarningsWatch[]> {
  "use cache";
  cacheTag("calendar-earnings");
  cacheTag(`calendar-earnings:${userId}`);
  const rows = await prisma.calendarEarningsWatch.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
  });
  return rows.map(serializeCalendarEarningsWatch);
}

export async function addCalendarEarningsWatch(
  userId: string,
  input: { symbol: string; name: string; source: "tracked" | "manual" },
): Promise<SerializedCalendarEarningsWatch> {
  const row = await prisma.calendarEarningsWatch.upsert({
    where: { userId_symbol: { userId, symbol: input.symbol } },
    create: { userId, symbol: input.symbol, name: input.name, source: input.source },
    update: { name: input.name },
  });
  return serializeCalendarEarningsWatch(row);
}

export async function removeCalendarEarningsWatch(userId: string, symbol: string): Promise<void> {
  await prisma.calendarEarningsWatch.deleteMany({ where: { userId, symbol } });
}

export function invalidateCalendarEarningsCaches(userId: string, principal: AuthPrincipal) {
  invalidateScopedTag({
    globalTag: "calendar-earnings",
    userTag: `calendar-earnings:${userId}`,
    principal,
  });
}
