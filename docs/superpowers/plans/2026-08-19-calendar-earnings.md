# Calendar US Earnings Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only earnings-date overlay to the calendar, driven by a per-user stock watch list (tracked stocks + manual search), fetched from Yahoo Finance and mapped onto Taiwan calendar days.

**Architecture:** A new `CalendarEarningsWatch` table stores which symbols a user wants earnings shown for. A server service reads those symbols, calls the existing Yahoo `quote()` path, filters earnings dates into the visible calendar range, and maps each to the Taiwan calendar day (BMO → same day, AMC → next day). The calendar page passes the resulting `Map<date, EarningsItem[]>` down to the grid and day agenda as read-only overlay props.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, PostgreSQL, yahoo-finance2 v3, next/cache (`cacheTag`/`cacheLife`).

## Global Constraints

- No new dependencies. Use the existing `getYahooClient()` and its `quote()` method (same path as `fetchYahooQuotes`).
- No type suppression (`as any`, `@ts-ignore`, `@ts-expect-error`). Strict types.
- Read-only overlay: earnings data is **never** written to `CalendarEntry` and is not editable/deletable by the user.
- Follow existing cache pattern: `"use cache"` + `cacheTag` + `cacheLife("hours")` like `getCalendarEntriesInRange` / `getCachedTrackedStocks`.
- Business day / Taiwan timezone: use `taiwanCalendarDay` (UTC+8) semantics. Earnings mapped per the spec's BMO/AMC rules.
- Match repo commit style: `feat(calendar): ...`, `fix(calendar): ...`, `test(...)`. English messages.
- Tests paired with implementation in the same commit.

---

### Task 1: Add `CalendarEarningsWatch` Prisma model + migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: migration under `prisma/migrations/`

**Interfaces:**

- Produces: Prisma model `CalendarEarningsWatch` with fields `id, userId, user, symbol, name, source, createdAt`, `@@unique([userId, symbol])`, `@@index([userId])`.

- [ ] **Step 1: Add the model to schema.prisma**

Add after the `CalendarEntry` model (around line 328):

```prisma
model CalendarEarningsWatch {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol    String
  name      String
  source    String   @default("tracked")
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@unique([userId, symbol])
  @@index([userId])
}
```

- [ ] **Step 2: Add the relation to the `User` model**

In the `User` model, add a relation field alongside `calendarEntries`:

```prisma
  calendarEarningsWatch CalendarEarningsWatch[]
```

- [ ] **Step 3: Create and apply the migration**

Run: `pnpm exec prisma migrate dev --name add_calendar_earnings_watch`
Expected: migration created and applied; `pnpm exec prisma generate` runs automatically.

- [ ] **Step 4: Verify**

Run: `pnpm exec prisma validate` and `pnpm exec tsc --noEmit`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(calendar): add earnings watch model"
```

---

### Task 2: Taiwan-day earnings mapping util

**Files:**

- Create: `src/lib/calendar-earnings.ts`
- Test: `tests/unit/calendar-earnings.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `export type EarningsSession = "BMO" | "AMC" | "UNKNOWN";`
  - `export function mapEarningsTimestampToTaiwanDay(timestamp: Date): { date: string; session: EarningsSession }` — returns the Taiwan calendar date (`YYYY-MM-DD`) and the derived session.
  - `export function deriveSessionFromCallTime(callStart: Date): EarningsSession` — BMO if the call is before ~12:00 ET, else AMC.

**Logic (from spec):**

- Session derived from `earningsCallTimestampStart` ET hour: < 12:00 ET → BMO; else AMC. Missing → UNKNOWN.
- BMO → same Taiwan day as the ET date. AMC → Taiwan **next** day. UNKNOWN → Taiwan day of the ET date (conservative).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/calendar-earnings.test.ts
import { describe, expect, it } from "vitest";
import {
  deriveSessionFromCallTime,
  mapEarningsTimestampToTaiwanDay,
} from "@/lib/calendar-earnings";

