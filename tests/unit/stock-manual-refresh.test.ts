import { describe, expect, it } from "vitest";
import { stockManualRefreshFeedback } from "@/lib/price-refresh-contract";

describe("stock manual refresh feedback", () => {
  it("classifies a total provider failure as an error, never a success toast", () => {
    expect(stockManualRefreshFeedback({ updated: 0, outcome: "total_failure" })).toBe("error");
  });

  it("keeps partial provider success on the successful refresh path", () => {
    expect(stockManualRefreshFeedback({ updated: 1, outcome: "partial_success" })).toBe("success");
  });
});
