/** Stable client/server contract for a completed price refresh. */
export type PriceRefreshOutcome =
  | "no_due_symbols"
  | "deferred"
  | "success"
  | "partial_success"
  | "total_failure";

export type PriceRefreshPayload = {
  outcome?: PriceRefreshOutcome;
  updated?: number;
  changed?: number;
  skippedFresh?: number;
};

export function isTotalPriceRefreshFailure(outcome: PriceRefreshOutcome | undefined): boolean {
  return outcome === "total_failure";
}

/** Maps the stock refresh API contract to the user-visible manual-refresh state. */
export function stockManualRefreshFeedback(
  data: PriceRefreshPayload,
): "error" | "fresh" | "success" {
  if (isTotalPriceRefreshFailure(data.outcome)) return "error";
  return data.updated === 0 && (data.skippedFresh ?? 0) > 0 ? "fresh" : "success";
}
