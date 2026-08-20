import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheTag: h.cacheTag,
  revalidateTag: h.revalidateTag,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEarningsWatch: {
      findMany: h.findMany,
      upsert: h.upsert,
      deleteMany: h.deleteMany,
    },
  },
}));

import {
  addCalendarEarningsWatch,
  getCalendarEarningsWatch,
  removeCalendarEarningsWatch,
  serializeCalendarEarningsWatch,
} from "@/lib/services/calendar-earnings-service";

describe("calendar earnings watch service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes a row", () => {
    const row = {
      id: "1",
      userId: "u",
      symbol: "AAPL",
      name: "Apple",
      source: "tracked",
      createdAt: new Date(),
    };
    expect(serializeCalendarEarningsWatch(row)).toEqual({
      id: "1",
      symbol: "AAPL",
      name: "Apple",
      source: "tracked",
    });
  });

  it("adds via upsert to dedupe", async () => {
    h.upsert.mockResolvedValue({
      id: "1",
      userId: "u",
      symbol: "AAPL",
      name: "Apple",
      source: "manual",
      createdAt: new Date(),
    });
    const result = await addCalendarEarningsWatch("u", {
      symbol: "AAPL",
      name: "Apple",
      source: "manual",
    });
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_symbol: { userId: "u", symbol: "AAPL" } },
        create: expect.objectContaining({
          userId: "u",
          symbol: "AAPL",
          name: "Apple",
          source: "manual",
        }),
        update: expect.objectContaining({ name: "Apple" }),
      }),
    );
    expect(result.symbol).toBe("AAPL");
  });

  it("returns the user's watch list", async () => {
    h.findMany.mockResolvedValue([
      {
        id: "1",
        userId: "u",
        symbol: "AAPL",
        name: "Apple",
        source: "tracked",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: "2",
        userId: "u",
        symbol: "MSFT",
        name: "Microsoft",
        source: "manual",
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ]);
    const result = await getCalendarEarningsWatch("u");
    expect(h.findMany).toHaveBeenCalledWith({
      where: { userId: "u" },
      orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
    });
    expect(result).toEqual([
      { id: "1", symbol: "AAPL", name: "Apple", source: "tracked" },
      { id: "2", symbol: "MSFT", name: "Microsoft", source: "manual" },
    ]);
  });

  it("removes a watch row", async () => {
    h.deleteMany.mockResolvedValue({ count: 1 });
    await removeCalendarEarningsWatch("u", "AAPL");
    expect(h.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u", symbol: "AAPL" },
    });
  });
});
