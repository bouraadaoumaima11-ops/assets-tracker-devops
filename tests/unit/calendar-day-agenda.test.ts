import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The repo's unit suite runs in a Node environment (no jsdom / @testing-library),
// so we render the component to static markup and assert on the output HTML.
// next-intl is mocked the same way as other component tests (see
// tests/unit/calendar-month-grid.test.ts), returning the English strings for
// the keys the agenda uses so the earnings section is assertable.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      entriesOnDate: "{count} entries on {date}",
      selectedDate: "Selected date",
      entryCount: "{count} entries",
      emptyTitle: "Nothing scheduled",
      emptyDescription: "Add a report, economic release, or reminder for this day.",
      keyboardHint: "Use arrow keys to move by day.",
      addEntry: "Add entry",
      allDay: "All day",
      source: "Open source",
      edit: "Edit",
      delete: "Delete",
      deleteTitle: "Delete calendar entry?",
      deleteDescription: 'This permanently removes "{title}".',
      deleteSuccess: "Calendar entry deleted",
      deleteFailure: "Calendar entry was not deleted. Try again.",
      saving: "Saving…",
      "categories.REMINDER": "Reminder",
      earningsSection: "Earnings",
      earnings: "Earnings",
      beforeOpen: "Before open",
      afterClose: "After close",
      estimate: "Estimate",
      cancel: "Cancel",
      deleting: "Deleting…",
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

import { CalendarDayAgenda } from "@/components/calendar/calendar-day-agenda";
import type { CalendarEarningsItem } from "@/lib/services/calendar-earnings-data";
import type { SerializedCalendarEntry } from "@/lib/types";

function earningsItem(
  symbol: string,
  overrides: Partial<CalendarEarningsItem> = {},
): CalendarEarningsItem {
  return {
    date: "2026-08-12",
    symbol,
    name: `${symbol} Inc.`,
    session: "BMO",
    isEstimate: false,
    epsForward: 1.25,
    ...overrides,
  };
}

function userEntry(id: string, title: string): SerializedCalendarEntry {
  return {
    id,
    userId: "user-1",
    title,
    eventDate: "2026-08-12",
    startTimeMinutes: null,
    timeZone: null,
    category: "REMINDER",
    description: null,
    sourceUrl: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function renderAgenda(earnings?: readonly CalendarEarningsItem[]) {
  return renderToStaticMarkup(
    createElement(CalendarDayAgenda, {
      date: "2026-08-12",
      entries: [userEntry("entry-1", "Team sync")],
      earnings,
      locale: "en-US",
      onAdd: () => {},
      onEdit: () => {},
      onDeleted: () => {},
    }),
  );
}

describe("CalendarDayAgenda earnings section", () => {
  it("renders a read-only earnings section with symbol, session label, and EPS", () => {
    const html = renderAgenda([
      earningsItem("AAPL", { session: "BMO", isEstimate: true, epsForward: 1.25 }),
      earningsItem("MSFT", { session: "AMC", epsForward: 2.5 }),
    ]);

    expect(html).toContain('aria-label="Earnings"');
    expect(html).toContain(">AAPL</span>");
    expect(html).toContain(">MSFT</span>");
    expect(html).toContain("Before open");
    expect(html).toContain("After close");
    expect(html).toContain("Estimate");
    expect(html).toContain("EPS 1.25");
    expect(html).toContain("EPS 2.5");
  });

  it("keeps the earnings section distinct from the user entries", () => {
    const html = renderAgenda([earningsItem("AAPL")]);

    // The user entry still renders with its own title and edit/delete actions…
    expect(html).toContain(">Team sync</h3>");
    expect(html).toContain(">Edit</button>");
    expect(html).toContain(">Delete</button>");
    // …while the earnings symbol only appears inside the earnings section.
    expect(html).toContain(">AAPL</span>");
    expect(html).toContain("Before open");
  });

  it("omits the session badge and EPS for UNKNOWN sessions with no forward EPS", () => {
    const html = renderAgenda([earningsItem("TSLA", { session: "UNKNOWN", epsForward: null })]);

    expect(html).toContain('aria-label="Earnings"');
    expect(html).toContain(">TSLA</span>");
    expect(html).not.toContain("Before open");
    expect(html).not.toContain("After close");
    expect(html).not.toContain("EPS ");
  });

  it("renders no earnings section when earnings is empty", () => {
    const html = renderAgenda([]);

    expect(html).not.toContain('aria-label="Earnings"');
    expect(html).not.toContain("Before open");
    expect(html).not.toContain(">AAPL</span>");
  });

  it("renders no earnings section when earnings is undefined", () => {
    const html = renderAgenda(undefined);

    expect(html).not.toContain('aria-label="Earnings"');
    expect(html).not.toContain("Before open");
    expect(html).not.toContain(">AAPL</span>");
  });
});
