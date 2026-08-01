# Public Pre-Login Demo — Design

**Date:** 2026-08-01
**Status:** Approved during brainstorming
**Scope:** Let any unauthenticated visitor create a private, editable, sample-data workspace from the existing login page. The workspace is usable for 24 hours, is never merged into a real account, and is bounded so public traffic cannot materially degrade the authenticated product.

## Summary

Add a secondary **Try the Demo — No Login Required** action to `/login`. Activating it creates or resumes one isolated temporary user, bulk-loads `demo-data.json`, establishes a signed NextAuth JWT session, and redirects to the normal dashboard. The visitor uses the real pages and APIs rather than a simulated frontend.

The main shell shows a persistent Demo banner with the expiry time, **Reset Demo**, and **Sign In to Use** actions. Demo users may edit the product's core financial data, but cannot import, export, or restore backups. The workspace stops accepting reads and writes at its 24-hour expiry and is physically deleted asynchronously. Signing in creates a normal session and does not copy any Demo data.

The existing Preview Login remains available only as an environment-gated internal test facility. It is not the public product Demo and continues to provide a deterministic account for Playwright and hosted-preview tests.

## Goals

- Let a visitor experience the real product without providing credentials or personal data.
- Give every visitor an isolated, editable data set; one visitor must never observe another visitor's mutations.
- Keep the experience close to a normal account across dashboard, accounts, holdings, history, analysis, projections, goals, stocks, and calendar.
- Make the temporary nature, expiry, reset action, and path to formal sign-in continuously clear.
- Bound application CPU, database work, storage, external market-data traffic, and cache churn.
- Preserve existing authentication and E2E behavior for normal and internal-preview users.

## Non-goals

- Carrying Demo data into a formal account, either automatically or by user choice.
- Adding a marketing landing page or guided product tour.
- Reimplementing product behavior in browser storage or mock APIs.
- Making import, export, or backup restore available in Demo mode.
- Tracking per-page visitor behavior or adding third-party product analytics.
- Replacing the fixed internal Preview Login used by development and E2E.

## Existing Context

- All main routes are session-gated by `src/proxy.ts` and `src/app/(main)/layout.tsx`.
- NextAuth uses signed JWT sessions. `getSession()` and `withAuth()` currently verify that the session user still exists.
- Local development and Vercel Preview can expose a fixed credentials-based Preview Login for `e2e-test@preview.local`.
- `demo-data.json` is already the canonical sample payload. It currently contains five accounts, six holdings, 26 holding/cash transactions, two recurring rules, 180 snapshots, one goal, and three watch items—about 225 persisted rows including the user and settings.
- `scripts/seed-demo.mjs` shifts dated sample rows so the newest snapshot lands on the current Taiwan calendar day.
- The application already caches expensive per-user reads with user-specific tags, but many services also use global invalidation tags.
- The one daily snapshot cron also runs recurring transactions, recurring investments, option expiry, price refresh, and FX refresh. Public Demo data must not expand those global scans.

## Chosen Approach

Model each public Demo as a real temporary `User` with an attached one-to-one `DemoWorkspace` record. The user's financial rows use the existing ownership model and relations. Existing pages and services therefore continue to operate on a real user ID, and deleting the user cascades through all owned data.

This was selected over two alternatives:

1. **Separate Demo-only domain models:** clean conceptual separation, but every query, API, cache, and mutation would need a second data path.
2. **Browser-only simulation:** lowest server cost, but behavior would diverge from the actual product and duplicate most application logic.

A shared immutable template with copy-on-first-write was also considered as a later optimization. It is not appropriate for the first version: existing account, holding, transaction, and goal IDs are exposed in URLs and mutation payloads. Cloning on the first mutation would change those IDs and require pervasive source-to-clone ID translation, creating a dangerous path by which a missed guard could mutate the shared template.

## User Experience

### Login page

When `PUBLIC_DEMO_ENABLED=true`, the current login card adds a visually secondary section below the formal login methods:

- Button: **Try the Demo — No Login Required** / **免登入體驗 Demo**.
- Supporting copy: a private sample workspace is created, is retained for 24 hours, and requires no personal data.
- On submission, the button becomes disabled and reads **Preparing sample data…**.
- Repeated submission and concurrent requests for the same visitor resume the same active workspace rather than creating duplicates.

The existing environment-gated Preview Login is relabeled **Internal Test Login** and remains visible only where the current preview-auth policy enables it. Vercel production never displays this internal control.

