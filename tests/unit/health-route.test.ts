import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  dbError: false,
  latestSnapshotAt: null as Date | null,
  latestCronAt: null as Date | null,
  latestPriceAt: null as Date | null,
  hasPriceableHolding: false,
  hasPriceableWatch: false,
  assetExistenceError: false,
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimitCheckWithPrune: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => {
      if (h.dbError) throw new Error("database unavailable");
      return [{ "?column?": 1 }];
    }),
    netWorthSnapshot: {
      findFirst: vi.fn(async () => (h.latestSnapshotAt ? { createdAt: h.latestSnapshotAt } : null)),
    },
    cronRun: {
      findFirst: vi.fn(async () => (h.latestCronAt ? { startedAt: h.latestCronAt } : null)),
    },
    priceCache: {
      aggregate: vi.fn(async () => ({ _max: { updatedAt: h.latestPriceAt } })),
    },
    holding: {
      findFirst: vi.fn(async () => {
        if (h.assetExistenceError) throw new Error("holding existence query unavailable");
        return h.hasPriceableHolding ? { id: "holding-1" } : null;
      }),
    },
    stockWatchItem: {
      findFirst: vi.fn(async () => (h.hasPriceableWatch ? { id: "watch-1" } : null)),
    },
  },
}));

describe("health route price freshness", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    h.dbError = false;
    h.latestSnapshotAt = now;
    h.latestCronAt = now;
    h.latestPriceAt = now;
    h.hasPriceableHolding = false;
    h.hasPriceableWatch = false;
    h.assetExistenceError = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports fresh price-cache health without exposing sensitive market or user data", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://unit.test/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", priceCache: "ok", priceAgeMs: 0 });
    expect(body).not.toHaveProperty("symbol");
    expect(body).not.toHaveProperty("symbols");
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("prices");
    expect(body).not.toHaveProperty("holdings");
    expect(body).not.toHaveProperty("users");
    expect(body).not.toHaveProperty("userId");
  });

  it("degrades when cached prices are stale", async () => {
    h.latestPriceAt = new Date(now.getTime() - 36 * 60 * 60 * 1000 - 1);
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://unit.test/api/health"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      priceCache: "stale",
    });
  });

  it("degrades an empty cache when a priceable holding exists", async () => {
    h.latestPriceAt = null;
    h.hasPriceableHolding = true;
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://unit.test/api/health"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      priceCache: "stale",
      latestPriceAt: null,
      priceAgeMs: null,
    });
  });

  it("reports an empty cache without degrading an installation with no priceable assets", async () => {
    h.latestPriceAt = null;
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://unit.test/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      priceCache: "empty",
      latestPriceAt: null,
      priceAgeMs: null,
    });
  });

  it("returns unhealthy when an empty-cache asset-existence query fails", async () => {
    h.latestPriceAt = null;
    h.assetExistenceError = true;
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://unit.test/api/health"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      db: "error",
      priceCache: "unknown",
    });
  });

  it("returns unhealthy when the lightweight health query fails", async () => {
    h.dbError = true;
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new Request("http://unit.test/api/health"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      db: "error",
      priceCache: "unknown",
    });
  });
});
