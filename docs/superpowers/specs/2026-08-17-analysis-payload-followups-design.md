# Analysis Payload Follow-ups Design

## Goal

Resolve the four follow-ups tracked in GitHub issue #689 without changing the analysis page's calculations, range choices, visual layout, or interaction model.

## Scope

This change covers:

1. Make the cached analysis payload locale-independent and format month labels in client charts.
2. Move shared analysis range definitions and payload contracts into neutral `src/lib` modules.
3. Remove `hasSnapshots` and `latestSnapshotAt` from payload metadata because the client already receives `snapshots`.
4. Make `ANALYSIS_RANGES` the single source of truth for range labels, durations, and translation keys.

It does not migrate `unstable_cache` to Cache Components, change analysis calculations, remove the mobile `#history` route, alter chart presentation, or address the unrelated `DrawdownPoint.label` and source-grepping-test notes in #689.

## Architecture

Create two neutral modules:

- `src/lib/analysis-range.ts` owns `ANALYSIS_RANGES`, `RangeLabel`, range resolution, default selection, and range lookup behavior. Move the current pure range module from `src/components/analysis` without changing date semantics.
- `src/lib/analysis-contract.ts` owns the serializable `AnalysisRangeSeries`, `AnalysisPayload`, and `AnalysisPayloadMeta` types used by server services and the client view.

Server-only services remain responsible for database reads, cache construction, and server aggregation. Client components import runtime range definitions and contract types only from neutral modules. No module under `src/lib/services` may import from `src/components` as part of this flow.

`AnalysisPayloadMeta` retains only `defaultRange`. Keeping the existing `meta` wrapper minimizes payload and call-site churn while removing the two redundant fields.

## Locale-independent Payload

Remove `locale` from `getCachedAnalysisPayload`, `computeAllRangeSeries`, and `computeAnalysisRangeSeries`. The cache identity remains user and base-currency specific; locale no longer creates a second heavy payload entry.

Server-computed series emit stable `monthKey` values only:

- `CashFlowBucket` no longer carries a localized `label`.
- `CumulativeGrowthPoint` no longer copies that label.
- `ReturnTrendPoint` no longer carries a localized `label`.

`buildCashFlowBuckets` and `computeInvestmentReturnSeries` therefore no longer accept `locale`. Their calculations and ordering remain unchanged.

`cash-flow-chart.tsx`, `cumulative-growth-chart.tsx`, and `return-trend-chart.tsx` obtain the active locale from `next-intl` and call the existing `formatMonthLabel(monthKey, locale)` at render-data preparation time. This matches the existing client-side pattern in the assets/liabilities chart, category trend chart, and KPI tiles.

## Range Definition

Each `ANALYSIS_RANGES` entry carries:

- `label`: persisted/internal range identity.
- `months`: range calculation input.
- `messageKey`: the `analysis` namespace translation key.

`analysis-view.tsx` builds segmented options directly from these entries and no longer declares `rangeLabelKey`.

A persisted range value can be stale at runtime despite the TypeScript generic. Range lookup must therefore fall back to the server-provided `defaultRange` descriptor before translating or selecting series. An unknown stored value must never call `t(undefined)` or crash the route.

## Derived Metadata

`analysis-view.tsx` derives:

- `hasData` from `snapshots.length > 0`.
- `latestSnapshotAt` from `snapshots.at(-1)?.createdAt ?? null`.

These expressions match the current server computations exactly. `defaultRange` remains server-computed from one frozen clock reading so Taiwan calendar-day behavior and cache-fill consistency remain unchanged.

## Data Flow

1. The analysis Server Component resolves authentication, settings, locale, and accounts in parallel.
2. It requests a locale-independent cached payload using only user ID and base currency.
3. Server services precompute all range calculations with stable month keys.
4. The Server Component passes the payload plus locale to `AnalysisView`.
5. `AnalysisView` resolves a valid active range and passes locale-independent series to charts.
6. Client charts format month keys using the active locale.

## Testing

Follow RED to GREEN for behavior changes.

### Locale-independent cache and series

- Add or update unit coverage proving analysis series are identical without a locale input and expose month keys without preformatted labels.
- Add a cache-boundary test using a mocked `unstable_cache` that proves locale is not accepted by `getCachedAnalysisPayload` and is absent from explicit key parts.
- Preserve all existing aggregation parity assertions.

### Range definitions and stale persistence

- Extend `analysis-range.test.ts` to prove each range includes the correct message key.
- Add client behavior coverage proving an unknown persisted range falls back to `defaultRange` before translation and series access.

### Derived metadata

- Add client behavior coverage for empty snapshots and populated snapshots, including the latest snapshot timestamp.
- Keep the existing empty-state and populated analysis E2E scenarios green.

### Real-surface verification

- Run the populated analysis Playwright scenario in Chromium.
- Verify range switching remains functional.
- Verify English and Traditional Chinese month labels render from the same locale-independent series shape.
- Inject an unknown persisted range and verify the page falls back without an exception.

## Verification Commands

- Targeted Vitest files for analysis range, service, series, payload, and client behavior.
- `pnpm test:unit`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- The relevant Playwright analysis scenario.

## Non-goals

- No `unstable_cache` to `use cache` migration.
- No chart redesign or copy change.
- No new analysis ranges.
- No analysis formula changes.
- No extraction of `NormalizedSnapshot` or broader service-directory reorganization.
- No cleanup of unrelated issue #689 observations.