### Demo shell

The selected presentation is a persistent amber status bar at the top of the authenticated content shell.

Desktop content:

- **Demo mode** label.
- Absolute expiry time, expressed in the active locale, plus a coarse remaining duration.
- **Reset Demo** secondary action.
- **Sign In to Use** primary action.

Mobile content uses two compact rows: status and coarse remaining time on the first row, then equal-width reset and sign-in actions. The exact localized expiry remains available in the accessible label. The banner sits below the mobile header and remains visible while navigating. It must not cover dialogs, toasts, or bottom navigation.

The timer does not announce every tick to assistive technology. An `aria-live` announcement is emitted only at three thresholds: one hour remaining, ten minutes remaining, and expiry.

### Core feature access

Demo visitors use the normal product pages and may:

- Create, edit, archive, reorder, and delete accounts.
- Add and edit holdings and cash/holding transactions.
- Configure recurring cash and investment rules. Automatic materialization is paused in Demo mode and the recurring sections explain this limitation; normal production cron work never executes a Demo rule.
- Create snapshots, labels, goals, watch items, and calendar entries.
- Change normal display preferences, locale, and base currency subject to the Demo refresh budget.
- Use dashboard, history, analysis, and projection views.

The Settings data-management card remains visible so visitors can discover the capability, but its file controls and destructive actions are replaced by an explanation that import, export, and restore require a formal account. The duplicate backup-export action in the Privacy & Security card is replaced by the same explanation. Privacy mode remains usable, while the formal-session/security row becomes Demo-specific copy with **Exit Demo** and **Sign In** actions rather than presenting an email or account-security control. The API enforces the same restrictions; hiding controls is not treated as authorization.

### Reset

**Reset Demo** opens a destructive confirmation dialog explaining that all changes will be discarded. Confirmation replaces all workspace-owned financial data with the current canonical fixture in one transaction.

- A failed reset rolls back and leaves the pre-reset workspace intact.
- Reset does not change `expiresAt`.
- Reset does not reset mutation or refresh usage.
- A workspace may be reset at most three times during its lifetime.
- Successful reset invalidates only that Demo user's cache tags.

### Sign in from Demo

The banner's sign-in action navigates to `/login?from=demo` without first destroying the Demo session. `LoginGate` distinguishes a Demo principal from a formal principal: formal users are redirected away from `/login`, while active Demo users may view the formal login choices and can return to the Demo if OAuth is cancelled.

Successful formal authentication replaces the JWT session. No Demo rows are copied, linked, or merged. The abandoned Demo remains inaccessible through the new session and is removed by normal expiry cleanup.

### Expiry

Access expires exactly 24 hours after initial creation; activity and reset do not extend it.

- The client timer navigates to `/demo/expired` when the deadline passes.
- Middleware uses the signed expiry claim to reject an expired Demo before rendering protected Server Components.
- APIs re-check authoritative workspace state and return `410 DEMO_EXPIRED`.
- `/demo/expired` presents a dialog-style surface with **Start a New Demo** and **Sign In**.
- Starting again is still subject to source and global creation limits.

Expiry is an access boundary, not a promise of synchronous physical deletion. Expired data becomes inaccessible immediately. Physical deletion is targeted within 24 hours after expiry through request-triggered cleanup and the daily cron; a cron or database outage can delay deletion, which the privacy notice states explicitly.

## Architecture

### Components and responsibilities

1. **Public Demo policy**
   - Owns `PUBLIC_DEMO_ENABLED`, fixed quotas, cookie attributes, and error codes.
   - The flag defaults to false and acts as a kill switch for both new and active public Demo sessions.

2. **Demo identity service**
   - Creates or resumes a workspace from the essential visitor cookie.
   - Applies source and global capacity limits atomically.
   - Issues a short-lived signed login ticket consumed by the public-Demo credentials provider.

3. **Demo fixture service**
   - Loads and validates the repository fixture once rather than running the backup-upload pipeline per visitor.
   - Produces a date-shifted canonical fixture once per Taiwan calendar day.
   - Generates fresh IDs and remaps all references.
   - Persists a new or reset workspace through bounded bulk inserts.
   - Exposes the same pure preparation logic to the internal demo seed workflow so the two paths cannot drift.

