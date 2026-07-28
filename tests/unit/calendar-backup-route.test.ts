import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const makeTx = () => ({
    account: { deleteMany: vi.fn(), create: vi.fn(async () => ({ id: "new_account_1" })) },
    netWorthSnapshot: { deleteMany: vi.fn(), createMany: vi.fn() },
    goal: { deleteMany: vi.fn(), createMany: vi.fn() },
    stockWatchItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    calendarEntry: { deleteMany: vi.fn(), createMany: vi.fn() },
    setting: { upsert: vi.fn() },
  });

  return {
    makeTx,
    tx: makeTx(),
    priceRefreshResult: undefined as unknown,
  };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => unknown) => callback()),
  };
});

vi.mock("@/lib/api-handler", () => ({
  withAuth:
    (handler: (request: Request, context: unknown, userId: string) => Promise<Response>) =>
    (request: Request, context: unknown) =>
      handler(request, context, "user_1"),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitCheckWithPrune: vi.fn(() => null),
}));

vi.mock("@/lib/services/exchange-rate-service", () => ({
  refreshExchangeRates: vi.fn(async () => undefined),
  resolveRate: vi.fn((_rateMap: Map<string, number>, fromCurrency: string, toCurrency: string) =>
    fromCurrency === toCurrency ? 1 : 30,
  ),
}));

vi.mock("@/lib/services/price-service", () => ({
  refreshPricesForUser: vi.fn(async () => h.priceRefreshResult),
}));

const calendarFixture = {
  id: "calendar_1",
  userId: "user_1",
  title: "US CPI",
  eventDate: new Date("2026-08-12T00:00:00.000Z"),
  startTimeMinutes: 510,
  timeZone: "Asia/Taipei",
  category: "ECONOMIC_INDICATOR" as const,
  description: "Consensus 2.8%",
  sourceUrl: "https://example.gov/cpi",
  createdAt: new Date("2026-07-24T01:00:00.000Z"),
  updatedAt: new Date("2026-07-24T02:00:00.000Z"),
};

const exportedCalendarFixture = {
  ...calendarFixture,
  eventDate: "2026-08-12",
  createdAt: "2026-07-24T01:00:00.000Z",
  updatedAt: "2026-07-24T02:00:00.000Z",
};

const exportedUserFixture = {
  id: "user_1",
  name: "Unit Test User",
  email: "unit@example.com",
  emailVerified: null,
  image: null,
  appSettings: null,
  appAccounts: [],
  snapshots: [],
  goals: [],
  stockWatchItems: [],
  calendarEntries: [calendarFixture],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => exportedUserFixture),
    },
    exchangeRate: {
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (callback: (tx: typeof h.tx) => unknown) => callback(h.tx)),
  },
}));

import { revalidateTag } from "next/cache";
import { GET, POST } from "@/app/api/settings/data/route";

async function importBackup(body: unknown) {
  return POST(
    new Request("http://unit.test/api/settings/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    undefined,
  );
}

describe("Calendar whole-app backup", () => {
  beforeEach(() => {
    h.tx = h.makeTx();
    h.priceRefreshResult = undefined;
    vi.clearAllMocks();
  });

  it("exports calendar entries in backup v1.4", async () => {
    const response = await GET(new Request("http://unit.test/api/settings/data"), undefined);
    const json = await response.json();

    expect(json.version).toBe("1.4");
    expect(json.calendarEntries).toEqual([exportedCalendarFixture]);
  });

  it("replaces calendar entries inside the import transaction", async () => {
    const response = await importBackup({
      version: "1.4",
      accounts: [],
      calendarEntries: [
        {
          title: "US CPI",
          eventDate: "2026-08-12",
          startTimeMinutes: null,
          timeZone: null,
          category: "ECONOMIC_INDICATOR",
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(h.tx.calendarEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(h.tx.calendarEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: "user_1",
          title: "US CPI",
          eventDate: new Date("2026-08-12T00:00:00.000Z"),
        }),
      ],
    });
    expect(revalidateTag).toHaveBeenCalledWith("calendar-entries:user_1", { expire: 0 });
  });

  it("imports an older backup as an empty calendar replacement", async () => {
    const response = await importBackup({ version: "1.3", accounts: [] });

    expect(response.status).toBe(200);
    expect(h.tx.calendarEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(h.tx.calendarEntry.createMany).not.toHaveBeenCalled();
  });

  it("preserves remapped mixed-currency snapshot breakdown entries for later FX revaluation", async () => {
    const response = await importBackup({
      version: "1.4",
      settings: { baseCurrency: "TWD", locale: "en-US" },
      accounts: [
        {
          id: "exported_usd_account",
          name: "US savings",
          type: "ASSET",
          category: "BANK",
          currency: "USD",
          cashBalance: 100,
          isActive: true,
          isPinned: false,
          sortOrder: 0,
        },
      ],
      snapshots: [
        {
          date: "2026-07-01T00:00:00.000Z",
          totalAssets: 100,
          totalLiabilities: 0,
          netWorth: 100,
          baseCurrency: "USD",
          breakdown: {
            exported_usd_account: { value: 100, currency: "USD", type: "CASH" },
          },
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(h.tx.netWorthSnapshot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          totalAssets: 3000,
          totalLiabilities: 0,
          netWorth: 3000,
          baseCurrency: "TWD",
          breakdown: {
            new_account_1: { value: 100, currency: "USD", type: "CASH" },
          },
        }),
      ],
    });
  });

  it("logs a resolved total price-refresh failure after import warm-up", async () => {
    h.priceRefreshResult = { outcome: "total_failure", errors: ["Yahoo Finance unavailable"] };
    const { log } = await import("@/lib/logger");

    const response = await importBackup({ version: "1.4", accounts: [] });
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(log.error).toHaveBeenCalledWith(
      "import.price_warm_failed",
      expect.objectContaining({ outcome: "total_failure" }),
    );
  });
});
