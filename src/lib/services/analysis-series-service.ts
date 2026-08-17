import "server-only";
import {
  ANALYSIS_RANGES,
  getMonthsForRange,
  resolveAnalysisRange,
  type RangeLabel,
} from "@/components/analysis/analysis-range";
import {
  aggregateMonthlyChange,
  fillMonthRange,
  computeKpis,
  buildCashFlowBuckets,
  buildCumulativeGrowth,
  aggregateCategoryHistory,
  computePerformanceAttribution,
  computeInvestmentReturn,
  computeInvestmentReturnSeries,
  type MonthlyBucket,
  type AnalysisKpis,
  type CashFlowBucket,
  type CumulativeGrowthPoint,
  type CategoryDataPoint,
  type AttributionItem,
  type ReturnTrendPoint,
  type MonthlyContribution,
} from "@/lib/services/analysis-service";
import type {
  NormalizedSnapshot,
  RawHistoryData,
  AccountMonthlyContribution,
} from "@/lib/services/history-service";

export interface AnalysisRangeSeries {
  buckets: MonthlyBucket[];
  kpis: AnalysisKpis;
  cashFlowBuckets: CashFlowBucket[];
  cumulativeGrowth: CumulativeGrowthPoint[];
  categoryHistory: CategoryDataPoint[];
  attributionItems: AttributionItem[];
  investmentReturnPct: number | null;
  returnTrend: ReturnTrendPoint[];
  rangeStartIso: string;
}

/**
 * Replicates the former client-side AnalysisView useMemo chain exactly, per
 * range, minus the drawdown series — that one is a plain scan over
 * `snapshots`, which the client receives in full anyway, so precomputing it
 * five times would ship the same points over and over.
 *
 * All inputs are the FULL datasets; range filtering happens inside
 * resolveAnalysisRange. `now` freezes at cache-fill time — accepted staleness
 * (same class as the rest of the cached payload). Pass one shared `now` for
 * the whole fill so every range resolves against the same instant.
 */
export function computeAnalysisRangeSeries(
  snapshots: NormalizedSnapshot[],
  rawHistory: RawHistoryData,
  cashFlowData: MonthlyContribution[],
  accountCashFlow: AccountMonthlyContribution[],
  rangeLabel: RangeLabel,
  locale: string,
  now = new Date(),
): AnalysisRangeSeries {
  const { filteredSnapshots, rangeStart, rangeEnd, rangeStartIso } = resolveAnalysisRange(
    snapshots,
    getMonthsForRange(rangeLabel),
    now,
  );

  const buckets = fillMonthRange(aggregateMonthlyChange(filteredSnapshots), rangeStart, rangeEnd);
  const kpis = computeKpis(buckets, snapshots);

  const cashFlowBuckets = buildCashFlowBuckets(
    buckets,
    cashFlowData.filter((c) => c.monthKey >= rangeStartIso.slice(0, 7)),
    locale,
  );
  const cumulativeGrowth = buildCumulativeGrowth(cashFlowBuckets);

  const filteredRawSnapshots = rawHistory.snapshots.filter((s) => s.date >= rangeStartIso);

  const realCategory = aggregateCategoryHistory(filteredRawSnapshots, rawHistory.accounts);
  const categoryByKey = new Map(realCategory.map((c) => [c.monthKey, c]));
  const categoryHistory = buckets.map((b) => {
    const existing = categoryByKey.get(b.monthKey);
    if (existing) return existing;
    return { monthKey: b.monthKey } as CategoryDataPoint;
  });

  const rangeStartMonthKey = rangeStartIso.slice(0, 7);
  const attributionItems = computePerformanceAttribution(
    filteredRawSnapshots,
    rawHistory.accounts,
    accountCashFlow,
    rangeStartMonthKey,
  );
  const investmentReturnPct = computeInvestmentReturn(
    filteredRawSnapshots,
    rawHistory.accounts,
    accountCashFlow,
    rangeStartMonthKey,
  );
  const returnTrend = computeInvestmentReturnSeries(
    filteredRawSnapshots,
    rawHistory.accounts,
    accountCashFlow,
    buckets.map((b) => b.monthKey),
    locale,
  );

  return {
    buckets,
    kpis,
    cashFlowBuckets,
    cumulativeGrowth,
    categoryHistory,
    attributionItems,
    investmentReturnPct,
    returnTrend,
    rangeStartIso,
  };
}

export function computeAllRangeSeries(
  snapshots: NormalizedSnapshot[],
  rawHistory: RawHistoryData,
  cashFlowData: MonthlyContribution[],
  accountCashFlow: AccountMonthlyContribution[],
  locale: string,
  now = new Date(),
): Record<RangeLabel, AnalysisRangeSeries> {
  const result = {} as Record<RangeLabel, AnalysisRangeSeries>;
  for (const { label } of ANALYSIS_RANGES) {
    result[label] = computeAnalysisRangeSeries(
      snapshots,
      rawHistory,
      cashFlowData,
      accountCashFlow,
      label,
      locale,
      now,
    );
  }
  return result;
}