4. **Principal resolver**
   - Resolves signed session identity once per request and returns `{ userId, isDemo, expiresAt }`.
   - Uses the JWT claim only for fast rejection; APIs verify the database record before authorizing access.
   - Provides a single capability boundary to pages, route handlers, and Server Actions.

5. **Demo mode UI**
   - Renders the status bar, reset confirmation, formal-login transition, and expiry surface.
   - Never decides API authorization.

6. **Cleanup and background-work filters**
   - Deletes expired temporary users in bounded batches.
   - Excludes every active Demo from production cron discovery and global market-data scans.

Each unit has one purpose and can be tested without rendering or invoking the other units.

### Data model

Add a one-to-one relation from `User` to a new model whose presence denotes a public Demo:

```prisma
model DemoWorkspace {
  userId                  String    @id
  user                    User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  visitorHash             String    @unique
  creatorHash             String
  expiresAt               DateTime  @db.Timestamptz(3)
  mutationCount           Int       @default(0)
  mutationWindowStartedAt DateTime? @db.Timestamptz(3)
  mutationWindowCount     Int       @default(0)
  resetCount              Int       @default(0)
  refreshWindowStartedAt  DateTime? @db.Timestamptz(3)
  refreshCount            Int       @default(0)
  createdAt               DateTime  @default(now()) @db.Timestamptz(3)

  @@index([expiresAt])
  @@index([creatorHash, expiresAt])
}
```

`User` gains an optional `demoWorkspace` relation. Normal users and the fixed Internal Test Login user have no `DemoWorkspace` row.

Keeping lifecycle and quota metadata in one bounded model avoids filling `User` with nullable Demo-only columns. Background queries identify formal users with `demoWorkspace: null`; the primary-key relation makes this an indexed anti-join.

### Essential visitor cookie

The server creates a 256-bit random visitor token and stores it in the `asset-tracker-demo-visitor` cookie with:

- `HttpOnly`
- `Secure` in production
- `SameSite=Lax`
- `Path=/`
- A maximum age aligned to the 24-hour workspace lifetime

Only an HMAC-SHA256 digest of the random token is stored as `visitorHash`. It makes Demo creation idempotent and lets a visitor resume after losing the NextAuth session cookie without making the database ID a bearer credential.

### Source limiting and privacy

The raw client IP exists only in request memory. The service derives `creatorHash` with a purpose-separated HMAC key derived from `AUTH_SECRET`; neither the raw IP nor its hash is written to application logs. The hash is deleted with the workspace.

At most five unexpired Demo workspaces may share one `creatorHash`. This is an active-workspace limit over the 24-hour lifetime rather than a calendar-day bucket, so crossing midnight does not reset it.

The privacy page documents the essential visitor cookie, temporary pseudonymous source hash, purpose, and retention.

### Session establishment

The public Demo uses the dedicated credentials provider ID `public-demo`; it does not reuse the internal `credentials` provider.

1. A server action reads or creates the visitor cookie and calls the identity service.
2. The identity service resumes an active workspace or creates and seeds one.
3. It returns a short-lived HMAC-signed login ticket containing the user ID, visitor hash, and ticket expiry.
4. The `public-demo` provider verifies the signature, ticket expiry, visitor-cookie match, feature flag, and active database workspace before returning the user.
5. JWT/session callbacks persist `isDemo` and `demoExpiresAt` as signed claims.

The ticket is valid for at most 60 seconds. Replaying it can only establish the same low-privilege sample-data session; it cannot authenticate a formal account.

### Demo creation transaction

The creation path is ordered as follows:

1. Fast-path an already-authenticated active Demo.
2. Resolve `visitorHash`; reuse a matching unexpired workspace if one exists.
3. Acquire a transaction-scoped PostgreSQL advisory lock dedicated to public Demo capacity.
4. Re-check visitor reuse, the five-per-source limit, and the global limit of 250 unexpired workspaces.
5. Prepare all IDs and foreign-key mappings in memory.
6. Create `User`, `DemoWorkspace`, settings, and all fixture rows through bounded `createMany` operations in dependency order.
7. Commit before issuing the login ticket.

The advisory lock makes the capacity check authoritative across Vercel instances. The fixture is small and bulk-created, so the lock is held for a short, bounded transaction. A unique `visitorHash` prevents double-clicks from producing two workspaces even before the session cookie is installed.

Any error rolls back the entire user, workspace, and sample-data creation. No session ticket is issued for a partial workspace.

### Fixture preparation and persistence

