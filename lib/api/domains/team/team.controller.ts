/**
 * The farm's team: who is in it, the convites waiting to be claimed, and each
 * member's levels. Permission to reach these routes comes from
 * ROUTE_REQUIREMENTS (Equipe view to read, Equipe edit to change); who may be
 * changed, and how far, is decided by the use cases.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { BrowseTeamUseCase } from "./useCases/BrowseTeam.useCase";
import { CancelInviteUseCase } from "./useCases/CancelInvite.useCase";
import { InviteMemberUseCase } from "./useCases/Invite.useCase";
import { LeaveFarmUseCase } from "./useCases/Leave.useCase";
import { RemoveMemberUseCase } from "./useCases/RemoveMember.useCase";
import { UpdateMemberUseCase } from "./useCases/UpdateMember.useCase";
import { InviteBody, MemberPatchBody } from "./schemas/team.schema";

export const teamController = new Elysia({ prefix: "/farm" })
  .use(farmPlugin)
  .get(
    "/team",
    ({ farmId, user, farmRole, permissions }) =>
      new BrowseTeamUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        now: new Date(),
      }),
    { farm: true }
  )
  .post(
    "/invites",
    async ({ farmId, user, farmRole, permissions, body, status }) => {
      const result = await new InviteMemberUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        email: body.email,
        permissions: body.permissions,
        now: new Date(),
      });
      if (result === "invalid_email") return status(422, { error: result });
      if (result === "already_member") return status(409, { error: result });
      if ("forbidden" in result) {
        return status(403, { error: "forbidden", area: result.forbidden });
      }
      return result;
    },
    { farm: true, body: InviteBody }
  )
  .delete(
    "/invites/:id",
    async ({ farmId, user, farmRole, permissions, params, status }) => {
      const id = Number(params.id);
      const canceled =
        Number.isInteger(id) &&
        (await new CancelInviteUseCase().run({
          farmId,
          id,
          actor: { userId: user.id, role: farmRole, permissions },
          now: new Date(),
        }));
      if (!canceled) return status(404, { error: "not_found" });
      return { id };
    },
    { farm: true }
  )
  .patch(
    "/members/:userId",
    async ({ farmId, user, farmRole, permissions, params, body, status }) => {
      const result = await new UpdateMemberUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        userId: params.userId,
        permissions: body.permissions,
      });
      if (result === "not_found") return status(404, { error: result });
      if ("blocked" in result) return status(403, { error: "blocked", reason: result.blocked });
      if ("forbidden" in result) {
        return status(403, { error: "forbidden", area: result.forbidden });
      }
      return result;
    },
    { farm: true, body: MemberPatchBody }
  )
  .delete(
    "/members/:userId",
    async ({ farmId, user, farmRole, permissions, params, status }) => {
      const result = await new RemoveMemberUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        userId: params.userId,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result !== "removed") return status(403, { error: "blocked", reason: result.blocked });
      return { removed: true };
    },
    { farm: true }
  )
  .post(
    "/leave",
    async ({ farmId, user, farmRole, status }) => {
      const result = await new LeaveFarmUseCase().run({
        farmId,
        userId: user.id,
        role: farmRole,
      });
      if (result === "owner_cannot_leave") return status(409, { error: result });
      return { left: true };
    },
    { farm: true }
  );
