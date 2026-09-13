/**
 * Elysia farm-scope macro: session, active farm and the caller's permissions.
 *
 * Routes opting in with `{ farm: true }` get `user`, `farmId`, `farmRole`,
 * `preset`, `permissions` and `superuser`. The active farm is the optional
 * `x-farm-id` header (403 unless the user is a member of that farm) or the
 * user's oldest membership. A deleted farm counts as no farm at all: its
 * members get 403 not_a_member, as a removed member does. A user with no
 * membership but a pending convite
 * gets 409 `pending_invites`, so the client sends them to /convites before any
 * farm exists for them; any other user with no farm gets one lazily via
 * EnsureFarmForUserUseCase. E-mails in the SUPERUSER_EMAILS allowlist bypass
 * the membership check: any existing farm id in the header is accepted (404 if
 * the farm doesn't exist), and without a header they fall back to the first
 * farm in the database instead of creating an empty one.
 *
 * Once the farm is known, the route's entry in ROUTE_REQUIREMENTS is checked
 * against the resolved levels: 403 `forbidden` names the area that fell short,
 * and a route with no entry is refused. Self-contained (validates the session
 * itself) so routes don't need to combine two macros.
 */
import { Elysia } from "elysia";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isSuperuser } from "@/lib/auth/superuser";
import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers } from "@/lib/db/schema";
import { EnsureFarmForUserUseCase } from "@/lib/api/domains/farm/useCases/EnsureForUser.useCase";
import {
  ROUTE_REQUIREMENTS,
  checkRequirement,
  routeKey,
} from "@/lib/api/permissions/routeRequirements";
import { normalizeEmail } from "@/lib/domain/invites";
import {
  resolvePermissions,
  type FarmRole,
  type MemberPreset,
} from "@/lib/domain/permissions";

interface Membership {
  farmId: number;
  role: FarmRole;
  preset: MemberPreset | null;
  permissions: unknown;
}

/** The Dono's row, and what a superuser without a membership acts as. */
const OWNER = { role: "owner" as const, preset: null, permissions: null };

export const farmPlugin = new Elysia({ name: "farm" }).macro({
  farm: {
    resolve: async ({ request, route, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { error: "unauthorized" });
      const user = session.user;
      const superuser = isSuperuser(user.email);

      const enter = (membership: Membership) => {
        const permissions = resolvePermissions(membership, superuser);
        const verdict = checkRequirement(
          ROUTE_REQUIREMENTS[routeKey(request.method, route)],
          permissions
        );
        if (!verdict.ok) return status(403, { error: "forbidden", area: verdict.area });
        return {
          user,
          farmId: membership.farmId,
          farmRole: membership.role,
          preset: membership.preset,
          permissions,
          superuser,
        };
      };

      const header = request.headers.get("x-farm-id");
      if (header !== null) {
        const farmId = Number(header);
        if (!Number.isInteger(farmId)) {
          return status(400, { error: "invalid_farm_id" });
        }
        const [membership] = await db
          .select({
            role: farmUsers.role,
            preset: farmUsers.preset,
            permissions: farmUsers.permissions,
          })
          .from(farmUsers)
          .innerJoin(farm, eq(farm.id, farmUsers.farmId))
          .where(
            and(
              eq(farmUsers.farmId, farmId),
              eq(farmUsers.userId, user.id),
              isNull(farm.deletedAt)
            )
          )
          .limit(1);
        if (membership) return enter({ farmId, ...membership });
        if (!superuser) return status(403, { error: "not_a_member" });
        const [target] = await db
          .select({ id: farm.id })
          .from(farm)
          .where(and(eq(farm.id, farmId), isNull(farm.deletedAt)))
          .limit(1);
        if (!target) return status(404, { error: "farm_not_found" });
        return enter({ farmId, ...OWNER });
      }

      const [membership] = await db
        .select({
          farmId: farmUsers.farmId,
          role: farmUsers.role,
          preset: farmUsers.preset,
          permissions: farmUsers.permissions,
        })
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, user.id), isNull(farm.deletedAt)))
        .orderBy(asc(farmUsers.createdAt))
        .limit(1);
      if (membership) return enter(membership);

      if (superuser) {
        const [firstFarm] = await db
          .select({ id: farm.id })
          .from(farm)
          .where(isNull(farm.deletedAt))
          .orderBy(asc(farm.id))
          .limit(1);
        if (firstFarm) return enter({ farmId: firstFarm.id, ...OWNER });
      } else {
        const [invite] = await db
          .select({ id: farmInvites.id })
          .from(farmInvites)
          .innerJoin(farm, eq(farm.id, farmInvites.farmId))
          .where(
            and(
              eq(farmInvites.email, normalizeEmail(user.email)),
              eq(farmInvites.status, "pending"),
              gt(farmInvites.expiresAt, new Date()),
              isNull(farm.deletedAt)
            )
          )
          .limit(1);
        if (invite) return status(409, { error: "pending_invites" });
      }

      const farmId = await new EnsureFarmForUserUseCase().run({ userId: user.id });
      return enter({ farmId, ...OWNER });
    },
  },
});
