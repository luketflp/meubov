import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Route protection for MeuBov (Next.js 16 "proxy", formerly middleware).
 *
 * This is an OPTIMISTIC UX check only: it looks for the presence of the Better
 * Auth session cookie and redirects accordingly. It does NOT validate the
 * session against the database and is therefore bypassable on its own. The REAL
 * gate is the server-side session check in app/(app)/layout.tsx, which runs
 * `auth.api.getSession` and redirects when there is no valid session. Keeping the
 * proxy cookie-only avoids per-request database hits on every navigation
 * (including prefetches) while the layout enforces authentication.
 *
 * Rules:
 * - No session cookie + not on a public page (/, /login, /signup) -> /login.
 * - Session cookie + on /, /login or /signup                      -> /dashboard.
 * - Otherwise                                                     -> continue.
 *
 * "/" is the public landing page: anonymous visitors see it, signed-in users
 * skip straight to the dashboard (as when "/" itself did the redirect).
 */
const AUTH_PATHS = new Set(["/login", "/signup"]);
const PUBLIC_PATHS = new Set(["/", ...AUTH_PATHS]);

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (!hasSession && !PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except API routes, Next.js internals and static files
  // (anything with an extension, e.g. /farms/*.svg served from /public).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
