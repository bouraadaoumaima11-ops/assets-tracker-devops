import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_ERROR_CODES } from "@/lib/demo/demo-errors";

type CredentialsProvider = {
  id?: string;
  name?: string;
  authorize?: (credentials: Record<string, unknown>) => Promise<unknown>;
};

type CapturedAuthConfig = {
  providers: CredentialsProvider[];
  callbacks?: Record<string, unknown>;
};

const h = vi.hoisted(() => ({
  authConfig: null as CapturedAuthConfig | null,
  publicDemoEnabled: true,
  authenticateDemoTicket: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getAuthContext: vi.fn(),
  requestHeaders: new Headers(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  rateLimitCheckWithPrune: vi.fn(),
  getClientIpFromHeaders: vi.fn(() => "203.0.113.7"),
  ensureDemoWorkspace: vi.fn(),
  createDemoLoginTicket: vi.fn(() => "signed-demo-ticket"),
}));

vi.mock("next-auth", () => ({
  default: (config: CapturedAuthConfig) => {
    h.authConfig = config;
    return { handlers: {}, auth: vi.fn(), signIn: h.signIn, signOut: h.signOut };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: CredentialsProvider) => ({ id: config.id ?? "credentials", ...config }),
}));

vi.mock("@/auth.config", () => ({ default: { providers: [] } }));
vi.mock("@/lib/auth-adapter", () => ({ customPrismaAdapter: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { upsert: vi.fn() } } }));
vi.mock("@/lib/env", () => ({
  AUTH_SECRET: "task-7-unit-secret",
  AUTH_SELF_HOST_PASSWORD: undefined,
  isSelfHostAuthEnabled: false,
  isPreviewAuthEnabled: true,
  previewAuthRequiresPassword: false,
  PREVIEW_AUTH_PASSWORD: undefined,
  get isPublicDemoEnabled() {
    return h.publicDemoEnabled;
  },
}));
vi.mock("@/lib/demo/demo-service", () => ({
  authenticateDemoTicket: h.authenticateDemoTicket,
  ensureDemoWorkspace: h.ensureDemoWorkspace,
}));
vi.mock("@/lib/demo/demo-crypto", () => ({
  createDemoLoginTicket: h.createDemoLoginTicket,
}));
vi.mock("@/lib/auth-session", () => ({ getAuthContext: h.getAuthContext }));
vi.mock("@/lib/rate-limit", () => ({
  getClientIpFromHeaders: h.getClientIpFromHeaders,
  rateLimitCheckWithPrune: h.rateLimitCheckWithPrune,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => h.requestHeaders),
  cookies: vi.fn(async () => ({ get: h.cookieGet, set: h.cookieSet })),
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));

async function loadAuthConfig(): Promise<CapturedAuthConfig> {
  h.authConfig = null;
  await import("@/auth");
  if (!h.authConfig) throw new Error("NextAuth config was not captured");
  return h.authConfig;
}

async function loadStartAction() {
  return (await import("@/app/demo/actions")).startPublicDemoAction;
}

