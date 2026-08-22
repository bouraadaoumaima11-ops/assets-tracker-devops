import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCalendarEarningsWatch: vi.fn(),
  addCalendarEarningsWatch: vi.fn(),
  removeCalendarEarningsWatch: vi.fn(),
  invalidateCalendarEarningsCaches: vi.fn(),
  fetchEquityQuote: vi.fn(),
  principal: { kind: "formal" as const, userId: "user_1" } as
    | { kind: "formal"; userId: string }
    | { kind: "demo"; userId: string; expiresAt: Date },
}));

vi.mock("@/lib/api-handler", () => ({
  withAuth:
    (
      handler: (
        request: Request,
        context: unknown,
        userId: string,
        principal: typeof h.principal,
        consumeRefreshCredit?: () => Promise<Response | null>,
      ) => Promise<Response>,
    ) =>
    (request: Request, context: unknown) =>
      handler(request, context, "user_1", h.principal, async () => null),
}));

vi.mock("@/lib/services/calendar-earnings-service", () => ({
  getCalendarEarningsWatch: h.getCalendarEarningsWatch,
  addCalendarEarningsWatch: h.addCalendarEarningsWatch,
  removeCalendarEarningsWatch: h.removeCalendarEarningsWatch,
  invalidateCalendarEarningsCaches: h.invalidateCalendarEarningsCaches,
}));

vi.mock("@/lib/services/stock-watch-service", () => ({
  fetchEquityQuote: h.fetchEquityQuote,
}));

import { DELETE, GET, POST } from "@/app/api/calendar-earnings-watch/route";

const watchItem = {
  id: "watch_1",
  symbol: "AAPL",
  name: "Apple Inc.",
  source: "tracked",
} as const;

const jsonRequest = (body: Record<string, unknown>, method = "POST") =>
  new Request("http://unit.test/api/calendar-earnings-watch", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("calendar earnings watch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getCalendarEarningsWatch.mockResolvedValue([]);
    h.addCalendarEarningsWatch.mockResolvedValue(watchItem);
    h.removeCalendarEarningsWatch.mockResolvedValue(undefined);
    h.fetchEquityQuote.mockResolvedValue({
      symbol: "AAPL",
      name: "Apple Inc.",
      exchange: "NasdaqGS",
      currency: "USD",
      price: 200,
    });
    h.principal = { kind: "formal", userId: "user_1" };
  });

  it("returns the authenticated watch list", async () => {
    h.getCalendarEarningsWatch.mockResolvedValueOnce([watchItem]);

    const response = await GET(
      new Request("http://unit.test/api/calendar-earnings-watch"),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(h.getCalendarEarningsWatch).toHaveBeenCalledWith("user_1");
    await expect(response.json()).resolves.toEqual({ data: [watchItem] });
  });

  it("adds a watch item (uppercased symbol) and invalidates caches", async () => {
    const response = await POST(
      jsonRequest({ symbol: " aapl ", name: "Apple Inc.", source: "manual" }),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(h.addCalendarEarningsWatch).toHaveBeenCalledWith("user_1", {
      symbol: "AAPL",
      name: "Apple Inc.",
      source: "manual",
    });
    expect(h.invalidateCalendarEarningsCaches).toHaveBeenCalledWith("user_1", h.principal);
    await expect(response.json()).resolves.toEqual({ data: watchItem });
  });

  it("defaults source to tracked when omitted", async () => {
    const response = await POST(jsonRequest({ symbol: "MSFT", name: "Microsoft" }), undefined);

    expect(response.status).toBe(201);
    expect(h.addCalendarEarningsWatch).toHaveBeenCalledWith("user_1", {
      symbol: "MSFT",
      name: "Microsoft",
      source: "tracked",
    });
  });

  it("rejects an invalid body before calling the service", async () => {
    const response = await POST(jsonRequest({ symbol: "", name: "" }), undefined);

    expect(response.status).toBe(400);
    expect(h.addCalendarEarningsWatch).not.toHaveBeenCalled();
  });

  it("rejects non-US equity symbols before creating a watch item", async () => {
    h.fetchEquityQuote.mockResolvedValueOnce({
      symbol: "2330.TW",
      name: "Taiwan Semiconductor",
      exchange: "Taiwan Stock Exchange",
      currency: "TWD",
      price: 900,
    });

    const response = await POST(
      jsonRequest({ symbol: "2330.TW", name: "Taiwan Semiconductor", source: "manual" }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(h.addCalendarEarningsWatch).not.toHaveBeenCalled();
  });

  it("rejects non-US exchanges that contain a US venue marker", async () => {
    h.fetchEquityQuote.mockResolvedValueOnce({
      symbol: "XYZ.ST",
      name: "Example Stockholm",
      exchange: "Nasdaq Stockholm",
      currency: "SEK",
      price: 100,
    });

    const response = await POST(
      jsonRequest({ symbol: "XYZ.ST", name: "Example Stockholm", source: "manual" }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(h.addCalendarEarningsWatch).not.toHaveBeenCalled();
  });

  it.each(["NYSE American", "Cboe BZX", "Cboe US", "BTS", "NCM", "NGM", "NASDAQ"])(
    "accepts US full exchange name %s",
    async (exchange) => {
      h.fetchEquityQuote.mockResolvedValueOnce({
        symbol: "AAPL",
        name: "Apple Inc.",
        exchange,
        currency: "USD",
        price: 200,
      });

      const response = await POST(
        jsonRequest({ symbol: "AAPL", name: "Apple Inc.", source: "manual" }),
        undefined,
      );

      expect(response.status).toBe(201);
      expect(h.addCalendarEarningsWatch).toHaveBeenCalledWith("user_1", {
        symbol: "AAPL",
        name: "Apple Inc.",
        source: "manual",
      });
    },
  );

  it("removes a watch item (uppercased symbol) and invalidates caches", async () => {
    const response = await DELETE(
      new Request("http://unit.test/api/calendar-earnings-watch?symbol=aapl", {
        method: "DELETE",
      }),
      undefined,
    );

    expect(response.status).toBe(204);
    expect(h.removeCalendarEarningsWatch).toHaveBeenCalledWith("user_1", "AAPL");
    expect(h.invalidateCalendarEarningsCaches).toHaveBeenCalledWith("user_1", h.principal);
  });

  it("rejects a DELETE without a symbol", async () => {
    const response = await DELETE(
      new Request("http://unit.test/api/calendar-earnings-watch", { method: "DELETE" }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(h.removeCalendarEarningsWatch).not.toHaveBeenCalled();
  });
});
