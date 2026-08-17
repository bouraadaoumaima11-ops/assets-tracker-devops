# Analysis Payload Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the four analysis-payload follow-ups in issue #689 — a locale-independent cached payload with client-formatted month labels, two neutral `src/lib` modules, reduced payload metadata, and `messageKey`-carrying ranges with stale-persistence fallback — without changing any analysis calculation, range choice, chart presentation, or the mobile `#history` path.

**Architecture:** Two neutral modules are created: `src/lib/analysis-range.ts` (the pure range module moved out of `src/components/analysis`, extended with `messageKey` and range-lookup helpers) and `src/lib/analysis-contract.ts` (the serializable `AnalysisRangeSeries` / `AnalysisPayload` / `AnalysisPayloadMeta` types). Server services (`analysis-payload-service`, `analysis-series-service`, `analysis-service`) keep all DB/cache/aggregation work but stop emitting localized labels and stop accepting `locale`; the three client charts (`cashflow-chart`, `cumulative-growth-chart`, `return-trend-chart`) format month keys with the active next-intl locale at render-data preparation time; `AnalysisView` derives `hasData` / `latestSnapshotAt` from the `snapshots` it already receives and resolves stale persisted ranges against `meta.defaultRange` before translating or selecting series.

**Tech Stack:** Next.js 16.2.9+ (App Router, React 19, `next/cache` `unstable_cache`), next-intl v4, recharts v3.8, Vitest 4 (node env + `server-only` stub), Playwright 1.52 (chromium + Mobile Chrome projects). No new dependencies.

## Global Constraints

- **No commits.** This plan overrides the generic writing-plans "commit after each task" template: the executor makes file changes only and **does not commit, push, or modify git state** unless the user explicitly requests commits. Suggested atomic commit messages are listed per task for the explicit-request case.
- No `unstable_cache` → `use cache` migration.
- No change to analysis calculations, `resolveAnalysisRange` / `pickDefaultRange` Taiwan-calendar-day semantics, `ANALYSIS_RANGES` labels or month counts, chart styling/copy/formulas, or the mobile `#history` route.
- No extraction of `NormalizedSnapshot`; no broader `src/lib/services` reorganization.
- No change to `DrawdownPoint.label` or its consumers; no source-text-grep tests as behavior coverage.
- No new dependencies.
- Only two neutral modules may be created: `src/lib/analysis-range.ts` and `src/lib/analysis-contract.ts`.
- No module under `src/lib/services` may import from `src/components` as part of this flow.
- Server-computed series must expose stable `monthKey` values only (no preformatted `label`); clients format with `formatMonthLabel(monthKey, locale)`.
- An unknown persisted range value must never call `t(undefined)` or crash the route; it falls back to `meta.defaultRange` before translation and series access.
- All existing aggregation-parity assertions must stay green (`analysis-service.test.ts`, `analysis-series-service.test.ts`, `history-service.test.ts`, `first-day-recurring-cash-flow.test.ts`, `analysis-range.test.ts`).

---

## Context

**Issue #689 (design spec `docs/superpowers/specs/2026-08-17-analysis-payload-followups-design.md`) asks for four changes:**

1. **Locale-independent cached payload + client-formatted month labels.** `getCachedAnalysisPayload(userId, baseCurrency, locale)` currently keys the `unstable_cache` entry with `locale`, so the same heavy payload is computed twice (en-US and zh-TW). The locale also flows into `computeAllRangeSeries` → `computeAnalysisRangeSeries` → `buildCashFlowBuckets` / `computeInvestmentReturnSeries`, which pre-format `label` fields into every point. Fix: drop `locale` from the cache identity and from the server series; emit only `monthKey`; format labels in the three client charts via next-intl.
2. **Two neutral `src/lib` modules.** `src/components/analysis/analysis-range.ts` moves to `src/lib/analysis-range.ts`; the serializable contract types move to `src/lib/analysis-contract.ts`. No `src/lib/services` module imports from `src/components` afterwards.
3. **Reduced metadata.** `AnalysisPayloadMeta` currently ships `hasSnapshots` and `latestSnapshotAt` even though the client already receives `snapshots`. `AnalysisView` derives `hasData = snapshots.length > 0` and `latestSnapshotAt = snapshots.at(-1)?.createdAt ?? null` — the exact expressions the server uses today. `meta` keeps only `defaultRange` (server-computed from one frozen clock reading, preserving Taiwan-day behavior).
4. **Ranges carry `messageKey`; stale persisted values fall back.** `ANALYSIS_RANGES` entries gain `messageKey`; `AnalysisView` builds segmented options from the entries (no local `rangeLabelKey` record) and resolves the stored range against `defaultRange` before `t()` and series lookup.

**Key current-state facts (verified):**

- `getCachedAnalysisPayload` is called from exactly one place: `src/app/(main)/analysis/page.tsx:24`.
- `ANALYSIS_RANGES` has five entries `{ label, months }`; `RangeLabel` is derived from it; `getMonthsForRange` uses `.find(...)!`. `src/lib/app-day.ts` is pure (no `server-only`), so the moved range module stays importable from both server and client.
- `formatMonthLabel(monthKey, locale)` lives in `src/lib/services/analysis-service.ts` (no `server-only`) and is already imported at runtime by client components (`assets-liabilities-chart.tsx:15`, `kpi-tiles.tsx`). It stays put.
- The three charts to modify use `XAxis dataKey="label"` and tooltips reading `payload[0].payload.label`; the data currently arrives pre-labeled from the server.
- `tests/unit/analysis-range.test.ts`, `analysis-series-service.test.ts`, `analysis-service.test.ts`, `history-service.test.ts` (line 548), and `first-day-recurring-cash-flow.test.ts` (line 274) currently pass `"en-US"` as a locale argument to the functions being changed.
- Vitest runs in a **node** environment with a `server-only` stub (`tests/stubs/server-only.ts`); there is no jsdom / React Testing Library, and adding one is forbidden. Client behavior is therefore covered by (a) pure-function unit tests on the neutral range module and (b) real-surface Playwright E2E scenarios.
- Playwright has two projects: `chromium` (Desktop Chrome) and `Mobile Chrome` (Pixel 7). `analysis-populated.spec.ts` exists and seeds a shared DB fixture (`E2E_EMAIL = e2e-test@preview.local`); it requires `DATABASE_URL`.
- Locale is resolved server-side from the `NEXT_LOCALE` cookie (`src/i18n/request.ts`), so E2E can switch locales by adding that cookie.
- The analysis message keys `rangeYTD` / `range6M` / `range1Y` / `range2Y` / `rangeAll` exist in both `messages/en-US.json` and `messages/zh-TW.json`.
- `Intl.DateTimeFormat` outputs verified: `formatMonthLabel("2026-08","en-US")` → `"Aug 2026"`, `formatMonthLabel("2025-03","zh-TW")` → `"2025年3月"`.