describe("mapEarningsTimestampToTaiwanDay", () => {
  it("maps a BMO call to the same Taiwan day", () => {
    // Thu 2026-08-20 08:00 ET = 20:00 Taipei same day
    const call = new Date("2026-08-20T12:00:00.000Z"); // 08:00 ET (EDT)
    const { date, session } = mapEarningsTimestampToTaiwanDay(call);
    expect(session).toBe("BMO");
    expect(date).toBe("2026-08-20");
  });

  it("maps an AMC call to the next Taiwan day", () => {
    // Thu 2026-08-20 16:00 ET = Fri 2026-08-21 04:00 Taipei
    const call = new Date("2026-08-20T20:00:00.000Z"); // 16:00 ET (EDT)
    const { date, session } = mapEarningsTimestampToTaiwanDay(call);
    expect(session).toBe("AMC");
    expect(date).toBe("2026-08-21");
  });

  it("maps a date-only timestamp (no call time) conservatively to same Taiwan day", () => {
    const ts = new Date("2026-08-20T00:00:00.000Z");
    const { date, session } = mapEarningsTimestampToTaiwanDay(ts);
    expect(session).toBe("UNKNOWN");
    expect(date).toBe("2026-08-20");
  });

  it("crosses the year boundary", () => {
    // Tue 2026-12-29 16:00 ET = Wed 2026-12-30 05:00 Taipei
    const call = new Date("2026-12-29T21:00:00.000Z");
    const { date } = mapEarningsTimestampToTaiwanDay(call);
    expect(date).toBe("2026-12-30");
  });
});

