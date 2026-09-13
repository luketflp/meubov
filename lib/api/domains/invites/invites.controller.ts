/**
 * The signed-in user's own convites. Session-only: these run before the user
 * belongs to a farm, and a farm-scoped route would create one for them.
 */
import { Elysia } from "elysia";

import { sessionPlugin } from "@/lib/api/plugins/session";
import { normalizeEmail } from "@/lib/domain/invites";

import { AcceptInviteUseCase } from "./useCases/Accept.useCase";
import { BrowseMyInvitesUseCase } from "./useCases/BrowseMine.useCase";
import { DeclineInviteUseCase } from "./useCases/Decline.useCase";

export const invitesController = new Elysia({ prefix: "/invites" })
  .use(sessionPlugin)
  .get(
    "/",
    ({ user }) =>
      new BrowseMyInvitesUseCase().run({
        userId: user.id,
        email: normalizeEmail(user.email),
        now: new Date(),
      }),
    { session: true }
  )
  .post(
    "/:id/accept",
    async ({ user, params, status }) => {
      const inviteId = Number(params.id);
      const result = Number.isInteger(inviteId)
        ? await new AcceptInviteUseCase().run({
            inviteId,
            userId: user.id,
            email: normalizeEmail(user.email),
            now: new Date(),
          })
        : "not_found";
      if (result === "not_found") return status(404, { error: result });
      return result;
    },
    { session: true }
  )
  .post(
    "/:id/decline",
    async ({ user, params, status }) => {
      const inviteId = Number(params.id);
      const declined =
        Number.isInteger(inviteId) &&
        (await new DeclineInviteUseCase().run({
          inviteId,
          email: normalizeEmail(user.email),
          now: new Date(),
        }));
      if (!declined) return status(404, { error: "not_found" });
      return { id: inviteId };
    },
    { session: true }
  );