---

## Task Dependency Graph

| Task                                                                | Depends On     | Reason                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task 1: Neutralize range module + messageKey                        | None           | Starting point; creates `src/lib/analysis-range.ts` that every other task imports                                                                                                                                  |
| Task 2: Locale-independent server series + contract type            | Task 1         | `analysis-series-service.ts` imports the moved range module and relocates `AnalysisRangeSeries` to `src/lib/analysis-contract.ts`                                                                                  |
| Task 3: Client charts format month labels                           | Task 1         | Charts import `@/lib/analysis-range`-independent helpers but must wait for the module move wave; consumes the neutral module's naming and `formatMonthLabel` pattern. Run in parallel with Task 2 (disjoint files) |
| Task 4: Locale-independent payload + reduced meta + view derivation | Task 1, Task 2 | `analysis-payload-service.ts` imports `pickDefaultRange` (Task 1) and calls the new `computeAllRangeSeries` signature (Task 2)                                                                                     |
| Task 5: Stale-range fallback + messageKey options in view           | Task 1, Task 4 | Uses `resolveActiveRange` / `getMessageKeyForRange` (Task 1) and the reduced `meta` shape (Task 4)                                                                                                                 |
| Task 6: E2E scenarios + full verification                           | Tasks 1–5      | Real-surface verification requires all production changes in place                                                                                                                                                 |

## Parallel Execution Waves

```
Wave 1 (Start immediately):
└── Task 1: Neutralize range module to src/lib + messageKey + lookup helpers

Wave 2 (After Wave 1 completes — parallel, disjoint files):
├── Task 2: Locale-independent server series (services + contract + unit tests)
└── Task 3: Client charts format month labels (3 chart files)

Wave 3 (After Wave 2 completes):
└── Task 4: Locale-independent cached payload + reduced meta + view derivation

Wave 4 (After Wave 3 completes):
└── Task 5: Stale-range fallback + messageKey-driven segmented options in AnalysisView

Wave 5 (After Wave 4 completes):
└── Task 6: E2E scenarios + full verification suite

Critical Path: Task 1 → Task 2 → Task 4 → Task 5 → Task 6
```

> Note: Wave 2's tasks edit disjoint files (`src/lib/services/*` + contract + service tests vs. the three chart components), so they run concurrently. The repo's typecheck is only guaranteed green once the whole wave lands; task-level QA is the targeted Vitest files, and the full `pnpm typecheck` gate runs in Task 6.

---

### Task 1: Neutralize the range module and make ranges carry `messageKey`

**Files:**

- Move: `src/components/analysis/analysis-range.ts` → `src/lib/analysis-range.ts`
- Modify: `src/lib/services/analysis-series-service.ts:3-7` (import path), `src/lib/services/analysis-payload-service.ts:15` (import path), `src/components/analysis/analysis-view.tsx:19` (import path `./analysis-range` → `@/lib/analysis-range`)
- Test: `tests/unit/analysis-range.test.ts` (import path + new expectations)

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `export const ANALYSIS_RANGES = [...] as const` with each entry `{ label: "YTD"|"6M"|"1Y"|"2Y"|"All"; months: number; messageKey: string }`.
  - `export type RangeLabel = (typeof ANALYSIS_RANGES)[number]["label"]` (unchanged).
  - `export function getMonthsForRange(label: RangeLabel): number` (unchanged body).
  - `export function getMessageKeyForRange(label: RangeLabel): string` (new).
  - `export function resolveActiveRange(stored: string, fallback: RangeLabel): RangeLabel` (new).
  - `resolveAnalysisRange`, `pickDefaultRange`, `AnalysisRange` (unchanged bodies — Taiwan-day semantics preserved).

- [ ] **Step 1: Write the failing tests (RED)**

Update the import in `tests/unit/analysis-range.test.ts:8`:

```ts
import {
  ANALYSIS_RANGES,
  getMonthsForRange,
  getMessageKeyForRange,
  pickDefaultRange,
  resolveActiveRange,
  resolveAnalysisRange,
} from "@/lib/analysis-range";
```

Extend the `describe("ANALYSIS_RANGES")` block (after line 139) and append two new describes:

```ts
  it("carries the analysis translation messageKey for each range", () => {
    expect(ANALYSIS_RANGES.map((r) => r.messageKey)).toEqual([
      "rangeYTD",
      "range6M",
      "range1Y",
      "range2Y",
      "rangeAll",
    ]);
  });
});

describe("getMessageKeyForRange", () => {
  it("maps each label to its analysis message key", () => {
    expect(getMessageKeyForRange("YTD")).toBe("rangeYTD");
    expect(getMessageKeyForRange("6M")).toBe("range6M");
    expect(getMessageKeyForRange("1Y")).toBe("range1Y");
    expect(getMessageKeyForRange("2Y")).toBe("range2Y");
    expect(getMessageKeyForRange("All")).toBe("rangeAll");
  });
});

describe("resolveActiveRange", () => {
  it("returns the stored label when it names a known range", () => {
    for (const label of ["YTD", "6M", "1Y", "2Y", "All"] as const) {
      expect(resolveActiveRange(label, "YTD")).toBe(label);
    }
  });

  it("falls back to the default when the stored label is unknown", () => {
    expect(resolveActiveRange("BOGUS_RANGE", "YTD")).toBe("YTD");
    expect(resolveActiveRange("", "6M")).toBe("6M");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit tests/unit/analysis-range.test.ts`
Expected: FAIL — the module import `@/lib/analysis-range` cannot be resolved (module has not moved yet), so the whole file errors. This is the expected RED reason.

- [ ] **Step 3: Move the module and add the new behavior (GREEN)**

```bash
git mv src/components/analysis/analysis-range.ts src/lib/analysis-range.ts
```

Update `src/lib/analysis-range.ts`:

- Keep `AnalysisRange`, `resolveAnalysisRange`, and `pickDefaultRange` bodies byte-for-byte (Taiwan-day semantics must not change).
- Replace the `ANALYSIS_RANGES` constant:

