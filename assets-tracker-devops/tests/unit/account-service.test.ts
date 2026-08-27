import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// React cache() is per-render memoization; neutralize it so each call in a test
// reaches the query and we can assert on what was actually sent.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});
vi.mock("next/cache", () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}));

const h = vi.hoisted(() => ({
  prices: [] as { symbol: string; price: number; currency?: string }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    priceCache: { findMany: vi.fn(async () => h.prices) },
  },
}));

const { getAccountPriceMap } = await import("@/lib/services/account-service");

// Regression #643: the /accounts page used to reach prices through
// `price-service.getCachedPricesForSymbols`, which read the ENTIRE PriceCache
// table (all users' symbols) and filtered in JS behind the `prices` tag — the
// most frequently invalidated tag in the app. It now shares this helper, whose
// contract is that the database only ever returns the symbols asked for.
describe("getAccountPriceMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prices = [];
  });

  it("scopes the query to the requested symbols instead of scanning the table", async () => {
    h.prices = [{ symbol: "AAPL", price: 200, currency: "USD" }];
    const { prisma } = await import("@/lib/prisma");

    await getAccountPriceMap(["AAPL", "2330.TW"]);

    const args = vi.mocked(prisma.priceCache.findMany).mock.calls[0][0] as {
      where?: { symbol?: { in?: string[] } };
      select?: Record<string, boolean>;
    };
    // An unfiltered findMany — the shape of the bug — has no `where` at all.
    expect(args.where?.symbol?.in).toBeDefined();
    expect(args.where?.symbol?.in).toEqual(["2330.TW", "AAPL"]);
    expect(args.select).toEqual({ symbol: true, price: true, currency: true });
  });

  it("dedupes and sorts symbols so the cache key is stable across orderings", async () => {
    const { prisma } = await import("@/lib/prisma");

    await getAccountPriceMap(["MSFT", "AAPL", "MSFT", "AAPL"]);

    const args = vi.mocked(prisma.priceCache.findMany).mock.calls[0][0] as {
      where: { symbol: { in: string[] } };
    };
    expect(args.where.symbol.in).toEqual(["AAPL", "MSFT"]);
  });

  it("returns symbol -> quote records, coercing the Decimal column", async () => {
    h.prices = [
      { symbol: "AAPL", price: 200.5, currency: "USD" },
      { symbol: "MSFT", price: 410, currency: "USD" },
    ];

    await expect(getAccountPriceMap(["AAPL", "MSFT"])).resolves.toEqual({
      AAPL: { price: 200.5, currency: "USD" },
      MSFT: { price: 410, currency: "USD" },
    });
  });

  it("keeps each cached price coupled to the currency it was quoted in", async () => {
    h.prices = [{ symbol: "BTC-EUR", price: 50_000, currency: "EUR" }];

    await expect(getAccountPriceMap(["BTC-EUR"])).resolves.toEqual({
      "BTC-EUR": { price: 50_000, currency: "EUR" },
    });
  });

  it("omits symbols with no cached price rather than inventing a zero", async () => {
    h.prices = [{ symbol: "AAPL", price: 200, currency: "USD" }];

    const map = await getAccountPriceMap(["AAPL", "NOPRICE"]);

    expect(map).toEqual({ AAPL: { price: 200, currency: "USD" } });
    expect("NOPRICE" in map).toBe(false);
  });

  it("issues no query at all for an empty symbol list", async () => {
    const { prisma } = await import("@/lib/prisma");

    await expect(getAccountPriceMap([])).resolves.toEqual({});
    expect(vi.mocked(prisma.priceCache.findMany)).not.toHaveBeenCalled();
  });
});

// Source-level guard for the shape of the bug itself. The unit tests above pin
// the helper's contract, but the actual #643 defect was a *convenient*
// whole-table read added next to the scoped ones — easy to reintroduce, and
// invisible until the table is big. Same source-inspection approach as
// calendar-page-source.test.ts.
describe("price reads stay scoped (#643)", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("routes the accounts page through the scoped helper", () => {
    const page = read("src/app/(main)/accounts/page.tsx");
    expect(page).toContain("getAccountPriceMap");
    expect(page).not.toContain("getCachedPricesForSymbols");
  });

  it("leaves no unfiltered PriceCache read in price-service", () => {
    const source = read("src/lib/services/price-service.ts");
    const reads = [...source.matchAll(/priceCache\.(findMany|findFirst)\(/g)];
    expect(reads.length).toBeGreaterThan(0); // guard the guard: the file still reads prices
    for (const match of reads) {
      const call = source.slice(match.index, match.index + 300);
      expect(call, `unscoped ${match[0]} at index ${match.index}`).toContain("where:");
    }
  });
});
