/**
 * Better Auth catch-all route handler.
 *
 * Mounts the Better Auth server at `/api/auth/*`. This handles sign-in, sign-up,
 * sign-out, session lookups and the OAuth callbacks (e.g. the Google callback at
 * `/api/auth/callback/google`).
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth.handler);