```ts
export const ANALYSIS_RANGES = [
  { label: "YTD", months: 0, messageKey: "rangeYTD" },
  { label: "6M", months: 6, messageKey: "range6M" },
  { label: "1Y", months: 12, messageKey: "range1Y" },
  { label: "2Y", months: 24, messageKey: "range2Y" },
  { label: "All", months: Infinity, messageKey: "rangeAll" },
] as const;
```

- Add after `getMonthsForRange`:

```ts
export function getMessageKeyForRange(label: RangeLabel): string {
  return ANALYSIS_RANGES.find((r) => r.label === label)!.messageKey;
}

export function resolveActiveRange(stored: string, fallback: RangeLabel): RangeLabel {
  return ANALYSIS_RANGES.find((r) => r.label === stored)?.label ?? fallback;
}
```

Update the three importers:

- `src/lib/services/analysis-series-service.ts:3-7`: `} from "@/lib/analysis-range";`
- `src/lib/services/analysis-payload-service.ts:15`: `import { pickDefaultRange, type RangeLabel } from "@/lib/analysis-range";`
- `src/components/analysis/analysis-view.tsx:19`: `import { ANALYSIS_RANGES, type RangeLabel } from "@/lib/analysis-range";`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:unit tests/unit/analysis-range.test.ts`
Expected: PASS — all existing range tests plus the new messageKey / getMessageKeyForRange / resolveActiveRange tests.

- [ ] **Step 5: No commit (default).** If the user explicitly requested commits:

```bash
git add src/lib/analysis-range.ts src/lib/services/analysis-series-service.ts src/lib/services/analysis-payload-service.ts src/components/analysis/analysis-view.tsx tests/unit/analysis-range.test.ts
git commit -m "refactor(analysis): move range module to src/lib and add messageKey to ranges"
```

**Acceptance Criteria:** `ANALYSIS_RANGES` entries each carry `messageKey`; `resolveActiveRange("BOGUS_RANGE","YTD") === "YTD"`; the old `src/components/analysis/analysis-range.ts` no longer exists; `pnpm test:unit tests/unit/analysis-range.test.ts` passes; no range-boundary or default-selection behavior changed (all existing `resolveAnalysisRange` / `pickDefaultRange` tests still pass untouched).

---

### Task 2: Make server series locale-independent and emit month keys only

**Files:**

- Create: `src/lib/analysis-contract.ts` (owns `AnalysisRangeSeries`)
- Modify: `src/lib/services/analysis-service.ts` (`CashFlowBucket`, `buildCashFlowBuckets`, `CumulativeGrowthPoint`, `buildCumulativeGrowth`, `ReturnTrendPoint`, `computeInvestmentReturnSeries`)
- Modify: `src/lib/services/analysis-series-service.ts` (drop local `AnalysisRangeSeries`; drop `locale` params; import contract type)
- Test: `tests/unit/analysis-service.test.ts`, `tests/unit/analysis-series-service.test.ts`, `tests/unit/history-service.test.ts:548`, `tests/unit/first-day-recurring-cash-flow.test.ts:274`

**Interfaces:**

- Consumes: `ANALYSIS_RANGES`, `getMonthsForRange`, `resolveAnalysisRange`, `type RangeLabel` from `@/lib/analysis-range` (Task 1).
- Produces:
  - `export function buildCashFlowBuckets(buckets: MonthlyBucket[], contributions: MonthlyContribution[]): CashFlowBucket[]`
  - `export function computeInvestmentReturnSeries(snapshots: SnapshotBreakdown[], accounts: AccountMeta[], accountCashFlows: AccountMonthlyContribution[], monthKeys: string[]): ReturnTrendPoint[]`
  - `export function computeAnalysisRangeSeries(snapshots, rawHistory, cashFlowData, accountCashFlow, rangeLabel: RangeLabel, now = new Date()): AnalysisRangeSeries`
  - `export function computeAllRangeSeries(snapshots, rawHistory, cashFlowData, accountCashFlow, now = new Date()): Record<RangeLabel, AnalysisRangeSeries>`
  - `export interface AnalysisRangeSeries` now re-exported from `@/lib/analysis-contract`.
  - `CashFlowBucket`, `CumulativeGrowthPoint`, `ReturnTrendPoint` no longer carry `label`.

- [ ] **Step 1: Write/update the failing tests (RED)**

In `tests/unit/analysis-service.test.ts`:

- Update the three `buildCashFlowBuckets` calls (lines 183-187, 210, 228-232) to drop the `"en-US"` third argument.
- Update the `bucket` helper in `describe("buildCumulativeGrowth")` (lines 238-250) to remove `label: monthKey,`.
- Update every `computeInvestmentReturnSeries(..., "en-US")` call (lines 461-467, 494-500, 515-521, 542-548, 562-568, 576-583, 592-593) to drop the trailing `"en-US"` argument.
- Add three behavior-locking tests:

```ts
it("exposes month keys without a preformatted label when locale is not passed", () => {
  const buckets = [
    {
      monthKey: "2026-01",
      endDate: "2026-01",
      startNetWorth: 0,
      endNetWorth: 100,
      totalAssets: 100,
      totalLiabilities: 0,
      deltaNetWorth: 100,
      deltaPct: null,
      isEmpty: false,
    },
  ];
  const result = buildCashFlowBuckets(buckets, [{ monthKey: "2026-01", contributions: 60 }]);
  expect(result[0]).toMatchObject({ monthKey: "2026-01", contributions: 60 });
  expect(result[0]).not.toHaveProperty("label");
});
```

```ts
it("does not copy a label onto cumulative points", () => {
  const result = buildCumulativeGrowth([bucket("2026-01", 100, 20)]);
  expect(result[0]).toMatchObject({ monthKey: "2026-01", cumulativeContributions: 100 });
  expect(result[0]).not.toHaveProperty("label");
});
```

```ts
it("exposes return-trend month keys without a preformatted label", () => {
  const snapshots: SnapshotBreakdown[] = [
    { date: "2026-01-05", accountValues: { a1: 1000 } },
    { date: "2026-01-31", accountValues: { a1: 1100 } },
    { date: "2026-02-28", accountValues: { a1: 1265 } },
  ];
  const accounts: AccountMeta[] = [
    { id: "a1", name: "Brokerage", category: "BROKERAGE", type: "ASSET" },
  ];
  const points = computeInvestmentReturnSeries(
    snapshots,
    accounts,
    [],
    ["2026-01", "2026-02", "2026-03"],
  );
  expect(points).toHaveLength(3);
  expect(points[0].monthKey).toBe("2026-01");
  expect(points[0]).not.toHaveProperty("label");
});
```

(These rely on `SnapshotBreakdown` / `AccountMeta` being imported at the top of the file — they already are.)

In `tests/unit/analysis-series-service.test.ts`:

- Drop the `"en-US"` argument from every `computeAllRangeSeries` / `computeAnalysisRangeSeries` call (lines 61-68, 86-94, 193-201, 207-214, 222-230). The `NOW` argument moves into the previous position.
- Add a behavior-locking test:

```ts
describe("locale-independent series", () => {
  it("produces all five ranges from month keys without preformatted labels", () => {
    const series = computeAllRangeSeries(snapshots, rawHistory, cashFlowData, accountCashFlow, NOW);
    expect(Object.keys(series)).toEqual(["YTD", "6M", "1Y", "2Y", "All"]);
    for (const label of ["YTD", "6M", "1Y", "2Y", "All"] as const) {
      const s = series[label];
      expect(s.cashFlowBuckets[0].monthKey).toBeTypeOf("string");
      expect(s.cashFlowBuckets[0]).not.toHaveProperty("label");
      expect(s.cumulativeGrowth[0]).not.toHaveProperty("label");
      expect(s.returnTrend.length).toBeGreaterThan(0);
      expect(s.returnTrend[0]).not.toHaveProperty("label");
    }
  });
});
```

In `tests/unit/history-service.test.ts:548`: `buildCashFlowBuckets(buckets, contributions, "en-US")` → `buildCashFlowBuckets(buckets, contributions)`.
In `tests/unit/first-day-recurring-cash-flow.test.ts:274-278`: drop the `"en-US"` argument.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit tests/unit/analysis-service.test.ts tests/unit/analysis-series-service.test.ts tests/unit/history-service.test.ts tests/unit/first-day-recurring-cash-flow.test.ts`
Expected: FAIL — the new `not.toHaveProperty("label")` assertions fail because `buildCashFlowBuckets` / `buildCumulativeGrowth` / `computeInvestmentReturnSeries` still emit `label`, and `computeAllRangeSeries` still requires the locale argument (the five-range call returns labels). The existing aggregation-parity assertions fail only if the implementation regresses them.

