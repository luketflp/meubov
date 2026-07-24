import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Layout for the authenticated area of the app (the `(app)` route group).
 *
 * This Server Component is the REAL authentication gate: it validates the
 * session against Better Auth on every request and redirects to /login when
 * there is none. The proxy's cookie check is only an optimistic UX shortcut and
 * is bypassable (it never validates the cookie), so protection must live here on
 * the server — every in-app page renders as a child of this layout.
 *
 * It then wraps the page with the AppShell (sidebar + mobile tab bar + herd
 * store hydration). The `(app)` route group does not affect URLs, so the
 * dashboard still lives at `/dashboard`, the herd at `/herd`, and so on. The
 * separate `(auth)` group renders the login/signup screens without this shell.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
