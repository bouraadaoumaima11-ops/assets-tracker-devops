import "server-only";
import { unstable_cache } from "next/cache";
import {
  getAccountMonthlyCashFlow,
  getFullNormalizedHistory,
  getMonthlyCashFlow,
  getRawHistoryWithBreakdown,
} from "@/lib/services/history-service";
import { getInvestmentCostBasisSummary } from "@/lib/services/investment-cost-basis-service";
import { computeAllRangeSeries } from "@/lib/services/analysis-series-service";
import { pickDefaultRange } from "@/lib/analysis-range";
import type { AnalysisPayload, AnalysisPayloadMeta } from "@/lib/analysis-contract";

export async function getCachedAnalysisPayload(
  userId: string,
  baseCurrency: string,
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
          now,
        ),
        investmentCostBasis,
        snapshots,
        meta: {
          defaultRange: pickDefaultRange(snapshots, now),
        } satisfies AnalysisPayloadMeta,
      };
    },
    ["analysis-payload", userId, baseCurrency],
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