- [ ] **Step 3: Implement (GREEN)**

Create `src/lib/analysis-contract.ts`:

```ts
import type {
  MonthlyBucket,
  AnalysisKpis,
  CashFlowBucket,
  CumulativeGrowthPoint,
  CategoryDataPoint,
  AttributionItem,
  ReturnTrendPoint,
} from "@/lib/services/analysis-service";
import type { NormalizedSnapshot } from "@/lib/services/history-service";
import type { InvestmentCostBasisSummary } from "@/lib/services/analysis-service";
import type { RangeLabel } from "@/lib/analysis-range";

export interface AnalysisRangeSeries {
  buckets: MonthlyBucket[];
  kpis: AnalysisKpis;
  cashFlowBuckets: CashFlowBucket[];
  cumulativeGrowth: CumulativeGrowthPoint[];
  categoryHistory: CategoryDataPoint[];
  attributionItems: AttributionItem[];
  investmentReturnPct: number | null;
  returnTrend: ReturnTrendPoint[];
  rangeStartIso: string;
}
```

(All imports are type-only; do NOT add `server-only` here — this module is imported by client components.)

Edit `src/lib/services/analysis-service.ts`:

- `CashFlowBucket` (lines 229-242): delete the `label` field and its doc comment.
- `buildCashFlowBuckets` (lines 266-284): change signature to `(buckets: MonthlyBucket[], contributions: MonthlyContribution[])`, delete the `locale` param, delete `label: formatMonthLabel(b.monthKey, locale),` from the returned object, and delete the stale `@param locale` doc line.
- `CumulativeGrowthPoint` (lines 287-299): delete the `label` field and its doc comment.
- `buildCumulativeGrowth` (line 316): delete `label: b.label,`.
- `ReturnTrendPoint` (lines 620-631): delete the `label` field and its doc comment.
- `computeInvestmentReturnSeries` (lines 647-706): change signature to `(snapshots: SnapshotBreakdown[], accounts: AccountMeta[], accountCashFlows: AccountMonthlyContribution[], monthKeys: string[])`, delete `locale = "en-US"` and `const label = formatMonthLabel(monthKey, locale);` (line 687), and remove `label,` from all three returned objects (lines 691, 700, 704). Keep `formatMonthLabel` exported and unchanged (clients still use it).

Edit `src/lib/services/analysis-series-service.ts`:

- Delete the local `AnalysisRangeSeries` interface (lines 33-43) and import it instead:

```ts
import type { AnalysisRangeSeries } from "@/lib/analysis-contract";
```

