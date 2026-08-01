import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "e2e-smoke-test";
const ENABLE_PUBLIC_DEMO_PROJECTS =
  !process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.E2E_PUBLIC_DEMO === "1";

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup",
  globalTeardown: "./tests/e2e/global-teardown",
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Authenticated specs share one preview user and mutate its account data.
  // Keep CI serial so a fresh database produces deterministic results.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // The PWA service worker (#404) intercepts fetches, which bypasses
    // page.route() mocks (e.g. the /api/search mock in stocks.spec.ts).
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /public-demo\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json",
      },
    },
    {
      name: "Mobile Chrome",
      testIgnore: /public-demo\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        storageState: "tests/e2e/.auth/user.json",
      },
    },
    ...(ENABLE_PUBLIC_DEMO_PROJECTS
      ? [
          {
            name: "Public Demo Desktop",
            testMatch: /public-demo\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: { cookies: [], origins: [] },
              locale: "en-US",
              extraHTTPHeaders: { "x-forwarded-for": "198.51.100.101" },
            },
          },
          {
            name: "Public Demo Mobile zh-TW",
            testMatch: /public-demo\.spec\.ts/,
            use: {
              ...devices["Pixel 7"],
              storageState: { cookies: [], origins: [] },
              locale: "zh-TW",
              extraHTTPHeaders: { "x-forwarded-for": "198.51.100.102" },
            },
          },
        ]
      : []),
  ],
  ...(process.env.PLAYWRIGHT_TEST_BASE_URL
    ? {}
    : {
        webServer: {
          command: "pnpm build && pnpm start",
          url: BASE_URL,
          reuseExistingServer: false,
          env: {
            VERCEL_ENV: "preview",
            PREVIEW_AUTH_ENABLED: "true",
            PREVIEW_AUTH_PASSWORD: E2E_PASSWORD,
            PUBLIC_DEMO_ENABLED: "true",
            // Deterministic offline Yahoo stub (see yahoo-client.ts) — the
            // smoke suite must not depend on Yahoo's rate limiter.
            E2E_YAHOO_STUB: "1",
          },
        },
      }),
});
