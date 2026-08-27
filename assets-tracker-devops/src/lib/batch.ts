/**
 * Bounded-concurrency helpers for background jobs.
 *
 * The snapshot cron used to fan out with `Promise.all` / `Promise.allSettled`
 * over every user and every in-use currency at once (#641). That works until the
 * instance grows: N concurrent multi-query snapshot computations exhaust the
 * Neon pool, and N concurrent external FX fetches get the source IP throttled.
 * Neither has a natural upper bound, and the handler only has 60 s.
 */

/** Split `items` into fixed-size pages, so a job can bound how much it holds at once. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

/**
 * Run `fn` over `items` with at most `limit` calls in flight.
 *
 * Returns `PromiseSettledResult`s in input order — same contract as
 * `Promise.allSettled`, so a single failing item never aborts the rest and
 * callers can keep reporting per-item success/failure.
 */
export async function mapSettled<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (limit < 1) throw new Error("concurrency limit must be >= 1");
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  // Shared cursor rather than fixed slices: one slow item can't leave a whole
  // worker's tail idle while other workers have already drained.
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
