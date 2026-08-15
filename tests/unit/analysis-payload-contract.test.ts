import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const payloadSource = readFileSync("src/lib/services/analysis-payload-service.ts", "utf8");
const viewSource = readFileSync("src/components/analysis/analysis-view.tsx", "utf8");
const rangeSource = readFileSync("src/components/analysis/analysis-range.ts", "utf8");
const pageSource = readFileSync("src/app/(main)/analysis/page.tsx", "utf8");

const CLIENT_AGGREGATION_FNS = [
  "aggregateMonthlyChange",
  "computeKpis",
  "fillMonthRange",
  "buildCashFlowBuckets",
  "buildCumulativeGrowth",
  "aggregateCategoryHistory",
  "computePerformanceAttribution",
  "computeInvestmentReturn",
  "computeInvestmentReturnSeries",
  "computeDrawdownSeries",
];

describe("#644 server-side analysis aggregation contract", () => {
  it("does not ship the raw breakdown to the client", () => {
    expect(payloadSource).toContain("seriesByRange");
    expect(payloadSource).not.toContain("rawHistory:");
    expect(payloadSource).not.toContain("cashFlowData:");
    expect(payloadSource).not.toContain("accountCashFlow:");
    expect(viewSource).not.toContain("rawHistory");
    expect(viewSource).not.toContain("cashFlowData");
    expect(viewSource).not.toContain("accountCashFlow");
  });

  it("keys the payload cache by locale (labels are formatted server-side)", () => {
    expect(payloadSource).toContain('["analysis-payload", userId, baseCurrency, locale]');
  });

  it("no longer imports the ten aggregation functions into AnalysisView", () => {
    for (const fn of CLIENT_AGGREGATION_FNS) {
      expect(viewSource, fn).not.toContain(fn);
    }
    expect(viewSource).not.toContain("resolveAnalysisRange(");
  });

  it("reads the selected range's series from the precomputed map", () => {
    expect(viewSource).toContain("seriesByRange[range]");
    expect(viewSource).toContain("usePersistedRange<RangeLabel>");
    expect(viewSource).toContain("meta.defaultRange");
    expect(viewSource).not.toContain("pickDefaultRange(snapshots)");
  });

  it("keeps the shared range module wired into the server payload", () => {
    expect(rangeSource).toContain("ANALYSIS_RANGES");
    expect(rangeSource).toContain("pickDefaultRange");
    expect(payloadSource).toContain("pickDefaultRange");
  });

  it("passes the locale into the payload fetch from the page", () => {
    expect(pageSource).toContain("getCachedAnalysisPayload(");
    // Whitespace/trailing-comma tolerant: prettier may wrap the call across
    // lines and append a trailing comma, so assert up to the locale argument.
    expect(pageSource.replace(/\s+/g, "")).toContain(
      "getCachedAnalysisPayload(userId,settings.baseCurrency,locale",
    );
  });

  it("still ships the full normalized snapshots for the history tab", () => {
    expect(payloadSource).toContain("snapshots:");
    expect(viewSource).toContain("<HistoryView snapshots={snapshots}");
  });
});
