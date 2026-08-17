import { expect, test } from "@playwright/test";
import {
  cleanupAnalysisFixture,
  authenticateAnalysisFixture,
  hasAnalysisFixtureDatabase,
  seedAnalysisFixture,
  setAnalysisFixtureLocale,
} from "./analysis-fixture";

test.describe.configure({ mode: "serial" });

test("analysis renders populated desktop charts without layout overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Populated Analysis QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");

  const fixture = await seedAnalysisFixture();

  try {
    await authenticateAnalysisFixture(page.context(), fixture);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/analysis");

    await expect(page.getByText("Assets vs. Liabilities by Month")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Latest snapshot vs. Jan 1")).toBeVisible();
    // Section headings carry the active range as a suffix (e.g. "Composition YTD"),
    // so anchor at the start to avoid matching "Cash Flow Decomposition".
    await expect(page.getByRole("heading", { name: /^Movement/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Composition/ })).toBeVisible();
    await expect(page.getByText("Performance Attribution")).toBeVisible();

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("Showing top 5 of 7 categories by latest value.")).toBeVisible();
    await page.getByRole("button", { name: "YTD", exact: true }).click();
    await expect(page.getByRole("button", { name: "YTD", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const layout = await page.evaluate(() => {
      const documentElement = document.documentElement;
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="card"]')).map(
        (card) => {
          const rect = card.getBoundingClientRect();
          return {
            text: card.textContent ?? "",
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        },
      );

      function cardHeight(title: string) {
        return cards.find((card) => card.text.includes(title))?.height ?? 0;
      }

      return {
        chartCount: document.querySelectorAll(".recharts-surface").length,
        hasHorizontalOverflow: documentElement.scrollWidth > documentElement.clientWidth,
        movementHeightDiff: Math.abs(
          cardHeight("Cash Flow Decomposition") - cardHeight("Cumulative Growth"),
        ),
        compositionHeightDiff: Math.abs(
          cardHeight("Category Trend") - cardHeight("Performance Attribution"),
        ),
      };
    });

    expect(layout.hasHorizontalOverflow).toBeFalsy();
    expect(layout.chartCount).toBeGreaterThanOrEqual(5);
    expect(layout.movementHeightDiff).toBeLessThanOrEqual(8);
    expect(layout.compositionHeightDiff).toBeLessThanOrEqual(8);

    await testInfo.attach("analysis-populated-desktop", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await cleanupAnalysisFixture(fixture);
  }
});

function oldestMonthLabel(snapshotDates: readonly string[], locale: string): string {
  const oldestDate = snapshotDates[0];
  if (!oldestDate) throw new Error("Analysis fixture must contain at least one snapshot date.");
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
    new Date(`${oldestDate}T00:00:00.000Z`),
  );
}

test("analysis falls back to the server default range for an unknown persisted range", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Populated Analysis QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisFixture();

  try {
    await authenticateAnalysisFixture(page.context(), fixture);
    await setAnalysisFixtureLocale(page.context(), "en-US");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      sessionStorage.setItem("asset-tracker:range:analysis-view", "BOGUS_RANGE"),
    );
    await page.goto("/analysis");
    await expect(page.getByRole("heading", { name: /^Movement/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
    const pressedName = await page.getByRole("button", { pressed: true }).innerText();
    expect(pressedName).toBe(fixture.expectedDefaultRange);
  } finally {
    await cleanupAnalysisFixture(fixture);
  }
});

test("renders English month labels from the locale-independent payload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Populated Analysis QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisFixture();

  try {
    await authenticateAnalysisFixture(page.context(), fixture);
    await setAnalysisFixtureLocale(page.context(), "en-US");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      sessionStorage.setItem("asset-tracker:range:analysis-view", "All"),
    );
    await page.goto("/analysis");
    const cashFlowCard = page
      .locator('[data-slot="card"]')
      .filter({
        has: page.getByRole("heading", { name: "Cash Flow Decomposition", exact: true }),
      })
      .first();
    await expect(
      cashFlowCard.getByRole("heading", { name: "Cash Flow Decomposition", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      cashFlowCard.locator("svg").getByText(oldestMonthLabel(fixture.snapshotDates, "en-US"), {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await cleanupAnalysisFixture(fixture);
  }
});

test("renders Traditional Chinese month labels from the same locale-independent payload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Populated Analysis QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisFixture();

  try {
    await authenticateAnalysisFixture(page.context(), fixture);
    await setAnalysisFixtureLocale(page.context(), "zh-TW");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      sessionStorage.setItem("asset-tracker:range:analysis-view", "All"),
    );
    await page.goto("/analysis");
    const cashFlowCard = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "現金流分解", exact: true }) })
      .first();
    await expect(
      cashFlowCard.locator("svg").getByText(oldestMonthLabel(fixture.snapshotDates, "zh-TW"), {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await cleanupAnalysisFixture(fixture);
  }
});
