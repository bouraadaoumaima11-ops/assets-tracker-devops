import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { ok, failure, validationError } from "@/lib/api-responses";
import { createCalendarEarningsWatchSchema } from "@/lib/validators";
import { isUsEquityExchange } from "@/lib/calendar-earnings";
import { fetchEquityQuote } from "@/lib/services/stock-watch-service";
import {
  addCalendarEarningsWatch,
  getCalendarEarningsWatch,
  removeCalendarEarningsWatch,
  invalidateCalendarEarningsCaches,
} from "@/lib/services/calendar-earnings-service";

export const GET = withAuth(
  async (_req, _ctx, userId) => {
    return ok(await getCalendarEarningsWatch(userId));
  },
  { demo: "allow" },
);

export const POST = withAuth(
  async (request, _ctx, userId, principal, consumeRefreshCredit) => {
    const body = await request.json();
    const parsed = createCalendarEarningsWatchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if (!consumeRefreshCredit) return failure("Market data access is unavailable", 500);
    const limitedRefresh = await consumeRefreshCredit();
    if (limitedRefresh) return limitedRefresh;

    let quote;
    try {
      quote = await fetchEquityQuote(parsed.data.symbol, {
        redactIdentifiers: principal.kind === "demo",
      });
    } catch {
      return failure("US market validation is temporarily unavailable", 503);
    }
    if (!quote || !isUsEquityExchange(quote.exchange)) {
      return failure("Only US stock symbols can be added.", 400);
    }

    const item = await addCalendarEarningsWatch(userId, parsed.data);
    invalidateCalendarEarningsCaches(userId, principal);
    return ok(item, { status: 201 });
  },
  { demo: "allow", marketData: "refresh-credit" },
);

export const DELETE = withAuth(
  async (request, _ctx, userId, principal) => {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase();
    if (!symbol) return failure("Symbol is required");
    await removeCalendarEarningsWatch(userId, symbol);
    invalidateCalendarEarningsCaches(userId, principal);
    // 204 must not carry a body, so NextResponse.json (which always sets one)
    // cannot be used here — a bare status-only response is required.
    return new NextResponse(null, { status: 204 });
  },
  { demo: "allow" },
);
