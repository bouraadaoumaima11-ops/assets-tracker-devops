import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buildScript = readFileSync(resolve(process.cwd(), "scripts/vercel-build.mjs"), "utf8");

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
});
