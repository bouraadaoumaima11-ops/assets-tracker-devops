"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { AUTH_SECRET } from "@/lib/env";
import {
  DEMO_TICKET_TTL_MS,
  DEMO_VISITOR_COOKIE,
  demoVisitorCookieOptions,
  isValidDemoVisitorToken,
} from "@/lib/demo/demo-policy";
import { createDemoLoginTicket } from "@/lib/demo/demo-crypto";
import { PublicDemoError, type DemoErrorCode } from "@/lib/demo/demo-errors";
import { ensureDemoWorkspace } from "@/lib/demo/demo-service";
import { getAuthContext } from "@/lib/auth-session";
import { getClientIpFromHeaders, rateLimitCheckWithPrune } from "@/lib/rate-limit";

export type DemoActionState = {
  errorCode: DemoErrorCode | null;
  retryAfterSeconds?: number;
};

export const INITIAL_DEMO_ACTION_STATE: DemoActionState = { errorCode: null };

export async function startPublicDemoAction(
  _previous: DemoActionState,
  _formData: FormData,
): Promise<DemoActionState> {
  const authContext = await getAuthContext();
  if (authContext.status === "active") redirect("/");
  const requestHeaders = new Headers(await headers());
  const syntheticRequest = new Request("https://asset-tracker.invalid/demo/start", {
    headers: requestHeaders,
  });
  const limited = rateLimitCheckWithPrune(syntheticRequest, {
    limit: 10,
    prefix: "public-demo-start",
  });
  if (limited) {
    const retryAfter = limited.headers.get("Retry-After");
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
    return {
      errorCode: "DEMO_RATE_LIMITED",
      ...(Number.isFinite(retryAfterSeconds) ? { retryAfterSeconds } : {}),
    };
  }

  const cookieStore = await cookies();
  const existingVisitorToken = cookieStore.get(DEMO_VISITOR_COOKIE)?.value;
  const visitorToken = isValidDemoVisitorToken(existingVisitorToken)
    ? existingVisitorToken
    : randomBytes(32).toString("base64url");
  const locale = cookieStore.get("NEXT_LOCALE")?.value === "zh-TW" ? "zh-TW" : "en-US";
  const now = new Date();

  let workspace;
  try {
    workspace = await ensureDemoWorkspace({
      visitorToken,
      clientIp: getClientIpFromHeaders(requestHeaders),
      locale,
      now,
    });
  } catch (error) {
    if (error instanceof PublicDemoError) {
      return { errorCode: error.code, retryAfterSeconds: error.retryAfterSeconds };
    }
    return { errorCode: "DEMO_INITIALIZATION_FAILED" };
  }

  cookieStore.set(DEMO_VISITOR_COOKIE, visitorToken, demoVisitorCookieOptions(workspace.expiresAt));
  const ticketExpiresAt = Math.min(Date.now() + DEMO_TICKET_TTL_MS, workspace.expiresAt.getTime());
  const ticket = createDemoLoginTicket(
    {
      version: 1,
      userId: workspace.userId,
      visitorHash: workspace.visitorHash,
      expiresAt: ticketExpiresAt,
    },
    AUTH_SECRET,
  );
  await signIn("public-demo", { ticket, visitorToken, redirectTo: "/" });
  return INITIAL_DEMO_ACTION_STATE;
}

export async function exitPublicDemoAction() {
  await signOut({ redirectTo: "/login" });
}
