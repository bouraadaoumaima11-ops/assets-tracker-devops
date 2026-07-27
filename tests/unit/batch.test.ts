import { describe, it, expect } from "vitest";
import { chunk, mapSettled } from "@/lib/batch";

describe("chunk", () => {
  it("splits into fixed-size pages, last page short", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no pages for an empty input", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("rejects a nonsensical size rather than looping forever", () => {
    expect(() => chunk([1], 0)).toThrow(/size must be >= 1/);
  });
});

describe("mapSettled", () => {
  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapSettled(
      Array.from({ length: 30 }, (_, i) => i),
      4,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
      },
    );

    expect(peak).toBeLessThanOrEqual(4);
    // Guard against the cap being applied so aggressively it serialises: with 30
    // items and a limit of 4 the pool should genuinely saturate.
    expect(peak).toBe(4);
  });

  it("returns results in input order, not completion order", async () => {
    const results = await mapSettled([30, 1, 20, 2], 4, async (delay) => {
      await new Promise((r) => setTimeout(r, delay));
      return delay;
    });

    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([30, 1, 20, 2]);
  });

  it("isolates failures — same contract as Promise.allSettled", async () => {
    const results = await mapSettled([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(results[1].status === "rejected" && String(results[1].reason)).toContain("boom");
  });

  it("keeps draining after a failure instead of stopping the pool", async () => {
    const seen: number[] = [];

    await mapSettled([1, 2, 3, 4, 5], 1, async (n) => {
      seen.push(n);
      if (n <= 2) throw new Error("early failure");
      return n;
    });

    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles an empty input without hanging", async () => {
    await expect(mapSettled([], 4, async () => 1)).resolves.toEqual([]);
  });

  it("rejects a nonsensical limit rather than hanging on zero workers", async () => {
    await expect(mapSettled([1], 0, async () => 1)).rejects.toThrow(/limit must be >= 1/);
  });
});
