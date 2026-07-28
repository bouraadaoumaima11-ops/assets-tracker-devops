import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  priceResult: {
    outcome: "total_failure",
    updated: 0,
    changed: 0,
    skippedFresh: 0,
    errors: ["Yahoo Finance batch failed"],
    nextRefreshAt: null,
    retryAfterSeconds: null,
  },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  withAuth:
    (handler: (request: Request, context: unknown, userId: string) => Promise<Response>) =>
    (request: Request, context: unknown) =>
      handler(request, context, "user-1"),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimitCheckWithPrune: vi.fn(() => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: { findUnique: vi.fn(async () => ({ baseCurrency: "USD" })) },
    account: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/services/price-service", () => ({
  refreshPricesForUser: vi.fn(async () => h.priceResult),
}));
vi.mock("@/lib/services/exchange-rate-service", () => ({
  refreshExchangeRates: vi.fn(async () => ({
    updated: 0,
    changed: 0,
    skippedFresh: false,
    fetchFailed: false,
    nextRefreshAt: null,
  })),
}));

describe("unified market refresh route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.priceResult = {
      outcome: "total_failure",
      updated: 0,
      changed: 0,
      skippedFresh: 0,
      errors: ["Yahoo Finance batch failed"],
      nextRefreshAt: null,
      retryAfterSeconds: null,
    };
  });

  it("returns the total price-refresh failure outcome to clients", async () => {
    const { POST } = await import("@/app/api/refresh/route");
    const response = await POST(
      new Request("http://unit.test/api/refresh", { method: "POST" }),
      undefined,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { prices: { outcome: "total_failure", fetchFailed: true } },
    });
  });
});
