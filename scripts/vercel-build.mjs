import { spawnSync } from "node:child_process";

const FAILED_CALENDAR_EARNINGS_MIGRATION = "20260820001418_add_calendar_earnings_watch";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 1;
}

function recoverableMigrationFailure() {
  const result = spawnSync("prisma", ["migrate", "deploy"], {
    stdio: "pipe",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) throw result.error;

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  if (result.status === 0) return;

  if (output.includes("Error: P3009") && output.includes(FAILED_CALENDAR_EARNINGS_MIGRATION)) {
    console.warn(
      `[build:vercel] Recovering failed ${FAILED_CALENDAR_EARNINGS_MIGRATION} migration before retrying.`,
    );
    run("prisma", ["migrate", "resolve", "--rolled-back", FAILED_CALENDAR_EARNINGS_MIGRATION]);
    run("prisma", ["migrate", "deploy"]);
    return;
  }

  process.exit(result.status ?? 1);
}

// `prisma migrate deploy` is idempotent and must run before every deployment.
// A previous optimization skipped this step when the current commit did not
// add migration files and allowed migration failures to continue. That could
// publish a healthy-looking deployment against a stale schema, leaving every
// data-backed Server Component to fail at runtime.
if (process.env.SKIP_PRISMA_MIGRATE_DEPLOY !== "1") {
  recoverableMigrationFailure();
} else {
  console.warn("[build:vercel] SKIP_PRISMA_MIGRATE_DEPLOY=1 — skipping database migrations.\n");
}

// Always (re)generate the Prisma client before building. We can't rely on the
// `postinstall` hook here: Vercel restores node_modules from its build cache, so
// `pnpm install --frozen-lockfile` reports "Already up to date" and skips
// lifecycle scripts — and `src/generated/prisma/` is gitignored, so it isn't in
// the cache. Generating explicitly keeps the build correct on cold and warm caches.
run("prisma", ["generate"]);

run("next", ["build"]);
