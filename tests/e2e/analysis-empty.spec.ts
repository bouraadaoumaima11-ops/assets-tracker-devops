import { expect, test } from "@playwright/test";
import {
  authenticateAnalysisFixture,
  cleanupAnalysisEmptyFixture,
  hasAnalysisFixtureDatabase,
  seedAnalysisEmptyFixture,
  setAnalysisFixtureLocale,
} from "./analysis-fixture";

test("analysis renders the onboarding empty state for a user with no snapshots", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Analysis empty-state QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Empty Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisEmptyFixture();

  try {
    await authenticateAnalysisFixture(page.context(), fixture);
    await setAnalysisFixtureLocale(page.context(), "en-US");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/analysis");
    const emptyStateHeading = page.locator("h2:visible").filter({
      hasText: /^Build the base for real analysis$/,
    });
    await expect(emptyStateHeading).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: "Add account" }).first()).toBeVisible();
    await expect(page.getByText(/Snapshot /)).toHaveCount(0);
  } finally {
    await cleanupAnalysisEmptyFixture(fixture);
  }
});
