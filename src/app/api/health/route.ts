import { prisma } from "@/lib/prisma";
import { rateLimitCheckWithPrune } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

/**
 * E17/E18 — Liveness/readiness probe.
 *
 * Unauthenticated by design (health checks must work without a session) but
 * rate-limited per IP so it can't be abused as a free DB-ping endpoint. Returns
 * only non-sensitive status: DB connectivity, the latest snapshot timestamp +
 * age, the latest successful cron run timestamp + age, and the response
 * timestamp. No user data is exposed.
 *
 * Four independent signals are reported and rolled up into `status`:
 *   - db       → DB reachability ("ok" / "error").
 *   - cron     → freshness of the latest *successful* CronRun (name "snapshot").
 *                This is the E18 pull-based alarm: it goes stale when no cron has
 *                succeeded within the freshness window — even if old snapshot
 *                rows still exist. Free-plan compatible (no extra cron needed).
 *   - snapshot → freshness of the most recent NetWorthSnapshot (the E17 signal).
 *   - priceCache → freshness of the newest cached market quote. Only aggregate
 *                   freshness metadata is exposed; no symbols, prices, or user
 *                   data leave this endpoint. An empty cache is valid for a new
 *                   or genuinely asset-free installation.
 *
 * Overall `status` is the worst of the four:
 *   - "unhealthy" → DB unreachable. HTTP 503.
 *   - "degraded"  → DB reachable but the cron OR the latest snapshot is
 *                   stale/absent (> 36 h). HTTP 503.
 *   - "ok"        → all applicable signals healthy. HTTP 200.
 *
 * The 36 h freshness window is shared across snapshot, cron, and prices so
 * the three freshness signals can't drift.
 */
const FRESHNESS_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/** CronRun.name written by /api/cron/snapshot. */
const SNAPSHOT_CRON_NAME = "snapshot";

export async function GET(request: Request) {
  const limited = rateLimitCheckWithPrune(request, { limit: 30, prefix: "health" });
  if (limited) return limited;

  const now = Date.now();

  let dbOk = false;
  let latestSnapshotAt: string | null = null;
  let snapshotAgeMs: number | null = null;
  let lastCronSuccessAt: string | null = null;
  let cronAgeMs: number | null = null;
  let latestPriceAt: string | null = null;
  let priceAgeMs: number | null = null;

  try {
    // Lightweight liveness check + most-recent snapshot freshness + latest
    // successful cron run, and newest PriceCache timestamp in one parallel
    // round. PriceCache.updatedAt has its own index, so the aggregate stays a
    // lightweight freshness probe rather than loading any market data.
    const [, latestSnapshot, latestCron, latestPrice] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.netWorthSnapshot.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.cronRun.findFirst({
        where: { name: SNAPSHOT_CRON_NAME, ok: true },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      }),
      prisma.priceCache.aggregate({
        _max: { updatedAt: true },
      }),
    ]);
    dbOk = true;
    if (latestSnapshot) {
      latestSnapshotAt = latestSnapshot.createdAt.toISOString();
      snapshotAgeMs = now - latestSnapshot.createdAt.getTime();
    }
    if (latestCron) {
      lastCronSuccessAt = latestCron.startedAt.toISOString();
      cronAgeMs = now - latestCron.startedAt.getTime();
    }
    if (latestPrice._max.updatedAt) {
      latestPriceAt = latestPrice._max.updatedAt.toISOString();
      priceAgeMs = now - latestPrice._max.updatedAt.getTime();
    }
  } catch (error) {
    log.error("health.db_unreachable", { error: String(error) });
  }

  const snapshotFresh = snapshotAgeMs !== null && snapshotAgeMs <= FRESHNESS_MAX_AGE_MS;
  const cronFresh = cronAgeMs !== null && cronAgeMs <= FRESHNESS_MAX_AGE_MS;
  const priceFresh = priceAgeMs === null || priceAgeMs <= FRESHNESS_MAX_AGE_MS;

  // An empty PriceCache is healthy for a new/asset-free installation; once it
  // has data, its newest quote must be within the same freshness window.
  const priceCache = !dbOk
    ? "unknown"
    : priceAgeMs === null
      ? "empty"
      : priceFresh
        ? "ok"
        : "stale";
  // Overall status is the worst of {db, cron, snapshot, priceCache}.
  const status = !dbOk ? "unhealthy" : snapshotFresh && cronFresh && priceFresh ? "ok" : "degraded";
  const httpStatus = status === "ok" ? 200 : 503;

  return Response.json(
    {
      status,
      db: dbOk ? "ok" : "error",
      cron: !dbOk ? "unknown" : cronFresh ? "ok" : "stale",
      snapshot: !dbOk ? "unknown" : snapshotFresh ? "ok" : "stale",
      priceCache,
      latestSnapshotAt,
      snapshotAgeMs,
      lastCronSuccessAt,
      cronAgeMs,
      latestPriceAt,
      priceAgeMs,
      timestamp: new Date(now).toISOString(),
    },
    { status: httpStatus },
  );
}
