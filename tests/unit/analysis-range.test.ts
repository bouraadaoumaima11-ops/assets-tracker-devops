import { afterEach, describe, expect, it } from "vitest";
import { computePerformanceAttribution } from "@/lib/services/analysis-service";
import {
  ANALYSIS_RANGES,
  getMonthsForRange,
  getMessageKeyForRange,
  pickDefaultRange,
  resolveActiveRange,
  resolveAnalysisRange,
} from "@/lib/analysis-range";
import type { AccountMonthlyContribution, SnapshotBreakdown } from "@/lib/services/history-service";

const originalTimezone = process.env.TZ;

// Restore per test, not per file: a leaked TZ would silently decide the
// outcome of every case appended after the one that set it.
afterEach(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

/** Host timezones the server could plausibly run in. */
const HOST_TIMEZONES = ["UTC", "Asia/Taipei", "America/Los_Angeles"];

/**
 * 2026-09-01 06:00 Taipei — half an hour after the daily snapshot cron
 * (21:30 UTC) has stamped a snapshot with date 2026-09-01, while a UTC host
 * still reads August.
 */
const JUST_AFTER_CRON_ON_THE_FIRST = new Date("2026-08-31T22:00:00Z");

/** 2026-01-01 02:00 Taipei — a UTC host still reads December 2025. */
const NEW_YEAR_IN_TAIPEI = new Date("2025-12-31T18:00:00Z");

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

describe("resolveAnalysisRange — Taiwan calendar day boundaries", () => {
  const monthOf = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  it.each(HOST_TIMEZONES)(
    "ends the window on the Taiwan month, not the host month (TZ=%s)",
    (timezone) => {
      process.env.TZ = timezone;
      const snapshots = [{ date: "2026-08-31" }, { date: "2026-09-01" }];
      const range = resolveAnalysisRange(snapshots, 6, JUST_AFTER_CRON_ON_THE_FIRST);

      // rangeEnd feeds fillMonthRange; an August end silently drops the
      // newest month from every month-bucketed chart.
      expect(monthOf(range.rangeEnd)).toBe("2026-09");
      expect(range.rangeStartIso).toBe("2026-03-01");
      expect(range.filteredSnapshots.map((s) => s.date)).toContain("2026-09-01");
    },
  );

  it.each(HOST_TIMEZONES)("resolves YTD to the Taiwan year (TZ=%s)", (timezone) => {
    process.env.TZ = timezone;
    const snapshots = [{ date: "2025-06-30" }, { date: "2026-01-01" }];
    const range = resolveAnalysisRange(snapshots, 0, NEW_YEAR_IN_TAIPEI);

    expect(range.rangeStartIso).toBe("2026-01-01");
    expect(monthOf(range.rangeEnd)).toBe("2026-01");
    expect(range.filteredSnapshots.map((s) => s.date)).toEqual(["2026-01-01"]);
  });

  it("returns the same window for one instant regardless of host timezone", () => {
    const results = HOST_TIMEZONES.map((timezone) => {
      process.env.TZ = timezone;
      const r = resolveAnalysisRange([], 12, JUST_AFTER_CRON_ON_THE_FIRST);
      return { rangeStartIso: r.rangeStartIso, rangeEnd: r.rangeEnd.toISOString() };
    });
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });
});

describe("ANALYSIS_RANGES", () => {
  it("defines the five ranges in selector order with their month counts", () => {
    expect(ANALYSIS_RANGES.map((r) => r.label)).toEqual(["YTD", "6M", "1Y", "2Y", "All"]);
    expect(ANALYSIS_RANGES.map((r) => r.months)).toEqual([0, 6, 12, 24, Infinity]);
  });

  it("carries the analysis translation messageKey for each range", () => {
    expect(ANALYSIS_RANGES.map((r) => r.messageKey)).toEqual([
      "rangeYTD",
      "range6M",
      "range1Y",
      "range2Y",
      "rangeAll",
    ]);
  });
});

describe("getMessageKeyForRange", () => {
  it("maps each label to its analysis message key", () => {
    expect(getMessageKeyForRange("YTD")).toBe("rangeYTD");
    expect(getMessageKeyForRange("6M")).toBe("range6M");
    expect(getMessageKeyForRange("1Y")).toBe("range1Y");
    expect(getMessageKeyForRange("2Y")).toBe("range2Y");
    expect(getMessageKeyForRange("All")).toBe("rangeAll");
  });
});

describe("resolveActiveRange", () => {
  it("returns the stored label when it names a known range", () => {
    for (const label of ["YTD", "6M", "1Y", "2Y", "All"] as const) {
      expect(resolveActiveRange(label, "YTD")).toBe(label);
    }
  });

  it("falls back to the default when the stored label is unknown", () => {
    expect(resolveActiveRange("BOGUS_RANGE", "YTD")).toBe("YTD");
    expect(resolveActiveRange("", "6M")).toBe("6M");
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

  it.each(HOST_TIMEZONES)("reads the current month as the Taiwan month (TZ=%s)", (timezone) => {
    process.env.TZ = timezone;
    // Taipei is already in January, so the Jan–Mar widening applies even
    // though a UTC host still reads December.
    expect(pickDefaultRange([{ date: "2024-01-15" }], NEW_YEAR_IN_TAIPEI)).toBe("6M");
  });
});
