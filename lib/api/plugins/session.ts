/**
 * Elysia session-only macro: `{ session: true }` resolves the signed-in `user`
 * or answers 401, without choosing a farm. For the routes a user reaches before
 * belonging to one: their convites and "Criar minha fazenda".
 */
import { Elysia } from "elysia";
import { auth } from "@/lib/auth";

export const sessionPlugin = new Elysia({ name: "session" }).macro({
  session: {
    resolve: async ({ request, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { error: "unauthorized" });
      return { user: session.user };
    },
  },
});