describe("public Demo credentials provider", () => {
  beforeEach(() => {
    vi.resetModules();
    h.publicDemoEnabled = true;
    h.authenticateDemoTicket.mockReset();
  });

  it("registers public-demo separately from Internal Test Login", async () => {
    const config = await loadAuthConfig();

    expect(config.providers.map(({ id }) => id)).toEqual(["credentials", "public-demo"]);
    expect(config.providers.find(({ id }) => id === "public-demo")?.name).toBe("Public Demo");
  });

  it("returns the low-privilege user authenticated by a bound valid ticket", async () => {
    const demoUser = {
      id: "demo-user",
      name: "Demo visitor",
      email: null,
      image: null,
      isDemo: true,
      demoExpiresAt: "2026-08-02T00:00:00.000Z",
    };
    h.authenticateDemoTicket.mockResolvedValue(demoUser);
    const config = await loadAuthConfig();
    const provider = config.providers.find(({ id }) => id === "public-demo");

    await expect(
      provider?.authorize?.({ ticket: "valid-ticket", visitorToken: "matching-visitor" }),
    ).resolves.toEqual(demoUser);
    expect(h.authenticateDemoTicket).toHaveBeenCalledWith({
      ticket: "valid-ticket",
      visitorToken: "matching-visitor",
      now: expect.any(Date),
    });
  });

  it.each([
    ["tampered ticket", { ticket: "tampered", visitorToken: "matching-visitor" }],
    ["mismatched visitor token", { ticket: "valid-ticket", visitorToken: "wrong-visitor" }],
    ["expired workspace", { ticket: "expired-workspace", visitorToken: "matching-visitor" }],
  ])("rejects a %s rejected by authoritative Demo authentication", async (_label, credentials) => {
    h.authenticateDemoTicket.mockResolvedValue(null);
    const config = await loadAuthConfig();
    const provider = config.providers.find(({ id }) => id === "public-demo");

    await expect(provider?.authorize?.(credentials)).resolves.toBeNull();
  });

  it("rejects malformed credentials without attempting authentication", async () => {
    const config = await loadAuthConfig();
    const provider = config.providers.find(({ id }) => id === "public-demo");

    await expect(
      provider?.authorize?.({ ticket: 123, visitorToken: "visitor" }),
    ).resolves.toBeNull();
    await expect(
      provider?.authorize?.({ ticket: "ticket", visitorToken: null }),
    ).resolves.toBeNull();
    expect(h.authenticateDemoTicket).not.toHaveBeenCalled();
  });

  it("does not register public-demo while the kill switch is off", async () => {
    h.publicDemoEnabled = false;

    const config = await loadAuthConfig();

    expect(config.providers.map(({ id }) => id)).toEqual(["credentials"]);
  });
});

