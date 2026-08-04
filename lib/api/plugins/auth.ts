/**
 * Elysia auth macro backed by Better Auth.
 *
 * Routes opting in with `{ auth: true }` get `user` and `session` in context;
 * requests without a valid session cookie stop at 401 before the handler runs.
 */
import { Elysia } from "elysia";
import { auth } from "@/lib/auth";

export const authPlugin = new Elysia({ name: "auth" }).macro({
  auth: {
    resolve: async ({ request, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { error: "unauthorized" });
      return { user: session.user, session: session.session };
    },
  },
});