describe("deriveSessionFromCallTime", () => {
  it("returns BMO for a pre-market call", () => {
    expect(deriveSessionFromCallTime(new Date("2026-08-20T12:00:00.000Z"))).toBe("BMO");
  });
  it("returns AMC for an after-market call", () => {
    expect(deriveSessionFromCallTime(new Date("2026-08-20T20:00:00.000Z"))).toBe("AMC");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/calendar-earnings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/calendar-earnings.ts
const DAY_MS = 86_400_000;

export type EarningsSession = "BMO" | "AMC" | "UNKNOWN";

/** Taiwan calendar day (UTC+8, no DST) — same as taiwanCalendarDay. */
const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000;

function taiwanDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + TAIWAN_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** True if `when` falls before noon Eastern Time (i.e. a pre-market call). */
export function deriveSessionFromCallTime(callStart: Date): EarningsSession {
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(callStart),
  );
  return etHour < 12 ? "BMO" : "AMC";
}

export function mapEarningsTimestampToTaiwanDay(timestamp: Date): {
  date: string;
  session: EarningsSession;
} {
  // The timestamp's ET calendar day.
  const etDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(timestamp)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const etDateKey = `${etDay.year}-${etDay.month}-${etDay.day}`;
  const etMidnight = new Date(`${etDateKey}T00:00:00.000Z`);
  // No call time → treat the ET day as the Taiwan day (conservative).
  return {
    date: taiwanDateKey(etMidnight),
    session: "UNKNOWN",
  };
}
```

- [ ] **Step 4: Add the session-aware mapping helper**

The core `mapEarningsTimestampToTaiwanDay` above handles the UNKNOWN case. Now add the BMO/AMC-aware variant used by the service:

```ts
// Append to src/lib/calendar-earnings.ts
export function mapEarningsCallToTaiwanDay(callStart: Date): {
  date: string;
  session: EarningsSession;
} {
  const session = deriveSessionFromCallTime(callStart);
  // AMC moves to the next Taiwan day (ET after-hours = Taiwan early next day).
  const shift = session === "AMC" ? DAY_MS : 0;
  const shifted = new Date(callStart.getTime() + shift);
  return { date: taiwanDateKey(shifted), session };
}
```

- [ ] **Step 5: Update the test to cover `mapEarningsCallToTaiwanDay`**

Replace the `mapEarningsTimestampToTaiwanDay` AMC and BMO cases in the test to use `mapEarningsCallToTaiwanDay`, keeping the UNKNOWN case on `mapEarningsTimestampToTaiwanDay`. The year-boundary and session tests stay.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/calendar-earnings.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendar-earnings.ts tests/unit/calendar-earnings.test.ts
git commit -m "feat(calendar): map earnings calls to Taiwan calendar days"
```

---

### Task 3: Earnings watch CRUD service

**Files:**

- Create: `src/lib/services/calendar-earnings-service.ts`
- Test: `tests/unit/calendar-earnings-service.test.ts`

**Interfaces:**

- Consumes: Prisma `CalendarEarningsWatch`.
- Produces:
  - `export type SerializedCalendarEarningsWatch = { id: string; symbol: string; name: string; source: "tracked" | "manual"; }`
  - `export async function getCalendarEarningsWatch(userId: string): Promise<SerializedCalendarEarningsWatch[]>`
  - `export async function addCalendarEarningsWatch(userId: string, input: { symbol: string; name: string; source: "tracked" | "manual" }): Promise<SerializedCalendarEarningsWatch>`
  - `export async function removeCalendarEarningsWatch(userId: string, symbol: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Use a mock of `prisma` following the existing service-test style in `tests/unit/calendar-entry-service.test.ts`. For the CRUD service, test the serialize + add/remove logic with a mocked `prisma.calendarEarningsWatch`.

```ts
// tests/unit/calendar-earnings-service.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  addCalendarEarningsWatch,
  getCalendarEarningsWatch,
  removeCalendarEarningsWatch,
  serializeCalendarEarningsWatch,
} from "@/lib/services/calendar-earnings-service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEarningsWatch: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
const mock = prisma.calendarEarningsWatch as {
  findMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

describe("calendar earnings watch", () => {
  it("serializes a row", () => {
    const row = {
      id: "1",
      userId: "u",
      symbol: "AAPL",
      name: "Apple",
      source: "tracked",
      createdAt: new Date(),
    };
    expect(serializeCalendarEarningsWatch(row)).toEqual({
      id: "1",
      symbol: "AAPL",
      name: "Apple",
      source: "tracked",
    });
  });

  it("adds via upsert to dedupe", async () => {
    mock.upsert.mockResolvedValue({
      id: "1",
      userId: "u",
      symbol: "AAPL",
      name: "Apple",
      source: "manual",
      createdAt: new Date(),
    });
    const result = await addCalendarEarningsWatch("u", {
      symbol: "AAPL",
      name: "Apple",
      source: "manual",
    });
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_symbol: { userId: "u", symbol: "AAPL" } },
        create: expect.objectContaining({
          userId: "u",
          symbol: "AAPL",
          name: "Apple",
          source: "manual",
        }),
        update: expect.objectContaining({ name: "Apple" }),
      }),
    );
    expect(result.symbol).toBe("AAPL");
  });

  it("removes a watch row", async () => {
    mock.deleteMany.mockResolvedValue({ count: 1 });
    await removeCalendarEarningsWatch("u", "AAPL");
    expect(mock.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u", symbol: "AAPL" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/calendar-earnings-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/services/calendar-earnings-service.ts
import "server-only";
import { cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { AuthPrincipal } from "@/lib/auth-principal";
import { invalidateScopedTag } from "@/lib/demo/demo-cache";

export type SerializedCalendarEarningsWatch = {
  id: string;
  symbol: string;
  name: string;
  source: "tracked" | "manual";
};

export function serializeCalendarEarningsWatch(row: {
  id: string;
  symbol: string;
  name: string;
  source: string;
}): SerializedCalendarEarningsWatch {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    source: row.source === "manual" ? "manual" : "tracked",
  };
}

export async function getCalendarEarningsWatch(
  userId: string,
): Promise<SerializedCalendarEarningsWatch[]> {
  "use cache";
  cacheTag("calendar-earnings");
  cacheTag(`calendar-earnings:${userId}`);
  const rows = await prisma.calendarEarningsWatch.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
  });
  return rows.map(serializeCalendarEarningsWatch);
}

export async function addCalendarEarningsWatch(
  userId: string,
  input: { symbol: string; name: string; source: "tracked" | "manual" },
): Promise<SerializedCalendarEarningsWatch> {
  const row = await prisma.calendarEarningsWatch.upsert({
    where: { userId_symbol: { userId, symbol: input.symbol } },
    create: { userId, symbol: input.symbol, name: input.name, source: input.source },
    update: { name: input.name },
  });
  return serializeCalendarEarningsWatch(row);
}

export function invalidateCalendarEarningsCaches(userId: string, principal: AuthPrincipal) {
  invalidateScopedTag({
    globalTag: "calendar-earnings",
    userTag: `calendar-earnings:${userId}`,
    principal,
  });
}
```

- [ ] **Step 4: Add the remove function**

```ts
// Append to src/lib/services/calendar-earnings-service.ts
export async function removeCalendarEarningsWatch(userId: string, symbol: string): Promise<void> {
  await prisma.calendarEarningsWatch.deleteMany({ where: { userId, symbol } });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/calendar-earnings-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/calendar-earnings-service.ts tests/unit/calendar-earnings-service.test.ts
git commit -m "feat(calendar): add earnings watch CRUD service"
```

---

### Task 4: `getCalendarEarnings` service (quote fetch + filter + map)

**Files:**

- Create: `src/lib/services/calendar-earnings-data.ts`
- Test: `tests/unit/calendar-earnings-data.test.ts`

**Interfaces:**

- Consumes: `getYahooClient` from `@/lib/services/yahoo-client`, `mapEarningsCallToTaiwanDay` / `mapEarningsTimestampToTaiwanDay` from `@/lib/calendar-earnings`, `getCalendarEarningsWatch` from Task 3.
- Produces:
  - `export type CalendarEarningsItem = { date: string; symbol: string; name: string; session: "BMO" | "AMC" | "UNKNOWN"; isEstimate: boolean; epsForward: number | null; }`
  - `export async function getCalendarEarnings(userId: string, from: string, to: string): Promise<CalendarEarningsItem[]>`

**Logic:**

- Read watch symbols via `getCalendarEarningsWatch(userId)`.
- Call `yahooFinance.quote(symbols)`.
- For each quote: prefer `earningsCallTimestampStart`; fall back to `earningsTimestamp`.
- Map to Taiwan day; keep only days in `[from, to]`.
- Return `Map<date, item[]>`.

- [ ] **Step 1: Write the failing test**

Mock `getYahooClient` to return a stub client with `quote()`. Test filtering and mapping, and the no-quotes case.

```ts
// tests/unit/calendar-earnings-data.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  getCalendarEarnings,
  type CalendarEarningsItem,
} from "@/lib/services/calendar-earnings-data";

const quoteStub = vi.fn();
vi.mock("@/lib/services/yahoo-client", () => ({
  getYahooClient: () => Promise.resolve({ quote: quoteStub }),
}));

vi.mock("@/lib/services/calendar-earnings-service", () => ({
  getCalendarEarningsWatch: async () => [
    { id: "1", symbol: "AAPL", name: "Apple", source: "tracked" },
    { id: "2", symbol: "MSFT", name: "Microsoft", source: "manual" },
  ],
}));

describe("getCalendarEarnings", () => {
  it("returns earnings mapped to Taiwan days within range", async () => {
    quoteStub.mockResolvedValue([
      { symbol: "AAPL", earningsCallTimestampStart: new Date("2026-08-20T20:00:00.000Z") }, // AMC -> 08-21
      { symbol: "MSFT", earningsTimestamp: new Date("2026-08-20T00:00:00.000Z") }, // UNKNOWN -> 08-20
    ]);
    const result = await getCalendarEarnings("u", "2026-08-01", "2026-08-31");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "AAPL", date: "2026-08-21", session: "AMC" }),
        expect.objectContaining({ symbol: "MSFT", date: "2026-08-20", session: "UNKNOWN" }),
      ]),
    );
  });

  it("drops earnings outside the range", async () => {
    quoteStub.mockResolvedValue([
      { symbol: "AAPL", earningsTimestamp: new Date("2026-09-15T00:00:00.000Z") },
    ]);
    const result = await getCalendarEarnings("u", "2026-08-01", "2026-08-31");
    expect(result).toEqual([]);
  });

  it("returns empty when no quotes", async () => {
    quoteStub.mockResolvedValue([]);
    const result = await getCalendarEarnings("u", "2026-08-01", "2026-08-31");
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/calendar-earnings-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/services/calendar-earnings-data.ts
import "server-only";
import { cacheTag, cacheLife } from "next/cache";
import { getYahooClient } from "@/lib/services/yahoo-client";
import { getCalendarEarningsWatch } from "@/lib/services/calendar-earnings-service";
import {
  mapEarningsCallToTaiwanDay,
  mapEarningsTimestampToTaiwanDay,
  type EarningsSession,
} from "@/lib/calendar-earnings";

export type CalendarEarningsItem = {
  date: string;
  symbol: string;
  name: string;
  session: EarningsSession;
  isEstimate: boolean;
  epsForward: number | null;
};

export async function getCalendarEarnings(
  userId: string,
  from: string,
  to: string,
): Promise<CalendarEarningsItem[]> {
  "use cache";
  cacheTag(`calendar-earnings:${userId}`);
  cacheLife("hours");

  const watch = await getCalendarEarningsWatch(userId);
  const symbols = watch.map((w) => w.symbol);
  if (symbols.length === 0) return [];

  const yahooFinance = await getYahooClient();
  const quotes = await yahooFinance.quote(symbols);
  const list = Array.isArray(quotes) ? quotes : [quotes];

  const items: CalendarEarningsItem[] = [];
  for (const q of list) {
    if (!q?.symbol) continue;
    const name = watch.find((w) => w.symbol === q.symbol)?.name ?? q.symbol;
    const callStart = q.earningsCallTimestampStart;
    const mapped = callStart
      ? mapEarningsCallToTaiwanDay(callStart)
      : mapEarningsTimestampToTaiwanDay(q.earningsTimestamp ?? new Date(0));
    if (mapped.date < from || mapped.date > to) continue;
    items.push({
      date: mapped.date,
      symbol: q.symbol,
      name,
      session: mapped.session,
      isEstimate: q.isEarningsDateEstimate ?? false,
      epsForward: typeof q.epsForward === "number" ? q.epsForward : null,
    });
  }
  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/calendar-earnings-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/calendar-earnings-data.ts tests/unit/calendar-earnings-data.test.ts
git commit -m "feat(calendar): fetch and map earnings data for the calendar"
```

---

### Task 5: Calendar page wiring (pass earnings overlay to view)

**Files:**

- Modify: `src/app/(main)/calendar/page.tsx`
- Modify: `src/components/calendar/calendar-view.tsx`

**Interfaces:**

- Consumes: `getCalendarEarnings` from Task 4.
- Produces:
  - `CalendarView` gains a `earningsByDate?: ReadonlyMap<string, CalendarEarningsItem[]>` prop (default `undefined` → no overlay).
  - Passes `earningsByDate` down to `CalendarMonthGrid` and `CalendarDayAgenda`.

- [ ] **Step 1: Update the calendar page to fetch and group earnings**

In `src/app/(main)/calendar/page.tsx`, add earnings fetching to the existing `Promise.all`:

```tsx
import {
  getCalendarEarnings,
  type CalendarEarningsItem,
} from "@/lib/services/calendar-earnings-data";

// inside the existing Promise.all
const [messages, locale, entries, earnings] = await Promise.all([
  getMessages(),
  getLocale(),
  getCalendarEntriesInRange(session.user.id, parseDateOnly(from)!, parseDateOnly(to)!),
  getCalendarEarnings(session.user.id, from, to),
]);
```

`getCalendarEarnings` returns a flat `CalendarEarningsItem[]` where each item already carries its mapped `date`. Group into a `Map` keyed by date:

```tsx
const earningsByDate = new Map<string, CalendarEarningsItem[]>();
for (const item of earnings) {
  const day = earningsByDate.get(item.date) ?? [];
  day.push(item);
  earningsByDate.set(item.date, day);
}
```

Then pass to `<CalendarView ... earningsByDate={earningsByDate} />`.

- [ ] **Step 2: Add the prop to `CalendarView`**

In `src/components/calendar/calendar-view.tsx`:

```tsx
type CalendarViewProps = {
  // ...existing
  earningsByDate?: ReadonlyMap<string, CalendarEarningsItem[]>;
};

export function CalendarView({ /* ... */ earningsByDate }: CalendarViewProps) {
  // pass to children
}
```

Pass `earningsByDate={earningsByDate}` to `CalendarMonthGrid`, and `earnings={earningsByDate?.get(effectiveDate) ?? []}` to `CalendarDayAgenda`.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/calendar/page.tsx src/components/calendar/calendar-view.tsx src/lib/services/calendar-earnings-data.ts
git commit -m "feat(calendar): pass earnings overlay into the calendar view"
```

---

### Task 6: Earnings badge on month grid cells

**Files:**

- Modify: `src/components/calendar/calendar-month-grid.tsx`
- Modify: `src/components/calendar/calendar-view-model.ts` (optional helper)
- Test: `tests/unit/calendar-month-grid.test.tsx`

**Interfaces:**

- Consumes: `earningsByDate?: ReadonlyMap<string, CalendarEarningsItem[]>` prop on `CalendarMonthGrid`.
- Produces: a `財報` badge rendered on cells that have earnings, visually distinct from `CalendarCategoryBadge`.

- [ ] **Step 1: Add the prop and render the badge**

In `src/components/calendar/calendar-month-grid.tsx`:

```tsx
type CalendarMonthGridProps = {
  // ...existing
  earningsByDate?: ReadonlyMap<string, CalendarEarningsItem[]>;
};

// inside the day-cell button, near the existing entries badge:
{
  dayEarnings.length > 0 && (
    <span
      aria-label={t("earningsBadge", { count: dayEarnings.length })}
      className="mt-auto inline-flex items-center gap-1 rounded-full bg-chart-5/15 px-1.5 py-0.5 text-[10px] font-medium text-chart-5"
    >
      <CalendarIcon className="size-2.5" />
      {dayEarnings.length > 1 ? dayEarnings.length : t("earnings")}
    </span>
  );
}
```

Where `dayEarnings = earningsByDate?.get(date) ?? []`.

- [ ] **Step 2: Add the i18n keys**

In `messages/en-US.json` and `messages/zh-TW.json` under `calendar`:

- `earnings`: `"Earnings"` / `"財報"`
- `earningsBadge`: `"Earnings on {count} stock(s)"` / `"{count} 檔財報"`

- [ ] **Step 3: Write a unit test**

Verify the component renders the earnings badge for a date that has earnings and does not for one that does not. Follow the existing grid test style; render with a `earningsByDate` prop.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run tests/unit/calendar-month-grid.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/calendar-month-grid.tsx messages/ tests/unit/calendar-month-grid.test.tsx
git commit -m "feat(calendar): show earnings badge on day cells"
```

---

### Task 7: Read-only earnings section in day agenda

**Files:**

- Modify: `src/components/calendar/calendar-day-agenda.tsx`
- Test: `tests/unit/calendar-day-agenda.test.tsx`

**Interfaces:**

- Consumes: `earnings?: readonly CalendarEarningsItem[]` prop on `CalendarDayAgenda`.
- Produces: a read-only "Earnings" section rendered above/below the user entries, showing `symbol · session · EPS estimate`, not editable.

- [ ] **Step 1: Add the prop and render the section**

In `src/components/calendar/calendar-day-agenda.tsx`:

```tsx
type CalendarDayAgendaProps = {
  // ...existing
  earnings?: readonly CalendarEarningsItem[];
};
```

Render a distinct read-only block when `earnings.length > 0`:

```tsx
{
  earnings && earnings.length > 0 && (
    <section aria-label={t("earningsSection")} className="border-b px-4 py-3">
      <h3 className="text-xs font-semibold text-chart-5">{t("earnings")}</h3>
      <ul className="mt-2 space-y-2">
        {earnings.map((e) => (
          <li key={e.symbol} className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold">{e.symbol}</span>
            <span className="text-muted-foreground">{e.name}</span>
            <Badge variant="secondary">{sessionLabel(e.session)}</Badge>
            {e.isEstimate && <Badge variant="outline">{t("estimate")}</Badge>}
            {e.epsForward !== null && (
              <span className="ml-auto text-xs text-muted-foreground">EPS {e.epsForward}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Where `sessionLabel` maps `BMO → t("beforeOpen")`, `AMC → t("afterClose")`, `UNKNOWN → ""`.

- [ ] **Step 2: Add i18n keys**

In both message files under `calendar`:

- `earningsSection`, `beforeOpen` (`"Before open"` / `"盤前"`), `afterClose` (`"After close"` / `"盤後"`), `estimate` (`"Estimate"` / `"估計"`).

- [ ] **Step 3: Write a unit test**

Render the agenda with `earnings` items; assert the section renders symbol, session label, and EPS. Assert no section when `earnings` is empty/undefined.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run tests/unit/calendar-day-agenda.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/calendar-day-agenda.tsx messages/ tests/unit/calendar-day-agenda.test.tsx
git commit -m "feat(calendar): show read-only earnings section in day agenda"
```

---

### Task 8: Earnings watch management API + UI

**Files:**

- Create: `src/app/api/calendar-earnings-watch/route.ts`
- Create: `src/components/calendar/calendar-earnings-manager.tsx`
- Test: `tests/unit/calendar-earnings-watch-route.test.ts`

**Interfaces:**

- Consumes: CRUD service from Task 3, `HoldingSearch` (existing), `withAuth` from `@/lib/api-handler`.
- Produces:
  - `GET /api/calendar-earnings-watch` → `{ data: SerializedCalendarEarningsWatch[] }`
  - `POST /api/calendar-earnings-watch` body `{ symbol, name, source }` → created item
  - `DELETE /api/calendar-earnings-watch?symbol=AAPL` → 204
  - A manager dialog/panel listing watched stocks with add (tracked checkbox list + manual search) and remove.

- [ ] **Step 1: Write the API route**

Follow `withAuth` + `ok`/`failure` + `validationError` pattern (see `src/app/api/stocks/route.ts`).

```ts
// src/app/api/calendar-earnings-watch/route.ts
import { withAuth } from "@/lib/api-handler";
import { ok, failure, validationError } from "@/lib/api-responses";
import { createCalendarEarningsWatchSchema } from "@/lib/validators";
import {
  addCalendarEarningsWatch,
  getCalendarEarningsWatch,
  removeCalendarEarningsWatch,
  invalidateCalendarEarningsCaches,
} from "@/lib/services/calendar-earnings-service";

export const GET = withAuth(
  async (_req, _ctx, userId) => {
    return ok(await getCalendarEarningsWatch(userId));
  },
  { demo: "allow" },
);

export const POST = withAuth(
  async (request, _ctx, userId, principal) => {
    const body = await request.json();
    const parsed = createCalendarEarningsWatchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const item = await addCalendarEarningsWatch(userId, parsed.data);
    invalidateCalendarEarningsCaches(userId, principal);
    return ok(item, { status: 201 });
  },
  { demo: "allow" },
);

export const DELETE = withAuth(
  async (request, _ctx, userId, principal) => {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase();
    if (!symbol) return failure("Symbol is required");
    await removeCalendarEarningsWatch(userId, symbol);
    invalidateCalendarEarningsCaches(userId, principal);
    return ok(null, { status: 204 });
  },
  { demo: "allow" },
);
```

- [ ] **Step 2: Add the validator**

In `src/lib/validators.ts`, add:

```ts
export const createCalendarEarningsWatchSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  source: z.enum(["tracked", "manual"]).default("tracked"),
});
```

- [ ] **Step 3: Write the manager UI**

`src/components/calendar/calendar-earnings-manager.tsx` — a dialog with:

- A list of tracked stocks (fetched via `/api/stocks`) with checkboxes toggling the watch.
- A manual search input reusing `HoldingSearch` → on select, `POST` with `source: "manual"`.
- A remove (x) button per watched item.

Use the existing `Dialog`, `Button`, `Badge` components. On any mutation, call `startTransition(() => router.refresh())`.

- [ ] **Step 4: Write the route test**

Follow `tests/unit/calendar-entries-route.test.ts` style, asserting GET/POST/DELETE handlers call the service and return correct status codes.

- [ ] **Step 5: Add a calendar header entry point**

In `src/components/calendar/calendar-view.tsx`, add a button (next to the Add Entry button) that opens the manager dialog.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm exec vitest run tests/unit/calendar-earnings-watch-route.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/calendar-earnings-watch/route.ts src/lib/validators.ts src/components/calendar/calendar-earnings-manager.tsx src/components/calendar/calendar-view.tsx tests/unit/calendar-earnings-watch-route.test.ts
git commit -m "feat(calendar): add earnings watch management UI"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run all checks**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint && pnpm exec vitest run`
Expected: all pass.

- [ ] **Step 2: Manual smoke (optional, needs dev server)**

Run: `pnpm dev` and open the calendar. Confirm earnings badges appear on expected dates and the day agenda shows the read-only earnings section for a watched symbol.

- [ ] **Step 3: Create PR (if not already on a feature branch)**

Open a feature branch covering all Tasks 1–8, push, and open a PR with the two commits grouped logically (model+service, then UI).
