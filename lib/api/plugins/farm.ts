/**
 * Elysia farm-scope macro: session + active farm resolution.
 *
 * Routes opting in with `{ farm: true }` get `user`, `farmId`, `farmRole` and
 * `superuser`. The active farm is the optional `x-farm-id` header (403 unless
 * the user is a member of that farm) or the user's oldest membership; a user
 * with no farm gets one lazily via ensureFarmForUser. E-mails in the
 * SUPERUSER_EMAILS allowlist bypass the membership check: any existing farm id
 * in the header is accepted (404 if the farm doesn't exist), and without a
 * header they fall back to the first farm in the database instead of creating
 * an empty one. Self-contained (validates the session itself) so routes don't
 * need to combine two macros.
 */
import { Elysia } from "elysia";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isSuperuser } from "@/lib/auth/superuser";
import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";
import { ensureFarmForUser } from "@/lib/api/services/onboarding";

export const farmPlugin = new Elysia({ name: "farm" }).macro({
  farm: {
    resolve: async ({ request, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { error: "unauthorized" });
      const user = session.user;
      const superuser = isSuperuser(user.email);

      const header = request.headers.get("x-farm-id");
      if (header !== null) {
        const farmId = Number(header);
        if (!Number.isInteger(farmId)) {
          return status(400, { error: "invalid_farm_id" });
        }
        const [membership] = await db
          .select({ role: farmUsers.role })
          .from(farmUsers)
          .where(and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, user.id)))
          .limit(1);
        if (membership) {
          return { user, farmId, farmRole: membership.role, superuser };
        }
        if (!superuser) return status(403, { error: "not_a_member" });
        const [target] = await db
          .select({ id: farm.id })
          .from(farm)
          .where(eq(farm.id, farmId))
          .limit(1);
        if (!target) return status(404, { error: "farm_not_found" });
        return { user, farmId, farmRole: "owner" as const, superuser };
      }

      const [membership] = await db
        .select({ farmId: farmUsers.farmId, role: farmUsers.role })
        .from(farmUsers)
        .where(eq(farmUsers.userId, user.id))
        .orderBy(asc(farmUsers.createdAt))
        .limit(1);
      if (membership) {
        return { user, farmId: membership.farmId, farmRole: membership.role, superuser };
      }

      if (superuser) {
        const [firstFarm] = await db
          .select({ id: farm.id })
          .from(farm)
          .orderBy(asc(farm.id))
          .limit(1);
        if (firstFarm) {
          return { user, farmId: firstFarm.id, farmRole: "owner" as const, superuser };
        }
      }

      const farmId = await ensureFarmForUser(user.id);
      return { user, farmId, farmRole: "owner" as const, superuser };
    },
  },
});