The fixture service does not invoke the general import route. It therefore avoids gzip handling, request-body parsing, backup compatibility work, live FX refresh, and live quote refresh.

Preparation performs one pass to:

- Shift all dated records by a whole number of days so the newest snapshot equals the current Taiwan date.
- Override only the settings locale from `NEXT_LOCALE`; the fixture keeps USD as its base currency.
- Generate fresh account, holding, transaction, recurring-rule, snapshot, goal, watch-item, and calendar IDs.
- Remap account-scoped goal references.
- Remap snapshot breakdown object keys to the new account IDs.
- Preserve all valid recurring-generation provenance.

Persistence uses a fixed number of bulk inserts rather than one Prisma call per row. Shared fallback prices and USD/TWD exchange rates are inserted only when missing and never overwrite fresher global cache rows. No network request occurs during creation or reset.

## Authorization and Resource Controls

### Central capability check

`withAuth` and Server Action guards use the same principal resolver. Demo authorization checks occur in this order:

1. Verify signed session identity.
2. Confirm `PUBLIC_DEMO_ENABLED` remains on.
3. Load the associated `DemoWorkspace` and reject missing or expired records.
4. Check whether the endpoint permits Demo access.
5. Apply the appropriate rate and lifetime quota.
6. Invoke the domain handler with the authoritative user ID.

The request-supplied user ID is never trusted. Formal-account behavior remains unchanged.

### Allowed and denied capabilities

Core domain reads and writes allow Demo principals. Both `GET` and `POST` on the whole-app data-management route require a formal account and return `403 DEMO_RESTRICTED` to Demo principals. The authorization wrapper takes an explicit Demo policy; its default is **deny**. Every core route and Server Action that should work in Demo mode opts in, so a newly added endpoint cannot expose itself to Demo merely because its author omitted a policy. UI visibility is never an authorization boundary.

### Quotas

Initial production limits are fixed constants:

- Five unexpired workspaces per source hash.
- 250 unexpired workspaces globally.
- 30 mutation requests per minute per Demo.
- 250 mutation requests per Demo lifetime.
- Three resets per Demo lifetime.
- Three manual market-data refreshes per ten-minute window anchored at the first refresh in that window.

An authenticated mutation that passes identity, expiry, and capability checks consumes one lifetime mutation credit even if later validation fails. This makes abusive invalid requests costly and avoids complex rollback coupling between unrelated route transactions. Rejected authentication, expired-session, feature-disabled, and capability-denied requests do not consume a credit.

Lifetime, one-minute mutation-window, and ten-minute refresh-window counters use conditional database updates so concurrent Vercel instances cannot exceed them. Reset consumes one normal mutation credit plus one reset credit; both increments occur inside the same transaction as replacement. A failed reset therefore rolls back its credits with the data changes. Counters and expiry otherwise survive reset.

The login action applies a best-effort in-memory start-attempt limit before any database work, and the credentials callback retains the existing `/api/auth` request-rate protection whenever it traverses that route. Neither is treated as the hard resource boundary; the database-backed visitor uniqueness, source limit, and global capacity limit remain authoritative across instances.

## CPU, Database, and Cache Budget

### Application CPU

- Validate the canonical fixture during build/test, not for every visitor.
- Cache the date-shifted canonical representation by Taiwan day.
- Generate all IDs and remapped rows in one linear pass.
- Do not perform import decompression, live quote lookup, live FX lookup, or cache warming during create/reset.
- Compute page payloads only when the visitor opens that page; existing per-user caches serve subsequent navigation.
- Put the signed Demo expiry in the JWT so middleware rejects expired sessions before protected Server Component rendering.
- Request-cache the authoritative principal lookup so nested layouts and pages do not repeat it.

### Database work and storage

- A create/reset performs a fixed number of bulk statements (target: no more than 16 total database statements for fixture persistence), independent of the 180-snapshot row count.
- Index expiry, visitor reuse, and source-limit lookups.
- Keep shared price and FX rows global rather than copying them per Demo.
- The global active limit bounds the current fixture at roughly 56,000 domain rows before normal visitor mutations.
- Lifetime mutation limits bound additional rows even if a client bypasses the UI.

### Cache isolation

Demo mutations invalidate only tags scoped to that user, such as `accounts:{userId}`, `history:{userId}`, `goals:{userId}`, and `calendar-entries:{userId}`. They must not invalidate broad `accounts`, `net-worth`, `snapshots`, `goals`, or similar global tags.

