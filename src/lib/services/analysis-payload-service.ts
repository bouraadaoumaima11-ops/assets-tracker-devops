import "server-only";
import { unstable_cache } from "next/cache";
import {
  getAccountMonthlyCashFlow,
  getFullNormalizedHistory,
  getMonthlyCashFlow,
  getRawHistoryWithBreakdown,
  type NormalizedSnapshot,
} from "@/lib/services/history-service";
import { getInvestmentCostBasisSummary } from "@/lib/services/investment-cost-basis-service";
import {
  computeAllRangeSeries,
  type AnalysisRangeSeries,
} from "@/lib/services/analysis-series-service";
import { pickDefaultRange, type RangeLabel } from "@/components/analysis/analysis-range";
import type { InvestmentCostBasisSummary } from "@/lib/services/analysis-service";

export interface AnalysisPayloadMeta {
  hasSnapshots: boolean;
  latestSnapshotAt: string | null;
  defaultRange: RangeLabel;
}

export interface AnalysisPayload {
  seriesByRange: Record<RangeLabel, AnalysisRangeSeries>;
  investmentCostBasis: InvestmentCostBasisSummary;
  /** Full normalized history — used by the mobile #history tab (HistoryView). */
  snapshots: NormalizedSnapshot[];
  meta: AnalysisPayloadMeta;
}

export async function getCachedAnalysisPayload(
  userId: string,
  baseCurrency: string,
  locale: string,
): Promise<AnalysisPayload> {
  return unstable_cache(
    async () => {
      const [snapshots, cashFlowData, rawHistory, accountCashFlow, investmentCostBasis] =
        await Promise.all([
          getFullNormalizedHistory(userId, baseCurrency),
          getMonthlyCashFlow(userId, baseCurrency),
          getRawHistoryWithBreakdown(userId, baseCurrency),
          getAccountMonthlyCashFlow(userId, baseCurrency),
          getInvestmentCostBasisSummary(userId, baseCurrency),
        ]);

      // One clock reading for the whole fill: every range and the default
      // range must agree on "now", even when a fill straddles midnight.
      const now = new Date();

      return {
        seriesByRange: computeAllRangeSeries(
          snapshots,
          rawHistory,
          cashFlowData,
          accountCashFlow,
          locale,
          now,
        ),
        investmentCostBasis,
        snapshots,
        meta: {
          hasSnapshots: snapshots.length > 0,
          latestSnapshotAt: snapshots.at(-1)?.createdAt ?? null,
          defaultRange: pickDefaultRange(snapshots, now),
        },
      };
    },
    ["analysis-payload", userId, baseCurrency, locale],
    {
      revalidate: 300,
      // All bundled reads convert at current FX (getAllExchangeRates +
      // resolveRate), so an FX refresh must be able to invalidate this composite.
      tags: [
        "net-worth",
        "snapshots",
        "exchange-rates",
        "prices",
        `history:${userId}`,
        `accounts:${userId}`,
      ],
    },
  )();
}