- `computeAnalysisRangeSeries` (lines 56-123): drop the `locale: string` param and its JSDoc mention; drop the `locale,` argument from the `buildCashFlowBuckets` call (line 74-78) and from the `computeInvestmentReturnSeries` call (line 104-110).
- `computeAllRangeSeries` (lines 125-146): drop the `locale: string` param; drop `locale,` from the `computeAnalysisRangeSeries` call.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:unit tests/unit/analysis-service.test.ts tests/unit/analysis-series-service.test.ts tests/unit/history-service.test.ts tests/unit/first-day-recurring-cash-flow.test.ts`
Expected: PASS — all aggregation parity assertions plus the new no-label assertions.

- [ ] **Step 5: No commit (default).** If the user explicitly requested commits:

```bash
git add src/lib/analysis-contract.ts src/lib/services/analysis-service.ts src/lib/services/analysis-series-service.ts tests/unit/analysis-service.test.ts tests/unit/analysis-series-service.test.ts tests/unit/history-service.test.ts tests/unit/first-day-recurring-cash-flow.test.ts
git commit -m "refactor(analysis): drop locale from server series and emit month keys without labels"
```

**Acceptance Criteria:** `buildCashFlowBuckets` / `computeInvestmentReturnSeries` no longer accept `locale`; `CashFlowBucket` / `CumulativeGrowthPoint` / `ReturnTrendPoint` have no `label` property; `computeAllRangeSeries(snapshots, rawHistory, cashFlowData, accountCashFlow, now)` compiles and produces all five ranges with month keys only; all listed unit-test files pass.

---

### Task 3: Client charts format month labels from the active locale

**Files:**

- Modify: `src/components/analysis/cashflow-chart.tsx`, `src/components/analysis/cumulative-growth-chart.tsx`, `src/components/analysis/return-trend-chart.tsx`

**Interfaces:**

- Consumes: `CashFlowBucket[]` / `CumulativeGrowthPoint[]` / `ReturnTrendPoint[]` (month keys only, from Task 2) and the existing `formatMonthLabel(monthKey, locale)` export from `@/lib/services/analysis-service`.
- Produces: each chart renders `label` derived from `monthKey` with the active next-intl locale. No prop signature changes; no chart styling/copy/formula changes.

- [ ] **Step 1: Write the failing test (RED) — real-surface only**

There is no component-render unit harness and adding one is forbidden, so the failing check for this task is the _type_ contract: after Task 2 removes `label` from the three series types, these charts still reference `payload[0].payload.label` / `dataKey="label"` against `label`-less data.

Run: `pnpm typecheck`
Expected: FAIL — `Property 'label' does not exist on type 'CashFlowBucket'` (and `CumulativeGrowthPoint`, `ReturnTrendPoint`) in the three chart files. This is the expected RED: the charts must derive labels locally.

- [ ] **Step 2: Implement (GREEN)**

`src/components/analysis/cashflow-chart.tsx`:

- Line 14: `import { useLocale, useTranslations } from "next-intl";`
- Add after line 22: `import { formatMonthLabel } from "@/lib/services/analysis-service";`
- After line 102 (`const t = useTranslations("analysis");`): `const locale = useLocale();`
- Replace lines 113-116 (the `chartData` memo) with:

```tsx
const chartData = useMemo(
  () =>
    buckets.map((b) => ({
      ...b,
      label: formatMonthLabel(b.monthKey, locale),
      deltaLine: b.isEmpty ? null : b.deltaNetWorth,
    })),
  [buckets, locale],
);
```

`XAxis dataKey="label"` (line 180) and the tooltip's `b.label` (lines 57, 68) keep working because recharts now feeds them the mapped `chartData` (line 173 `<ComposedChart data={chartData}>`).

`src/components/analysis/cumulative-growth-chart.tsx`:

- Line 5: `import { useLocale, useTranslations } from "next-intl";`
- Add after line 14: `import { formatMonthLabel } from "@/lib/services/analysis-service";`
- After line 97 (`const t = useTranslations("analysis");`): `const locale = useLocale();`
- Add before the `return (` (after line 105):

```tsx
const chartData = useMemo(
  () => points.map((p) => ({ ...p, label: formatMonthLabel(p.monthKey, locale) })),
  [points, locale],
);
```

- Line 164: `<ComposedChart data={points}` → `<ComposedChart data={chartData}`. Tooltips (`p.label` at lines 45, 54) and `XAxis dataKey="label"` (line 182) now read the mapped payload.

`src/components/analysis/return-trend-chart.tsx`:

- Line 14: `import { useLocale, useTranslations } from "next-intl";`
- Add after line 22: `import { formatMonthLabel } from "@/lib/services/analysis-service";`
- After line 87 (`const t = useTranslations("analysis");`): `const locale = useLocale();`
- Add before the `return (` (after line 97):

```tsx
const chartData = useMemo(
  () => points.map((p) => ({ ...p, label: formatMonthLabel(p.monthKey, locale) })),
  [points, locale],
);
```

- Line 146: `<ComposedChart data={points}` → `<ComposedChart data={chartData}`. `XAxis dataKey="label"` (line 153) and the tooltip's `p.label` (lines 52, 66) read the mapped payload. The `Cell` mapping (line 177) may stay keyed on `points`.

- [ ] **Step 3: Verify (GREEN)**

Run: `pnpm typecheck`
Expected: PASS — no `Property 'label' does not exist` errors; the three charts derive labels locally.

- [ ] **Step 4: No commit (default).** If the user explicitly requested commits:

```bash
git add src/components/analysis/cashflow-chart.tsx src/components/analysis/cumulative-growth-chart.tsx src/components/analysis/return-trend-chart.tsx
git commit -m "refactor(analysis): format month labels client-side in cash flow, growth, and return charts"
```

**Acceptance Criteria:** `pnpm typecheck` passes; the three charts import `formatMonthLabel` and `useLocale`; `XAxis`/tooltip labels are derived from `monthKey` at render-data preparation; no chart prop, class, or copy changed.

---

### Task 4: Locale-independent cached payload, reduced meta, derived metadata in the view

**Files:**

- Modify: `src/lib/analysis-contract.ts` (add `AnalysisPayloadMeta`, `AnalysisPayload`)
- Modify: `src/lib/services/analysis-payload-service.ts` (import contract types; drop `locale` param + key part; `meta = { defaultRange }`)
- Modify: `src/app/(main)/analysis/page.tsx:23-25` (drop the locale argument)
- Modify: `src/components/analysis/analysis-view.tsx:101-102` (derive `hasData` / `latestSnapshotAt` from `snapshots`; update `AnalysisPayloadMeta` import to `@/lib/analysis-contract`)
- Create test: `tests/unit/analysis-payload-service.test.ts`

**Interfaces:**

- Consumes: `computeAllRangeSeries` new signature (Task 2), `pickDefaultRange` from `@/lib/analysis-range` (Task 1).
- Produces:
  - `export interface AnalysisPayloadMeta { defaultRange: RangeLabel }`
  - `export interface AnalysisPayload { seriesByRange: Record<RangeLabel, AnalysisRangeSeries>; investmentCostBasis: InvestmentCostBasisSummary; snapshots: NormalizedSnapshot[]; meta: AnalysisPayloadMeta }` (from `@/lib/analysis-contract`)
  - `export async function getCachedAnalysisPayload(userId: string, baseCurrency: string): Promise<AnalysisPayload>` with `unstable_cache` key parts `["analysis-payload", userId, baseCurrency]`.

- [ ] **Step 1: Write the failing cache-boundary test (RED)**

Create `tests/unit/analysis-payload-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUnstableCache = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: mockUnstableCache,
}));

vi.mock("@/lib/services/history-service", () => ({
  getFullNormalizedHistory: vi.fn(async () => []),
  getMonthlyCashFlow: vi.fn(async () => []),
  getRawHistoryWithBreakdown: vi.fn(async () => ({ snapshots: [], accounts: [] })),
  getAccountMonthlyCashFlow: vi.fn(async () => []),
}));

vi.mock("@/lib/services/investment-cost-basis-service", () => ({
  getInvestmentCostBasisSummary: vi.fn(async () => ({
    marketValue: 0,
    costedMarketValue: 0,
    costBasis: 0,
    unrealizedGain: null,
    unrealizedGainPct: null,
    pricedHoldingCount: 0,
    costedHoldingCount: 0,
  })),
}));

import { getCachedAnalysisPayload } from "@/lib/services/analysis-payload-service";
import { unstable_cache } from "next/cache";