Every cached per-user reader touched by Demo features must carry a user-specific tag. Tests enforce this contract for the invalidation helpers. Shared price/FX cache invalidation remains global only when shared market data actually changes, and Demo manual refresh is subject to its stricter budget and the existing freshness gates.

## Background Work and Cleanup

The daily cron must filter Demo-owned data out of every global phase, not merely the final user snapshot loop:

- Option-expiry discovery.
- Account, holding, settings, and currency discovery.
- Global symbol collection for price refresh.
- Recurring cash materialization.
- Recurring investment materialization.
- User pagination and snapshot creation.

This prevents idle Demo rows and visitor-added symbols from increasing production cron CPU or external API traffic.

At cron start, cleanup selects expired workspace user IDs through the expiry index and deletes users in batches of 25, stopping after 250 users or five seconds, whichever comes first. User deletion cascades to settings, accounts, holdings, transactions, recurring rules, snapshots, goals, watch items, calendar entries, and the `DemoWorkspace` row. Any remainder stays inaccessible and is retried by subsequent cleanup paths.

Additional cleanup paths:

- An expired Demo request schedules deletion after returning the expiry response.
- Starting a Demo deletes a matching expired workspace before creating its replacement.
- When the global capacity check is full, the start path performs one bounded expired-workspace cleanup pass and re-checks capacity.

Cleanup never scans or deletes users without a `DemoWorkspace` relation. Shared `PriceCache` and `ExchangeRate` rows are not deleted with a workspace.

## Error Handling

API responses include stable machine-readable codes, with localized UI copy:

- `403 DEMO_RESTRICTED`: the feature requires a formal account.
- `403 DEMO_QUOTA_EXHAUSTED`: lifetime mutation or reset quota is exhausted.
- `410 DEMO_EXPIRED`: the 24-hour access window ended.
- `429 DEMO_RATE_LIMITED`: a short-window rate limit was exceeded; include `Retry-After`.
- `429 DEMO_SOURCE_LIMIT`: the source already has five unexpired workspaces; include the earliest useful retry time.
- `503 DEMO_AT_CAPACITY`: the global active-workspace limit is full.
- `503 DEMO_DISABLED`: the feature flag is off or was used as a kill switch.
- `500 DEMO_INITIALIZATION_FAILED`: creation failed after rollback; the UI offers retry and formal sign-in.
- `500 DEMO_RESET_FAILED`: reset failed after rollback; the UI keeps the existing workspace and offers retry.

The client treats `410` as a global session transition and navigates to `/demo/expired`, even when it originated from an in-flight mutation. A failed reset retains the old data and shows a non-destructive error toast.

## Security and Privacy

- Public Demo sessions have no email, OAuth account, refresh token, or formal account linkage.
- Signed JWT claims accelerate routing but never replace the database capability check for APIs.
- The internal Preview credentials provider remains separately gated and cannot issue a public Demo session.
- Raw IP values, visitor tokens, visitor hashes, source hashes, user IDs, and financial sample content are excluded from logs and monitoring payloads.
- Existing request-size validation remains in place; Demo cannot reach the bulk import path.
- Essential cookies and pseudonymous source limiting are disclosed in the privacy page.
- Demo data is synthetic. The UI does not solicit real financial data and warns that all changes are temporary.
- Disabling `PUBLIC_DEMO_ENABLED` hides the entry point and makes central Demo authorization reject active sessions without affecting formal sessions or Internal Test Login.

## Observability

Record low-cardinality operational events only:

- Created, resumed, reset, expired, and deleted counts.
- Source-limit, global-capacity, rate-limit, and quota-limit counts.
- Initialization/reset failures.
- Active workspace count sampled during cleanup/start.
- Fixture preparation duration, database persistence duration, and rows inserted.

Do not attach visitor, source, workspace, user, account, symbol, or financial values. Do not add per-page or per-click product analytics in this version.

## Testing

### Unit tests

- Public-Demo environment policy and kill-switch behavior.
- HMAC generation without raw-IP logging.
- Active, boundary-time, and expired workspace resolution (`now >= expiresAt` is expired).
- Login-ticket signature, cookie match, and 60-second expiry.
- Source, global, short-window, lifetime, reset, and refresh quotas.
- Fixture day shifting and single-pass ID remapping, including snapshot breakdown and account-scoped goals.
- Reset preserves expiry and counters.
- One-minute mutation windows and ten-minute refresh windows reset only after their full window elapses.
- Demo-aware invalidation emits user-specific tags and no global domain tags.
- Capability policy denies both backup export and import.
- Demo settings replace formal security/export controls while preserving privacy mode and exit/sign-in actions.

