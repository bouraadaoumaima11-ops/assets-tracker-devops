import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buildScript = readFileSync(resolve(process.cwd(), "scripts/vercel-build.mjs"), "utf8");
const earningsMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260820001418_add_calendar_earnings_watch/migration.sql",
  ),
  "utf8",
);

describe("Vercel Prisma migration recovery", () => {
  it("recovers only the known rolled-back calendar earnings migration before retrying deploy", () => {
    expect(buildScript).toContain(
      'const FAILED_CALENDAR_EARNINGS_MIGRATION = "20260820001418_add_calendar_earnings_watch"',
    );
    expect(buildScript).toContain('output.includes("Error: P3009")');
    expect(buildScript).toContain("output.includes(FAILED_CALENDAR_EARNINGS_MIGRATION)");
    expect(buildScript).toContain(
      'run("prisma", ["migrate", "resolve", "--rolled-back", FAILED_CALENDAR_EARNINGS_MIGRATION])',
    );
    expect(buildScript).toContain('run("prisma", ["migrate", "deploy"])');
  });

  it("is safe to rerun after the table, indexes, and foreign key were created before failure", () => {
    expect(earningsMigration).toContain('CREATE TABLE IF NOT EXISTS "CalendarEarningsWatch"');
    expect(earningsMigration).toContain(
      'CREATE INDEX IF NOT EXISTS "CalendarEarningsWatch_userId_idx"',
    );
    expect(earningsMigration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEarningsWatch_userId_symbol_key"',
    );
    expect(earningsMigration).toContain("IF NOT EXISTS (\n    SELECT 1\n    FROM pg_constraint");
  });
});