beforeEach(() => {
  mockUnstableCache.mockReset();
  mockUnstableCache.mockImplementation((fn: () => Promise<unknown>) => () => fn());
});

describe("getCachedAnalysisPayload", () => {
  it("is keyed by user and base currency only — locale is not a key part and meta is reduced", async () => {
    const payload = await getCachedAnalysisPayload("user-1", "USD");

    expect(mockUnstableCache).toHaveBeenCalledTimes(1);
    const keyParts = mockUnstableCache.mock.calls[0]?.[1];
    expect(keyParts).toEqual(["analysis-payload", "user-1", "USD"]);

    expect(payload.meta).toEqual({ defaultRange: "YTD" });
    expect(payload.meta).not.toHaveProperty("hasSnapshots");
    expect(payload.meta).not.toHaveProperty("latestSnapshotAt");
  });
});
```

Note: the signature is exercised by the two-argument call — passing a third `locale` argument here would be a typecheck error, which is the compile-time half of "locale is not accepted".

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/analysis-payload-service.test.ts`
Expected: FAIL — the current key parts array is `["analysis-payload", "user-1", "USD", undefined]` (locale arg present, now `undefined`), so `toEqual(["analysis-payload", "user-1", "USD"])` fails; and `payload.meta` still contains `hasSnapshots` / `latestSnapshotAt`, so `toEqual({ defaultRange: "YTD" })` fails.

- [ ] **Step 3: Implement (GREEN)**

`src/lib/analysis-contract.ts` — append:

```ts
export interface AnalysisPayloadMeta {
  defaultRange: RangeLabel;
}

export interface AnalysisPayload {
  seriesByRange: Record<RangeLabel, AnalysisRangeSeries>;
  investmentCostBasis: InvestmentCostBasisSummary;
  /** Full normalized history — used by the mobile #history tab (HistoryView). */
  snapshots: NormalizedSnapshot[];
  meta: AnalysisPayloadMeta;
}
```

`src/lib/services/analysis-payload-service.ts`:

- Delete the local `AnalysisPayloadMeta` (lines 18-22) and `AnalysisPayload` (lines 24-30) interfaces; import them:

```ts
import type { AnalysisPayload, AnalysisPayloadMeta } from "@/lib/analysis-contract";
```

- `getCachedAnalysisPayload` (lines 32-85):
  - Signature: `export async function getCachedAnalysisPayload(userId: string, baseCurrency: string): Promise<AnalysisPayload>` (drop `locale`).
  - Remove `locale,` from the `computeAllRangeSeries(...)` call (line 53-60).
  - Meta (lines 63-67) becomes:

```ts
        meta: {
          defaultRange: pickDefaultRange(snapshots, now),
        },
```

- Key parts (line 70) become: `["analysis-payload", userId, baseCurrency]`.

`src/app/(main)/analysis/page.tsx:23-25`:

```tsx
const payloadP = Promise.all([settingsP, localeP]).then(([s]) =>
  getCachedAnalysisPayload(userId, s.baseCurrency),
);
```

`src/components/analysis/analysis-view.tsx`:

- Line 18: `import type { AnalysisPayloadMeta } from "@/lib/services/analysis-payload-service";` → `import type { AnalysisPayloadMeta } from "@/lib/analysis-contract";`
- Lines 101-102:

```tsx
const hasData = snapshots.length > 0;
const latestSnapshotAt = snapshots.at(-1)?.createdAt ?? null;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:unit tests/unit/analysis-payload-service.test.ts tests/unit/analysis-range.test.ts tests/unit/analysis-series-service.test.ts`
Expected: PASS — the cache-boundary test (empty snapshots make `pickDefaultRange` deterministically return `"YTD"`) and all prior suite updates.

- [ ] **Step 5: No commit (default).** If the user explicitly requested commits:

```bash
git add src/lib/analysis-contract.ts src/lib/services/analysis-payload-service.ts "src/app/(main)/analysis/page.tsx" src/components/analysis/analysis-view.tsx tests/unit/analysis-payload-service.test.ts
git commit -m "feat(analysis): locale-independent cached payload and meta reduced to defaultRange"
```

**Acceptance Criteria:** `getCachedAnalysisPayload(userId, baseCurrency)` no longer accepts `locale`; key parts are exactly `["analysis-payload", userId, baseCurrency]`; `AnalysisPayloadMeta` has only `defaultRange`; the view derives `hasData` / `latestSnapshotAt` from `snapshots` with the exact server-equivalent expressions; `meta.defaultRange` remains server-computed from one frozen clock reading; the cache-boundary test passes.

---

### Task 5: Resolve stale persisted ranges and build segmented options from `messageKey`

**Files:**

- Modify: `src/components/analysis/analysis-view.tsx` (lines 67, 73-91, 101-102 area, 151-160, 166-167)

**Interfaces:**

- Consumes: `resolveActiveRange` / `getMessageKeyForRange` / `ANALYSIS_RANGES` / `type RangeLabel` from `@/lib/analysis-range` (Task 1), reduced `meta` (Task 4).
- Produces: `activeRange: RangeLabel` = `resolveActiveRange(range, meta.defaultRange)`; segmented options built from `ANALYSIS_RANGES` entries via `t(r.messageKey)`; `series = seriesByRange[activeRange]` (no runtime `??` fallback needed — resolution guarantees a valid label).

- [ ] **Step 1: Write the failing test (RED)**

The pure resolution logic already has unit coverage from Task 1 (`resolveActiveRange`). The view wiring is covered by the real-surface stale-range E2E scenario in Task 6; the failing check here is the type-level removal of the old path. Write the Task 6 stale-range E2E test first and confirm it fails against the current view because a stored `"BOGUS_RANGE"` leaves the `SegmentedControl` with no matching `value`, so no button is `aria-pressed`. If running tasks serially, you may instead use this type-level gate: after removing the `rangeLabelKey` record, `pnpm typecheck` must pass with `ANALYSIS_RANGES`-derived options — the "failing" state is the absence of `resolveActiveRange` (a typecheck error on the missing import), which is resolved by Step 2.

Concretely, the RED check for this task (run after the Task 6 test file exists):
Run: `pnpm test:e2e --project=chromium tests/e2e/analysis-populated.spec.ts --grep "unknown persisted range"`
Expected: FAIL — the injected `BOGUS_RANGE` is passed straight into `t()`/`seriesByRange` and the control highlights nothing (or the route errors), so `getByRole("button", { pressed: true })` does not resolve to exactly one.

- [ ] **Step 2: Implement (GREEN)**

