import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The repo's unit suite runs in a Node environment (no jsdom / @testing-library),
// so we render the component to static markup and assert on the output HTML.
// next-intl is mocked the same way as other component tests (see
// tests/unit/quick-add-holding.test.ts), returning the English strings for the
// keys the grid uses so the badge text is assertable.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      earnings: "Earnings",
      earningsBadge: "Earnings on {count} stock(s)",
      beforeOpen: "Before open",
      afterClose: "After close",
      entryCount: "{count} entries",
      categorySummary: "Categories: {categories}",
      categoryCount: "{category}: {count}",
      today: "Today",
    };
    let value = dict[key] ?? key;
    if (values) {
      for (const [name, val] of Object.entries(values)) {
        value = value.replaceAll(`{${name}}`, String(val));
      }
    }
    return value;
  },
}));

import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import type { CalendarEarningsItem } from "@/lib/services/calendar-earnings-data";

function earningsItem(date: string, symbol: string): CalendarEarningsItem {
  return {
    date,
    symbol,
    name: `${symbol} Inc.`,
    session: "BMO",
    isEstimate: false,
    epsForward: 1.25,
  };
}

function renderGrid(earningsByDate?: ReadonlyMap<string, CalendarEarningsItem[]>) {
  return renderToStaticMarkup(
    createElement(CalendarMonthGrid, {
      month: "2026-08",
      selectedDate: "2026-08-12",
      today: "2026-08-20",
      entriesByDate: new Map(),
      locale: "en-US",
      onSelectDate: () => {},
      earningsByDate,
    }),
  );
}

describe("CalendarMonthGrid earnings badge", () => {
  it("renders an earnings badge with the count for a date that has earnings", () => {
    const html = renderGrid(
      new Map([
        ["2026-08-12", [earningsItem("2026-08-12", "AAPL"), earningsItem("2026-08-12", "MSFT")]],
      ]),
    );

    expect(html).toContain('aria-label="Earnings on 2 stock(s)"');
    expect(html).toContain("bg-chart-5/15");
  });

  it("shows the earnings label when a single stock reports", () => {
    const html = renderGrid(new Map([["2026-08-12", [earningsItem("2026-08-12", "AAPL")]]]));

    expect(html).toContain('aria-label="Earnings on 1 stock(s)"');
    expect(html).toContain('title="Earnings on 1 stock(s): AAPL (Before open)"');
    expect(html).toContain(">Earnings</span>");
  });

  it("does not render an earnings badge on dates without earnings", () => {
    const html = renderGrid(new Map([["2026-08-12", [earningsItem("2026-08-12", "AAPL")]]]));

    // Only the 2026-08-12 cell carries the badge; the other 41 cells do not.
    expect(html.match(/bg-chart-5\/15/g)).toHaveLength(1);
  });

  it("renders no earnings badge when the map is empty", () => {
    const html = renderGrid(new Map());

    expect(html).not.toContain("bg-chart-5/15");
    expect(html).not.toContain("Earnings on");
  });
});