describe("startPublicDemoAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    h.publicDemoEnabled = true;
    h.signIn.mockReset().mockResolvedValue(undefined);
    h.signOut.mockReset().mockResolvedValue(undefined);
    h.getAuthContext.mockReset().mockResolvedValue({ status: "anonymous" });
    h.requestHeaders = new Headers({ "x-forwarded-for": "198.51.100.9, 203.0.113.7" });
    h.cookieGet.mockReset().mockReturnValue(undefined);
    h.cookieSet.mockReset();
    h.redirect.mockClear();
    h.rateLimitCheckWithPrune.mockReset().mockReturnValue(null);
    h.getClientIpFromHeaders.mockClear();
    h.ensureDemoWorkspace.mockReset().mockResolvedValue({
      userId: "demo-user",
      visitorHash: "visitor-hash",
      expiresAt: new Date("2026-08-02T00:00:00.000Z"),
      resumed: false,
    });
    h.createDemoLoginTicket.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a 256-bit visitor identity, sets the workspace-bounded cookie, and signs in server-side", async () => {
    const startPublicDemoAction = await loadStartAction();

    await expect(startPublicDemoAction({ errorCode: null }, new FormData())).resolves.toEqual({
      errorCode: null,
    });

    const visitorToken = h.ensureDemoWorkspace.mock.calls[0]?.[0].visitorToken as string;
    expect(Buffer.from(visitorToken, "base64url")).toHaveLength(32);
    expect(h.ensureDemoWorkspace).toHaveBeenCalledWith({
      visitorToken,
      clientIp: "203.0.113.7",
      locale: "en-US",
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(h.cookieSet).toHaveBeenCalledWith(
      "asset-tracker-demo-visitor",
      visitorToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: new Date("2026-08-02T00:00:00.000Z"),
      }),
    );
    expect(h.createDemoLoginTicket).toHaveBeenCalledWith(
      {
        version: 1,
        userId: "demo-user",
        visitorHash: "visitor-hash",
        expiresAt: new Date("2026-08-01T00:01:00.000Z").getTime(),
      },
      "task-7-unit-secret",
    );
    expect(h.signIn).toHaveBeenCalledWith("public-demo", {
      ticket: "signed-demo-ticket",
      visitorToken,
      redirectTo: "/",
    });
  });

  it("resumes with the existing visitor identity without extending the workspace expiry", async () => {
    const visitorToken = "A".repeat(43);
    const expiresAt = new Date("2026-08-01T12:00:00.000Z");
    h.cookieGet.mockImplementation((name: string) =>
      name === "asset-tracker-demo-visitor" ? { value: visitorToken } : undefined,
    );
    h.ensureDemoWorkspace.mockResolvedValue({
      userId: "demo-user",
      visitorHash: "visitor-hash",
      expiresAt,
      resumed: true,
    });
    const startPublicDemoAction = await loadStartAction();

    await startPublicDemoAction({ errorCode: null }, new FormData());

    expect(h.ensureDemoWorkspace).toHaveBeenCalledWith(expect.objectContaining({ visitorToken }));
    expect(h.cookieSet).toHaveBeenCalledWith(
      "asset-tracker-demo-visitor",
      visitorToken,
      expect.objectContaining({ expires: expiresAt }),
    );
  });

  it("uses the persisted locale only for the supported Chinese fixture", async () => {
    h.cookieGet.mockImplementation((name: string) =>
      name === "NEXT_LOCALE" ? { value: "zh-TW" } : undefined,
    );
    const startPublicDemoAction = await loadStartAction();

    await startPublicDemoAction({ errorCode: null }, new FormData());

    expect(h.ensureDemoWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "zh-TW" }),
    );
  });

  it.each(["formal", "demo"])(
    "redirects an already-active %s principal before guard or database work",
    async (kind) => {
      h.getAuthContext.mockResolvedValue({
        status: "active",
        session: { user: { id: `${kind}-user` } },
        principal: { kind, userId: `${kind}-user` },
      });
      const startPublicDemoAction = await loadStartAction();

      await expect(startPublicDemoAction({ errorCode: null }, new FormData())).rejects.toThrow(
        "NEXT_REDIRECT:/",
      );
      expect(h.rateLimitCheckWithPrune).not.toHaveBeenCalled();
      expect(h.ensureDemoWorkspace).not.toHaveBeenCalled();
    },
  );

  it("returns a stable rate-limit state before cookie or database work", async () => {
    h.rateLimitCheckWithPrune.mockReturnValue(
      new Response(null, { status: 429, headers: { "Retry-After": "17" } }),
    );
    const startPublicDemoAction = await loadStartAction();

    await expect(startPublicDemoAction({ errorCode: null }, new FormData())).resolves.toEqual({
      errorCode: "DEMO_RATE_LIMITED",
      retryAfterSeconds: 17,
    });
    expect(h.cookieGet).not.toHaveBeenCalled();
    expect(h.ensureDemoWorkspace).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it("returns stable service errors without exposing the ticket or visitor identity", async () => {
    const { PublicDemoError } = await import("@/lib/demo/demo-errors");
    h.ensureDemoWorkspace.mockRejectedValue(
      new PublicDemoError("DEMO_AT_CAPACITY", 503, "capacity", 29),
    );
    const startPublicDemoAction = await loadStartAction();

    await expect(startPublicDemoAction({ errorCode: null }, new FormData())).resolves.toEqual({
      errorCode: "DEMO_AT_CAPACITY",
      retryAfterSeconds: 29,
    });
    expect(h.cookieSet).not.toHaveBeenCalled();
    expect(h.createDemoLoginTicket).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
  });
});

describe("public Demo login localization", () => {
  it.each(["messages/en-US.json", "messages/zh-TW.json"])(
    "defines every stable action error in %s",
    (path) => {
      const messages = JSON.parse(readFileSync(path, "utf8")) as {
        demo?: { login?: { errors?: Record<string, string> } };
      };

      expect(Object.keys(messages.demo?.login?.errors ?? {}).sort()).toEqual(
        [...DEMO_ERROR_CODES].sort(),
      );
      expect(Object.values(messages.demo?.login?.errors ?? {}).every(Boolean)).toBe(true);
    },
  );
});