In `src/components/analysis/analysis-view.tsx`:

- Line 19 import becomes:

```tsx
import {
  ANALYSIS_RANGES,
  getMessageKeyForRange,
  resolveActiveRange,
  type RangeLabel,
} from "@/lib/analysis-range";
```

- Delete the `rangeLabelKey` record (lines 73-79).
- Replace lines 81-91 with:

```tsx
const activeRange = resolveActiveRange(range, meta.defaultRange);
const rangeOptions: SegmentedOption<RangeLabel>[] = ANALYSIS_RANGES.map((r) => ({
  value: r.label,
  label: t(r.messageKey),
}));
const activeRangeLabel = t(getMessageKeyForRange(activeRange));

const series = seriesByRange[activeRange];
```

- Line 151-160 (`SegmentedControl`): change `value={range}` → `value={activeRange}` (so the control highlights the fallback when the persisted value is unknown). `onValueChange={setRange}` stays.
- Line 166-167 (`motion.div key={range}`): change `key={range}` → `key={activeRange}`.
- Lines 101-102 (`hasData` / `latestSnapshotAt`) are unchanged from Task 4.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm test:unit tests/unit/analysis-range.test.ts`
Expected: PASS — `resolveActiveRange` unit tests.
Run: `pnpm test:e2e --project=chromium tests/e2e/analysis-populated.spec.ts --grep "unknown persisted range"`
Expected: PASS — page renders, exactly one range button is `aria-pressed`.

- [ ] **Step 4: No commit (default).** If the user explicitly requested commits:

```bash
git add src/components/analysis/analysis-view.tsx
git commit -m "fix(analysis): fall back to defaultRange for stale persisted ranges"
```

**Acceptance Criteria:** `analysis-view.tsx` no longer declares `rangeLabelKey`; segmented options come from `ANALYSIS_RANGES` + `t(r.messageKey)`; an unknown persisted range resolves to `meta.defaultRange` before any `t()` call or series lookup; `SegmentedControl` reflects the resolved range; the stale-range E2E passes.

---

### Task 6: Real-surface E2E scenarios and full verification

**Files:**

- Modify: `tests/e2e/analysis-fixture.ts` (email parametrization + `seedAnalysisEmptyFixture`)
- Modify: `tests/e2e/analysis-populated.spec.ts` (range-switch-back assertion; month-label tests; stale-range test)
- Create: `tests/e2e/analysis-empty.spec.ts`
- Create: `tests/e2e/analysis-history-mobile.spec.ts`

**Scenario contract:**
| Scenario | Surface | What it proves |
|---|---|---|
| Happy / populated | chromium | Charts render, range switching stays functional (existing + switch-back), en-US month label renders from month-key data |
| Stale-range edge | chromium | Injected unknown persisted range falls back to server `defaultRange` without exception; exactly one range selected |
| Locale independence | chromium | Same seeded payload renders both `en-US` and `zh-TW` month labels (via `NEXT_LOCALE` cookie) |
| Empty-data edge | chromium | No snapshots → onboarding empty state; no freshness badge (derived `latestSnapshotAt` is `null`) |
| Adjacent `#history` regression | Mobile Chrome | `/analysis#history` still renders `HistoryView` from the `snapshots` payload |

- [ ] **Step 1: Write the failing tests (RED) — run against pre-Task-2/3/5 code**

`tests/e2e/analysis-fixture.ts`:

- Add email constants and parametrize the shared functions:

```ts
const E2E_EMAIL = "e2e-test@preview.local";
const E2E_EMPTY_EMAIL = "e2e-empty@preview.local";
const E2E_MOBILE_EMAIL = "e2e-mobile@preview.local";
```

- `getOrCreateE2eUser(pool: pg.Pool, email: string)` — take the email as a parameter; the two `INSERT ... $2` bindings for email/name stay identical, only the argument source changes.
- `seedAnalysisFixture(email = E2E_EMAIL): Promise<AnalysisFixture>` — pass `email` to `getOrCreateE2eUser`.
- `cleanupAnalysisFixture(fixture: AnalysisFixture, email = E2E_EMAIL)` — use `email` in the user lookup.
- Append:

```ts
export async function seedAnalysisEmptyFixture(): Promise<AnalysisFixture> {
  const pool = createDbPool();
  try {
    await getOrCreateE2eUser(pool, E2E_EMPTY_EMAIL);
    return { snapshotDates: [] };
  } finally {
    await pool.end();
  }
}

export async function cleanupAnalysisEmptyFixture() {
  const pool = createDbPool();
  try {
    const user = await pool.query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [
      E2E_EMPTY_EMAIL,
    ]);
    const userId = user.rows[0]?.id;
    if (!userId) return;
    await removeFixtureData(pool, userId, []);
  } finally {
    await pool.end();
  }
}
```

`tests/e2e/analysis-populated.spec.ts`:

- Extend the existing test (after line 31) with a switch-back assertion:

```ts
await page.getByRole("button", { name: "YTD", exact: true }).click();
await expect(page.getByRole("button", { name: "YTD", exact: true })).toHaveAttribute(
  "aria-pressed",
  "true",
);
```

- Add a helper and three new tests:

```ts
function oldestMonthLabel(locale: string): string {
  const oldest = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 17, 1));
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(oldest);
}

test("analysis falls back to the server default range for an unknown persisted range", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Populated Analysis QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisFixture();
  try {
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: "en-US", url: "http://localhost:3000" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      sessionStorage.setItem("asset-tracker:range:analysis-view", "BOGUS_RANGE"),
    );
    await page.goto("/analysis");
    await expect(page.getByRole("heading", { name: /^Movement/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
    const pressedName = await page.getByRole("button", { pressed: true }).innerText();
    expect(["YTD", "6M", "1Y", "2Y", "All"]).toContain(pressedName);
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
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: "en-US", url: "http://localhost:3000" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      sessionStorage.setItem("asset-tracker:range:analysis-view", "All"),
    );
    await page.goto("/analysis");
    await expect(page.getByText("Assets vs. Liabilities by Month")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page
        .locator(".recharts-xAxis .recharts-cartesian-axis-tick-value")
        .filter({ hasText: oldestMonthLabel("en-US") })
        .first(),
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
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: "zh-TW", url: "http://localhost:3000" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      sessionStorage.setItem("asset-tracker:range:analysis-view", "All"),
    );
    await page.goto("/analysis");
    await expect(
      page
        .locator(".recharts-xAxis .recharts-cartesian-axis-tick-value")
        .filter({ hasText: oldestMonthLabel("zh-TW") })
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await cleanupAnalysisFixture(fixture);
  }
});
```

