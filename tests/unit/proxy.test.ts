import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, resolvePrincipalMock, headersMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolvePrincipalMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: unknown) => handler,
  }),
}));

vi.mock("../../src/auth.config", () => ({ default: {} }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/auth-principal", () => ({ resolvePrincipal: resolvePrincipalMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));

import proxy, { config } from "@/proxy";
import { getSession } from "@/lib/auth-session";

const TUNNEL_PATH = "/a1b2c3d4";

function executeAnonymousRequest(pathname: string): Response {
  const request = new NextRequest(`https://astt.app${pathname}`);
  const response = proxy(request, {} as NextFetchEvent);

  if (!(response instanceof Response)) {
    throw new Error("Proxy did not return a response for an anonymous request");
  }

  return response;
}

function executeAuthenticatedRequest(pathname: string, isDemo: boolean): Response {
  const request = new NextRequest(`https://astt.app${pathname}`, {
    headers: { cookie: "authjs.session-token=signed-session" },
  });
  Object.defineProperty(request, "auth", {
    value: {
      user: {
        id: isDemo ? "demo-user" : "formal-user",
        isDemo,
        demoExpiresAt: isDemo ? "2026-08-02T00:00:00.000Z" : null,
      },
    },
  });
  const response = proxy(request, {} as NextFetchEvent);

  if (!(response instanceof Response)) {
    throw new Error("Proxy did not return a response for an authenticated request");
  }

  return response;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Sentry tunnel proxy bypass", () => {
  it("continues an anonymous request for the exact configured tunnel path", () => {
    vi.stubEnv("_sentryRewritesTunnelPath", TUNNEL_PATH);

    const response = executeAnonymousRequest(TUNNEL_PATH);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects a different anonymous protected pathname to login", () => {
    vi.stubEnv("_sentryRewritesTunnelPath", TUNNEL_PATH);

    const response = executeAnonymousRequest(`${TUNNEL_PATH}/extra`);

    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("location")).toBe("https://astt.app/login");
  });
});

// Regression cover for #639: the matcher's bot-probe exclusions carried a
// leading `.*`, and JS `.` matches `/`, so any path containing `.env`/`.php`/…
// skipped the middleware — including real dynamic routes like /accounts/x.env.
describe("middleware matcher covers dynamic routes (#639)", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(["clx123", "x.env", "x.php", "x.git", "x.htaccess"])(
    "matches /accounts/%s so the middleware always runs",
    (accountId) => {
      expect(matcher.test(`/accounts/${accountId}`)).toBe(true);
    },
  );

  it("uses no segment-spanning exclusion token", () => {
    expect(config.matcher[0]).not.toContain(".*\\.");
  });

  it.each([
    "/sw.js",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
    "/login",
    "/privacy",
    "/terms",
    "/_next/static/chunk.js",
    "/api/accounts",
  ])("still excludes the non-routable or public path %s", (pathname) => {
    expect(matcher.test(pathname)).toBe(false);
  });
});

describe("bot probe filtering inside the middleware", () => {
  it.each(["/wp-admin", "/xmlrpc.php", "/x.php", "/.env", "/vendor/phpunit/run"])(
    "passes the probe %s through to routing instead of redirecting to login",
    (pathname) => {
      const response = executeAnonymousRequest(pathname);

      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("does not mistake a dotted dynamic account id for a bot probe", () => {
    const response = executeAnonymousRequest("/accounts/x.env");

    expect(response.headers.get("location")).toBe("https://astt.app/login");
  });
});

describe("Demo formal-login handoff", () => {
  it("allows only an active Demo through /login?from=demo", () => {
    const response = executeAuthenticatedRequest("/login?from=demo", true);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects a formal principal that supplies from=demo", () => {
    const response = executeAuthenticatedRequest("/login?from=demo", false);

    expect(response.headers.get("location")).toBe("https://astt.app/");
  });

  it.each(["/login?from=x", "/login?from=demo&from=demo"])(
    "rejects the non-scalar Demo handoff %s",
    (pathname) => {
      const response = executeAuthenticatedRequest(pathname, true);

      expect(response.headers.get("location")).toBe("https://astt.app/");
    },
  );
});

describe("getSession identity source (#639)", () => {
  const VICTIM_ID = "clvictim000000000000000";

  beforeEach(() => {
    authMock.mockReset();
    resolvePrincipalMock.mockReset();
    headersMock.mockReset();
    headersMock.mockResolvedValue(
      new Headers({
        "x-asset-auth-source": "proxy",
        "x-asset-user-id": VICTIM_ID,
      }),
    );
  });

  it("returns no session for forged proxy identity headers without a session cookie", async () => {
    authMock.mockResolvedValue(null);

    await expect(getSession()).resolves.toBeNull();

    expect(resolvePrincipalMock).not.toHaveBeenCalledWith(VICTIM_ID);
  });

  it("never reads request headers to establish identity", async () => {
    authMock.mockResolvedValue(null);

    await getSession();

    expect(headersMock).not.toHaveBeenCalled();
  });

  it("still resolves the cookie-backed session from auth()", async () => {
    const session = { user: { id: "clowner0000000000000000", email: "owner@example.com" } };
    authMock.mockResolvedValue(session);
    resolvePrincipalMock.mockResolvedValue({
      status: "active",
      principal: { kind: "formal", userId: session.user.id },
    });

    await expect(getSession()).resolves.toEqual({
      user: {
        ...session.user,
        isDemo: false,
        demoExpiresAt: null,
      },
    });
    expect(resolvePrincipalMock).toHaveBeenCalledWith(session.user.id);
  });
});

describe("auth proxy rate limiter", () => {
  it("prunes expired IP windows lazily", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T00:00:00.000Z"));
    const deleteSpy = vi.spyOn(Map.prototype, "delete");

    const first = new NextRequest("https://astt.app/api/auth/session", {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    expect(proxy(first, {} as NextFetchEvent)).toBeUndefined();

    vi.setSystemTime(new Date("2026-07-06T00:01:01.000Z"));
    const second = new NextRequest("https://astt.app/api/auth/session", {
      headers: { "x-forwarded-for": "198.51.100.2" },
    });
    expect(proxy(second, {} as NextFetchEvent)).toBeUndefined();

    expect(deleteSpy).toHaveBeenCalledWith("198.51.100.1");

    deleteSpy.mockRestore();
    vi.useRealTimers();
  });
});