### Integration tests with PostgreSQL

- Two visitors receive different users and cannot read or mutate each other's records.
- Concurrent starts with one visitor token produce one workspace.
- Concurrent capacity and quota checks do not exceed their limits.
- A failure during create leaves no user, workspace, or child rows.
- A failure during reset preserves the complete pre-reset data set.
- User deletion cascades through every owned model.
- Expiry-index cleanup deletes only expired Demo users in bounded batches.
- Bulk persistence stays within the database-statement budget.

### E2E tests

- A fresh browser is redirected to `/login`, sees the public Demo action, and enters a populated dashboard without credentials.
- Desktop and mobile status bars expose mode, expiry, reset, and sign-in actions.
- Representative account, holding, goal, watch-item, and calendar CRUD persists within that Demo only.
- Reset restores the canonical fixture without extending expiry.
- Data-management controls show the formal-account explanation, and direct API calls return `403`.
- Recurring-rule controls explain that automatic execution is paused in Demo mode.
- Forcing the database expiry causes navigation/API calls to reach the expired surface.
- English and Traditional Chinese follow browser locale while the fixture remains USD-based.
- Formal test authentication replaces the Demo session; the resulting data comes only from the formal test account and contains no Demo rows.
- Internal Test Login continues to support the existing deterministic Playwright setup.

### Performance checks

- Creation and reset make zero external network calls.
- The pure fixture-preparation benchmark runs 100 iterations with p95 CPU time below 100ms in CI.
- Ten concurrent creation requests produce no duplicates or partial data; after warm-up, target p95 completion is below five seconds in the Preview environment.
- Demo mutations never trigger broad domain-tag revalidation.
- With a representative active-Demo population, formal daily-cron duration should remain within 10% of its pre-feature baseline; this is a rollout metric rather than a flaky unit-test gate.

## Rollout and Recovery

1. Ship the migration, shared fixture service, authorization boundary, and tests with `PUBLIC_DEMO_ENABLED` unset/false.
2. Verify the existing formal login, self-host login, Internal Test Login, and daily cron while Demo is disabled.
3. Enable the feature in Vercel Preview and run E2E, concurrency, quota, and performance checks.
4. Enable production and monitor creation latency, failures, quota events, cleanup duration, active count, and cron duration.
5. If capacity approaches 80% or failures materially rise, disable the feature before raising limits.
6. In an incident, set `PUBLIC_DEMO_ENABLED=false`; active Demo access stops, while formal sessions and internal preview testing remain available.

Initial quotas are code constants rather than deployment knobs. They should change only in a reviewed code change informed by observed capacity, keeping the operational surface small.

## Acceptance Criteria

- An unauthenticated visitor can enter a populated, real product workspace in one action without credentials.
- Active visitors have isolated data and can use all agreed core features.
- The temporary state and exact expiry are continuously visible on desktop and mobile.
- Reset is atomic, restores canonical data, and cannot extend or replenish the workspace.
- Formal sign-in never imports Demo data.
- Expired or disabled Demo sessions cannot access pages or APIs.
- Direct calls cannot bypass data-management restrictions or quotas.
- Demo activity does not enter the production cron or broadly invalidate formal-user caches.
- Creation/reset use bounded bulk writes and no external market-data requests.
- All temporary user-owned rows are strictly isolated and ultimately removed by cascade cleanup.
- Existing formal and Internal Test Login flows continue to pass their test suites.

## Expected Files and Areas of Change

The implementation plan will refine exact filenames, but the design expects changes in these areas:

- Prisma schema and migration for `DemoWorkspace`.
- Environment validation and public-Demo policy.
- Auth provider, JWT/session typing, login server action, and principal resolver.
- Reusable fixture preparation/persistence service and the existing seed workflow.
- Login page, main layout Demo banner, reset dialog, and expired page.
- API authorization/capability wrapper and data-management route.
- Demo-aware cache invalidation helpers.
- Snapshot cron and recurring/market-data service filters.
- English and Traditional Chinese messages, privacy documentation, deployment documentation, and tests.

No implementation is authorized by this document; implementation begins only after written-spec review and a separate approved execution plan.