Create `tests/e2e/analysis-empty.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  cleanupAnalysisEmptyFixture,
  hasAnalysisFixtureDatabase,
  seedAnalysisEmptyFixture,
} from "./analysis-fixture";

test("analysis renders the onboarding empty state for a user with no snapshots", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Analysis empty-state QA is desktop-only.");
  test.skip(!hasAnalysisFixtureDatabase(), "Empty Analysis QA requires DATABASE_URL.");
  await seedAnalysisEmptyFixture();
  try {
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: "en-US", url: "http://localhost:3000" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/analysis");
    await expect(page.getByText("Build the base for real analysis")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Add account" })).toBeVisible();
    // Derived latestSnapshotAt is null when snapshots are empty → no freshness badge.
    await expect(page.getByText(/Snapshot /)).toHaveCount(0);
  } finally {
    await cleanupAnalysisEmptyFixture();
  }
});
```

Create `tests/e2e/analysis-history-mobile.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  cleanupAnalysisFixture,
  hasAnalysisFixtureDatabase,
  seedAnalysisFixture,
} from "./analysis-fixture";

const E2E_MOBILE_EMAIL = "e2e-mobile@preview.local";

test("analysis #history deep link still renders HistoryView on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "Mobile Chrome", "Mobile-only #history tab.");
  test.skip(!hasAnalysisFixtureDatabase(), "Populated Analysis QA requires DATABASE_URL.");
  const fixture = await seedAnalysisFixture(E2E_MOBILE_EMAIL);
  try {
    await page.goto("/analysis#history");
    await expect(page.getByText(/Tracking since/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Net Worth")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Movement/ })).toHaveCount(0);
  } finally {
    await cleanupAnalysisFixture(fixture, E2E_MOBILE_EMAIL);
  }
});
```

- [ ] **Step 2: Run the E2E tests to verify they fail (RED) — before Tasks 1-5 land**

Run: `pnpm test:e2e --project=chromium tests/e2e/analysis-populated.spec.ts tests/e2e/analysis-empty.spec.ts`
Run: `pnpm test:e2e --project="Mobile Chrome" tests/e2e/analysis-history-mobile.spec.ts`
Expected: FAIL — month-label tests fail (server still ships `label`, so ticks exist but the assertion depends on the injected-range path), the stale-range test fails (no `resolveActiveRange`), and/or the empty `#history` paths fail on the still-present `meta.hasSnapshots`. Any failure caused by the not-yet-implemented production behavior is the correct RED.

- [ ] **Step 3: Implement (GREEN) — apply Tasks 1-5 if not already applied, then re-run**

With Tasks 1-5 in place, re-run the E2E:
Run: `pnpm test:e2e --project=chromium tests/e2e/analysis-populated.spec.ts tests/e2e/analysis-empty.spec.ts`
Run: `pnpm test:e2e --project="Mobile Chrome" tests/e2e/analysis-history-mobile.spec.ts`
Expected: PASS — all five scenarios green.

- [ ] **Step 4: Full verification suite**

```bash
pnpm format:check          # if it reports changed files, run: pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e --project=chromium tests/e2e/analysis-populated.spec.ts tests/e2e/analysis-empty.spec.ts
pnpm test:e2e --project="Mobile Chrome" tests/e2e/analysis-history-mobile.spec.ts
```

Expected: all green. `test:e2e` requires `DATABASE_URL`; the Playwright `webServer` builds and starts the app automatically when no `PLAYWRIGHT_TEST_BASE_URL` is set.

- [ ] **Step 5: No commit (default).** If the user explicitly requested commits:

```bash
git add tests/e2e/analysis-fixture.ts tests/e2e/analysis-populated.spec.ts tests/e2e/analysis-empty.spec.ts tests/e2e/analysis-history-mobile.spec.ts
git commit -m "test(analysis): real-surface E2E for locale-independent payload, stale range, empty data, and mobile history"
```

**Acceptance Criteria:** All five E2E scenarios pass in their projects; `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm build` all succeed; no commit is created unless explicitly requested.

---

## Commit Strategy

**Default — no commits.** This overrides the generic writing-plans per-task "Commit" step. The executor edits the working tree only and hands the diff to the user for review. `git status` must never show a new commit from this work.

**If the user explicitly requests commits**, create one atomic commit per task in the order the tasks completed, each containing exactly that task's files, with these messages:

1. `refactor(analysis): move range module to src/lib and add messageKey to ranges`
2. `refactor(analysis): drop locale from server series and emit month keys without labels`
3. `refactor(analysis): format month labels client-side in cash flow, growth, and return charts`
4. `feat(analysis): locale-independent cached payload and meta reduced to defaultRange`
5. `fix(analysis): fall back to defaultRange for stale persisted ranges`
6. `test(analysis): real-surface E2E for locale-independent payload, stale range, empty data, and mobile history`

Commits 2 and 3 may be merged only if the user prefers a single commit, since they are wave-2 parallel tasks; all others stay separate.

---

## Success Criteria

- [ ] `ANALYSIS_RANGES` carries `label` / `months` / `messageKey`; `AnalysisView` builds segmented options from it and no longer declares `rangeLabelKey`.
- [ ] An unknown persisted range falls back to `meta.defaultRange` before `t()` and series access; the route never calls `t(undefined)`.
- [ ] `getCachedAnalysisPayload(userId, baseCurrency)` is locale-independent; cache key parts are `["analysis-payload", userId, baseCurrency]`.
- [ ] Server series (`cashFlowBuckets`, `cumulativeGrowth`, `returnTrend`) expose `monthKey` only; the three charts format labels with the active next-intl locale.
- [ ] `AnalysisPayloadMeta` has only `defaultRange`; `AnalysisView` derives `hasData` and `latestSnapshotAt` from `snapshots` with the exact server-equivalent expressions.
- [ ] `src/lib/analysis-range.ts` and `src/lib/analysis-contract.ts` exist; no `src/lib/services` module imports from `src/components`.
- [ ] All existing aggregation-parity, range, series, history, and first-day tests pass unchanged in outcome.
- [ ] All five E2E scenarios pass (happy/populated + range switching, stale-range fallback, en-US and zh-TW month labels, empty-data, mobile `#history`).
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build` all pass.
- [ ] No commits were made unless the user explicitly requested them; no `unstable_cache`→`use cache` migration, no chart/copy/formula changes, no new dependencies, no `NormalizedSnapshot` extraction, no `DrawdownPoint.label` changes.
