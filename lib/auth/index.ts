/**
 * Better Auth server instance for MeuBov.
 *
 * Wires Better Auth to the app's Drizzle + Postgres client. Auth data (user,
 * session, account, verification) lives in the same database as the herd
 * schema; the herd API (lib/api) reads the session through `auth.api` to scope
 * every request to the user's farm.
 *
 * Configuration notes:
 * - `drizzleAdapter(db, { provider: "pg", schema, usePlural: false })`. Table
 *   keys in the schema are singular (`user`, `session`, ...), so `usePlural` is
 *   false. Columns are snake_case, matching the db client's global
 *   `casing: "snake_case"`.
 * - `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are read from the environment by
 *   Better Auth automatically; no need to pass them explicitly.
 * - Google is only enabled when both credentials are present, so email/password
 *   sign-in keeps working (and the app does not crash) without Google configured.
 * - `emailAndPassword.autoSignIn: false` makes sign-up return a GENERIC response
 *   for an already-registered e-mail (Better Auth hashes the password and returns
 *   a synthetic user instead of throwing USER_ALREADY_EXISTS), which prevents
 *   user enumeration. The trade-off is that sign-up no longer starts a session,
 *   so the AuthDialog switches to the login form afterwards.
 * - `nextCookies()` must be the LAST plugin so cookies are set on responses in
 *   Next.js server actions / route handlers.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { BetterAuthOptions } from "better-auth";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Add the Google provider only when BOTH credentials are configured. */
const socialProviders: BetterAuthOptions["socialProviders"] =
  googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : undefined;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: false,
  }),
  emailAndPassword: {
    enabled: true,
    // Return a generic response for duplicate e-mails (prevents enumeration).
    // Sign-up therefore does not create a session; the AuthDialog switches to
    // the login form afterwards.
    autoSignIn: false,
  },
  socialProviders,
  // nextCookies() must be the last plugin.
  plugins: [nextCookies()],
});
