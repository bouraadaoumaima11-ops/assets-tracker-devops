import { afterAll, describe, expect, it } from "vitest";
import { computePerformanceAttribution } from "@/lib/services/analysis-service";
import {
  ANALYSIS_RANGES,
  getMonthsForRange,
  pickDefaultRange,
  resolveAnalysisRange,
} from "@/components/analysis/analysis-range";
import type { AccountMonthlyContribution, SnapshotBreakdown } from "@/lib/services/history-service";

const originalTimezone = process.env.TZ;

afterAll(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

describe("resolveAnalysisRange", () => {
  it("keeps 6M, 1Y, and 2Y boundaries on the intended month in UTC+8 and UTC-7", () => {
    const cases = [
      { timezone: "Asia/Taipei", months: 6, expected: "2026-01-01" },
      { timezone: "Asia/Taipei", months: 12, expected: "2025-07-01" },
      { timezone: "Asia/Taipei", months: 24, expected: "2024-07-01" },
      { timezone: "America/Los_Angeles", months: 6, expected: "2026-01-01" },
      { timezone: "America/Los_Angeles", months: 12, expected: "2025-07-01" },
      { timezone: "America/Los_Angeles", months: 24, expected: "2024-07-01" },
    ];

    for (const { timezone, months, expected } of cases) {
      process.env.TZ = timezone;
      const result = resolveAnalysisRange([], months, new Date(2026, 6, 28, 12));

      expect(result.rangeStartIso, `${timezone} ${months}M ISO boundary`).toBe(expected);
      expect(
        `${result.rangeStart.getUTCFullYear()}-${String(result.rangeStart.getUTCMonth() + 1).padStart(2, "0")}-01`,
        `${timezone} ${months}M chart boundary`,
      ).toBe(expected);
    }
  });

  it("excludes the prior month from both the baseline and attribution cash flows in UTC+8", () => {
    process.env.TZ = "Asia/Taipei";
    const snapshots: SnapshotBreakdown[] = [
      { date: "2025-12-31", accountValues: { brokerage: 50 } },
      { date: "2026-01-01", accountValues: { brokerage: 100 } },
      { date: "2026-07-28", accountValues: { brokerage: 160 } },
    ];
    const accounts = [
      { id: "brokerage", name: "Brokerage", category: "BROKERAGE", type: "ASSET" as const },
    ];
    const cashFlows: AccountMonthlyContribution[] = [
      { accountId: "brokerage", monthKey: "2025-12", contributions: 1_000 },
    ];

    const range = resolveAnalysisRange(snapshots, 6, new Date(2026, 6, 28, 12));
    const attribution = computePerformanceAttribution(
      range.filteredSnapshots,
      accounts,
      cashFlows,
      range.rangeStartIso.slice(0, 7),
    );

    expect(attribution).toEqual([
      expect.objectContaining({
        startValue: 100,
        endValue: 160,
        cashContribution: 0,
        marketPerformance: 60,
      }),
    ]);
    expect(range.filteredSnapshots.map((snapshot) => snapshot.date)).toEqual([
      "2026-01-01",
      "2026-07-28",
    ]);
  });
});

describe("ANALYSIS_RANGES", () => {
  it("defines the five ranges in selector order with their month counts", () => {
    expect(ANALYSIS_RANGES.map((r) => r.label)).toEqual(["YTD", "6M", "1Y", "2Y", "All"]);
    expect(ANALYSIS_RANGES.map((r) => r.months)).toEqual([0, 6, 12, 24, Infinity]);
  });
});

describe("getMonthsForRange", () => {
  it("maps each label to its month count", () => {
    expect(getMonthsForRange("YTD")).toBe(0);
    expect(getMonthsForRange("6M")).toBe(6);
    expect(getMonthsForRange("1Y")).toBe(12);
    expect(getMonthsForRange("2Y")).toBe(24);
    expect(getMonthsForRange("All")).toBe(Infinity);
  });
});

describe("pickDefaultRange", () => {
  it("returns YTD for empty history", () => {
    expect(pickDefaultRange([])).toBe("YTD");
  });

  it("returns All when history spans 6 months or less", () => {
    expect(pickDefaultRange([{ date: "2026-02-15" }], new Date(2026, 6, 1))).toBe("All");
  });

  it("returns 6M in Jan–Mar regardless of history length", () => {
    expect(pickDefaultRange([{ date: "2024-01-15" }], new Date(2026, 1, 10))).toBe("6M");
  });

  it("returns YTD otherwise", () => {
    expect(pickDefaultRange([{ date: "2024-01-15" }], new Date(2026, 6, 1))).toBe("YTD");
  });
});
