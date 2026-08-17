import { expect, test } from "@playwright/test";
import {
  authenticateAnalysisFixture,
  cleanupAnalysisFixture,
  E2E_MOBILE_EMAIL,
  hasAnalysisFixtureDatabase,
  seedAnalysisFixture,
} from "./analysis-fixture";

test("analysis #history deep link still renders HistoryView on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "Mobile Chrome", "Mobile-only #history tab.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisFixture(E2E_MOBILE_EMAIL);

  try {
    await authenticateAnalysisFixture(page.context(), fixture);
    await page.goto("/analysis#history");
    await expect(page.getByText("All Snapshots")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Net Worth Trend")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Movement/ })).toHaveCount(0);
  } finally {
    await cleanupAnalysisFixture(fixture);
  }
});
