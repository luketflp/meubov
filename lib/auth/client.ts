/**
 * Better Auth client for MeuBov.
 *
 * Used by client components (login/signup pages, Sidebar, MobileTabBar) to sign
 * in/up/out and read the current session. No `baseURL` is passed: the app and
 * the auth API share the same origin, so Better Auth defaults to same-origin
 * requests against `/api/auth`.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
