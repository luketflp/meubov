/**
 * Client-side navigation helpers for authentication transitions.
 *
 * Every sign-in / sign-up / sign-out must both navigate AND revalidate: a plain
 * `router.push` on a client component does not re-run the proxy or refresh
 * server-rendered data, which can leave stale UI (e.g. still seeing protected
 * content after logging out). Centralizing the `push` + `refresh` pair here keeps
 * the four auth transitions consistent and avoids repeating the sequence.
 */
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/** Where the user lands after signing out (landing page with the auth modal). */
const SIGN_OUT_REDIRECT = "/";

/** A router that can navigate and revalidate after an auth transition. */
type AuthRouter = Pick<ReturnType<typeof useRouter>, "push" | "refresh">;

/**
 * Navigates to `path` and revalidates server data so the proxy and any server
 * components re-evaluate the (now changed) session state.
 */
export function navigateAfterAuth(router: AuthRouter, path: string): void {
  router.push(path);
  router.refresh();
}

/**
 * Returns a stable handler that signs the user out and sends them to the
 * landing page, refreshing so protected content is not left visible.
 */
export function useSignOut(): () => Promise<void> {
  const router = useRouter();

  return useCallback(async () => {
    // The snapshot holds this user's farm and leaves with them. The fila stays:
    // it is sent once the same user signs in again. Imported on demand so the
    // sign-in pages that use this module do not load the herd store.
    const { clearOfflineSnapshots } = await import("@/lib/store/useHerdStore");
    await clearOfflineSnapshots();
    await authClient.signOut();
    navigateAfterAuth(router, SIGN_OUT_REDIRECT);
  }, [router]);
}
