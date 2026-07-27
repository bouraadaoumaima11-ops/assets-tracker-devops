import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { userExists } from "@/lib/auth-user";

type AppSession = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
} | null;

/**
 * Cached session wrapper. Identity always comes from the signed session cookie
 * via `auth()` — never from a request header, which a client can forge whenever
 * the middleware does not run (see #639). React `cache()` keeps this to one JWT
 * decode per request across all call sites, and the database check makes sure a
 * stale cookie cannot render a signed-in shell.
 */
export const getSession = cache(async (): Promise<AppSession> => {
  const session = await auth();
  if (!session?.user?.id) return session;

  const exists = await userExists(session.user.id);
  return exists ? session : null;
});
