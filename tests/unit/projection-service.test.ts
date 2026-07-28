import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// Hoisted fixtures so the vi.mock factories can close over them.
interface SnapshotFixture {
  id: string;
  date: Date;
  createdAt: Date;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  baseCurrency: string;
  breakdown: unknown;
  label: string | null;
  note: string | null;
}
const h = vi.hoisted(() => ({
  snapshots: [] as SnapshotFixture[],
  accounts: [] as { id: string; currency: string; type: "ASSET" | "LIABILITY" }[],
  rates: new Map<string, number>(),
}));

vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("@/lib/logger", () => ({
  log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    netWorthSnapshot: {
      findMany: vi.fn(async () =>
        h.snapshots.map((s) => ({
          id: s.id,
          date: s.date,
          createdAt: s.createdAt,
          netWorth: s.netWorth,
          totalAssets: s.totalAssets,
          totalLiabilities: s.totalLiabilities,
          baseCurrency: s.baseCurrency,
          breakdown: s.breakdown,
          label: s.label,
          note: s.note,
        })),
      ),
    },
    account: { findMany: vi.fn(async () => h.accounts) },
    cashTransaction: { findMany: vi.fn(async () => []) },
  },
}));
// Keep resolveRate real (identity path returns 1 for same-currency); only stub
// the bulk loader so no DB/network is hit.
vi.mock("@/lib/services/exchange-rate-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/exchange-rate-service")>();
  return { ...actual, getAllExchangeRates: vi.fn(async () => h.rates) };
});

import { getProjectionData } from "@/lib/services/projection-service";

describe("getProjectionData annual bucketing", () => {
  beforeEach(() => {
    h.snapshots = [];
    h.accounts = [];
    h.rates = new Map<string, number>();
  });

  // Regression for #514: snapshots are stored at UTC-midnight and deduped by
  // their UTC date (`toISOString().split("T")[0]`), so the per-year bucket key
  // must also be UTC. Read with a local getter, a Jan-1-UTC snapshot lands in
  // the prior year for a west-of-UTC server. Force America/New_York (UTC-5) so
  // this fails with the old local-getter code and passes with the fix,
  // regardless of the CI runner's own timezone (UTC).
  describe("under a west-of-UTC timezone (America/New_York)", () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = "America/New_York";
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it("buckets a 2026-01-01T00:00:00Z snapshot into year 2026", async () => {
      h.snapshots = [
        {
          id: "2025",
          date: new Date("2025-06-01T00:00:00.000Z"),
          createdAt: new Date("2025-06-01T00:00:00.000Z"),
          netWorth: 500,
          totalAssets: 500,
          totalLiabilities: 0,
          baseCurrency: "USD",
          breakdown: null,
          label: null,
          note: null,
        },
        {
          id: "2026",
          date: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          netWorth: 1000,
          totalAssets: 1000,
          totalLiabilities: 0,
          baseCurrency: "USD",
          breakdown: null,
          label: null,
          note: null,
        },
      ];
      const result = await getProjectionData("u1", "USD");
      const years = result.annualSnapshots.map((a) => a.year);
      expect(years).toContain(2026);
      expect(years).not.toContain(2025.5); // sanity
      const y2026 = result.annualSnapshots.find((a) => a.year === 2026);
      expect(y2026?.netWorth).toBe(1000);
    });
  });

  it("dedupes same-day snapshots by target base currency, then latest createdAt", async () => {
    h.snapshots = [
      {
        id: "matching-late",
        date: new Date("2026-03-01T00:00:00.000Z"),
        createdAt: new Date("2026-03-01T12:00:00.000Z"),
        netWorth: 500,
        totalAssets: 500,
        totalLiabilities: 0,
        baseCurrency: "USD",
        breakdown: null,
        label: null,
        note: null,
      },
      {
        id: "nonmatching-latest",
        date: new Date("2026-03-01T00:00:00.000Z"),
        createdAt: new Date("2026-03-01T13:00:00.000Z"),
        netWorth: 999,
        totalAssets: 999,
        totalLiabilities: 0,
        baseCurrency: "EUR",
        breakdown: null,
        label: null,
        note: null,
      },
      {
        id: "matching-early",
        date: new Date("2026-03-01T00:00:00.000Z"),
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        netWorth: 300,
        totalAssets: 300,
        totalLiabilities: 0,
        baseCurrency: "USD",
        breakdown: null,
        label: null,
        note: null,
      },
    ];

    const result = await getProjectionData("u1", "USD");

    expect(result.latestNetWorth).toBe(500);
    expect(result.annualSnapshots).toEqual([{ year: 2026, netWorth: 500 }]);
  });

  it("builds projections from latest-rate mixed-currency breakdown values", async () => {
    h.snapshots = [
      {
        id: "mixed",
        date: new Date("2026-03-01T00:00:00.000Z"),
        createdAt: new Date("2026-03-01T12:00:00.000Z"),
        netWorth: 170,
        totalAssets: 250,
        totalLiabilities: 80,
        baseCurrency: "USD",
        breakdown: {
          usd: { value: 100, currency: "USD" },
          eur: { value: 100, currency: "EUR" },
          debt: { value: 10_000, currency: "JPY" },
        },
        label: null,
        note: null,
      },
    ];
    h.accounts = [
      { id: "usd", currency: "USD", type: "ASSET" },
      { id: "eur", currency: "EUR", type: "ASSET" },
      { id: "debt", currency: "JPY", type: "LIABILITY" },
    ];
    h.rates = new Map([
      ["USD_EUR", 0.5],
      ["USD_JPY", 100],
    ]);

    const result = await getProjectionData("u1", "USD");

    expect(result.latestNetWorth).toBe(200);
    expect(result.annualSnapshots).toEqual([{ year: 2026, netWorth: 200 }]);
  });
});
