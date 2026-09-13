import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites, farmUsers, user } from "@/lib/db/schema";
import { inviteExpiry, isValidEmail, normalizeEmail } from "@/lib/domain/invites";
import {
  canGrant,
  parsePermissions,
  presetFor,
  type Area,
  type Permissions,
} from "@/lib/domain/permissions";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { toTeamInvite, type TeamActor, type TeamInvite } from "./BrowseTeam.useCase";

interface InviteMemberUseCaseProps {
  farmId: number;
  actor: TeamActor;
  email: string;
  permissions: Permissions;
  now: Date;
}

type InviteMemberUseCaseResponse =
  | TeamInvite
  | "invalid_email"
  | "already_member"
  | { forbidden: Area };

type CurrUseCase = _UseCase<InviteMemberUseCaseProps, InviteMemberUseCaseResponse>;

/**
 * Creates or refreshes a convite. Nothing is sent: the convite waits for
 * whoever signs in with the e-mail. A pending convite for the same e-mail is
 * updated in place (the partial unique index allows one); a declined one is
 * closed as canceled so the list shows only the new one.
 *
 * Two concurrent invites for the same e-mail can both pass the "no pending
 * row" check under READ COMMITTED; the loser's insert then trips
 * `farm_invites_one_pending_per_email_unique`. Rather than surface that as an
 * unhandled 500, one retry runs the whole flow again — it now finds the
 * winner's row pending and takes the update path instead.
 */
export class InviteMemberUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("InviteMemberUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, email, permissions, now }) => {
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) return "invalid_email";
    const next = parsePermissions(permissions);
    const grant = canGrant(actor.permissions, next);
    if (!grant.ok) return { forbidden: grant.area };

    try {
      return await this.attempt(farmId, actor, clean, next, now);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.attempt(farmId, actor, clean, next, now);
    }
  };

  private attempt(
    farmId: number,
    actor: TeamActor,
    clean: string,
    next: Permissions,
    now: Date
  ): Promise<TeamInvite | "already_member" | { forbidden: Area }> {
    return this.repository.transaction(async (tx) => {
      const [member] = await tx
        .select({ userId: farmUsers.userId })
        .from(farmUsers)
        .innerJoin(user, eq(user.id, farmUsers.userId))
        .where(and(eq(farmUsers.farmId, farmId), eq(sql`lower(${user.email})`, clean)))
        .limit(1);
      if (member) return "already_member";

      const fields = {
        preset: presetFor(next),
        permissions: next,
        expiresAt: inviteExpiry(now),
        invitedByUserId: actor.userId,
      };

      const [pending] = await tx
        .select({ id: farmInvites.id, permissions: farmInvites.permissions })
        .from(farmInvites)
        .where(
          and(
            eq(farmInvites.farmId, farmId),
            eq(farmInvites.email, clean),
            eq(farmInvites.status, "pending")
          )
        )
        .limit(1);
      if (pending) {
        // The pending convite may hold levels above the actor's own ceiling
        // (someone else, with more authority, sent it) — resending must not
        // silently downgrade or refresh it out from under them.
        const ceiling = canGrant(actor.permissions, parsePermissions(pending.permissions));
        if (!ceiling.ok) return { forbidden: ceiling.area };
        const [row] = await tx
          .update(farmInvites)
          .set(fields)
          .where(eq(farmInvites.id, pending.id))
          .returning();
        return toTeamInvite(row, "pending");
      }

      await tx
        .update(farmInvites)
        .set({ status: "canceled", respondedAt: now })
        .where(
          and(
            eq(farmInvites.farmId, farmId),
            eq(farmInvites.email, clean),
            eq(farmInvites.status, "declined")
          )
        );
      const [row] = await tx
        .insert(farmInvites)
        .values({ farmId, email: clean, ...fields })
        .returning();
      return toTeamInvite(row, "pending");
    });
  }
}
