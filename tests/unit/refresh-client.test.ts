import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("refreshMarketData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns error instead of an updated/fresh outcome for a total price refresh failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            prices: { updated: 0, changed: 0, outcome: "total_failure", fetchFailed: true },
            rates: { updated: 0, changed: 0, fetchFailed: false },
          },
        }),
      ),
    );
    const { refreshMarketData } = await import("@/lib/refresh-client");

    await expect(refreshMarketData()).resolves.toEqual({ status: "error" });
  });
});
