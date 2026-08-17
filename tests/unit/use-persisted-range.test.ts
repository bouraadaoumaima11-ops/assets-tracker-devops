import { describe, expect, it } from "vitest";
import { resolvePersistedRange } from "@/hooks/use-persisted-range";
import { ANALYSIS_RANGE_LABELS } from "@/lib/analysis-range";
import { TREND_RANGE_LABELS, DEFAULT_TREND_RANGE } from "@/components/dashboard/trend-chart-utils";

describe("resolvePersistedRange", () => {
  it("keeps a stored value that is still on the allow-list", () => {
    // Given a persisted value the current build still offers
    const stored = "1Y";

    // When it is resolved against the analysis ranges
    const resolved = resolvePersistedRange(stored, ANALYSIS_RANGE_LABELS, "YTD");

    // Then the user's choice survives
    expect(resolved).toBe("1Y");
  });

  it("falls back when nothing is stored yet", () => {
    // Given a first visit with an empty sessionStorage
    const stored = null;

    // When the value is resolved
    const resolved = resolvePersistedRange(stored, ANALYSIS_RANGE_LABELS, "6M");

    // Then the caller's default is used
    expect(resolved).toBe("6M");
  });

  it("falls back on a value written by an older build", () => {
    // Given a label this build no longer offers (the #689 crash)
    const stored = "BOGUS_RANGE";

    // When the value is resolved
    const resolved = resolvePersistedRange(stored, ANALYSIS_RANGE_LABELS, "YTD");

    // Then it never reaches the caller's `seriesByRange[range]` lookup
    expect(resolved).toBe("YTD");
    expect(ANALYSIS_RANGE_LABELS).not.toContain(stored);
  });

  it("falls back on an empty string", () => {
    // Given a blank sessionStorage entry
    // When the value is resolved
    // Then the default wins over the empty label
    expect(resolvePersistedRange("", ANALYSIS_RANGE_LABELS, "All")).toBe("All");
  });

  it("guards the dashboard trend range against the same stale value", () => {
    // Given a trend range written before the option set changed
    const stored = "7D";

    // When it is resolved against the dashboard allow-list
    const resolved = resolvePersistedRange(stored, TREND_RANGE_LABELS, DEFAULT_TREND_RANGE);

    // Then TREND_RANGES.find() downstream always matches
    expect(TREND_RANGE_LABELS).toContain(resolved);
  });

  it("accepts every label the analysis and trend range sets declare", () => {
    // Given each shipped label in turn
    for (const label of ANALYSIS_RANGE_LABELS) {
      // When resolved against its own allow-list, it is returned unchanged
      expect(resolvePersistedRange(label, ANALYSIS_RANGE_LABELS, "YTD")).toBe(label);
    }
    for (const label of TREND_RANGE_LABELS) {
      expect(resolvePersistedRange(label, TREND_RANGE_LABELS, DEFAULT_TREND_RANGE)).toBe(label);
    }
  });
});
