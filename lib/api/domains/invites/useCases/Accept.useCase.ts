import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers, user, type FarmInviteRow } from "@/lib/db/schema";
import { can, canGrant, parsePermissions, resolvePermissions } from "@/lib/domain/permissions";
import { isSuperuser } from "@/lib/auth/superuser";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType, Tx } from "@/lib/api/@types/repoTypes";

interface AcceptInviteUseCaseProps {
  inviteId: number;
  userId: string;
  /** Normalized e-mail of the signed-in user: only its own convites can be claimed. */
  email: string;
  now: Date;
}

type CurrUseCase = _UseCase<AcceptInviteUseCaseProps, { farmId: number } | "not_found">;

/**
 * Thrown inside the transaction to roll back a claim whose inviter no longer
 * grants its levels (see `inviterStillGrants`); caught at the top and mapped
 * to the same "not_found" a missing or expired convite already answers.
 * Drizzle rolls the transaction back on any throw from the callback.
 */
class InviteAuthorityRevoked extends Error {}

/**
 * Claims a convite: the convite is marked accepted first — one UPDATE ...
 * RETURNING, so a double-click or a race with a cancel/re-level lets only one
 * caller claim it — the inviter is then re-checked (`inviterStillGrants`),
 * and only once that holds is the membership written. Someone who is already
 * a member keeps the levels they have (`onConflictDoNothing`).
 */
export class AcceptInviteUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AcceptInviteUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ inviteId, userId, email, now }) => {
    try {
      return await this.repository.transaction(async (tx) => {
        const [invite] = await tx
          .update(farmInvites)
          .set({ status: "accepted", respondedAt: now })
          .where(
            and(
              eq(farmInvites.id, inviteId),
              eq(farmInvites.email, email),
              eq(farmInvites.status, "pending"),
              gt(farmInvites.expiresAt, now)
            )
          )
          .returning();
        if (!invite) return "not_found";

        if (!(await this.inviterStillGrants(tx, invite))) throw new InviteAuthorityRevoked();

        await tx
          .insert(farmUsers)
          .values({
            farmId: invite.farmId,
            userId,
            role: "member",
            preset: invite.preset,
            permissions: parsePermissions(invite.permissions),
          })
          .onConflictDoNothing();

        return { farmId: invite.farmId };
      });
    } catch (error) {
      if (error instanceof InviteAuthorityRevoked) return "not_found";
      throw error;
    }
  };

  /**
   * Whether whoever sent this convite still holds the authority to: a
   * superuser or the Dono always does; a member needs Equipe edit and every
   * area of the convite's levels within their own. A convite with no inviter
   * on record (the account was deleted), whose inviter left the farm, or
   * whose farm was deleted meanwhile (the `farm` join, gated by
   * `isNull(farm.deletedAt)`) refuses too — the gap this closes is a Gerente
   * inviting an e-mail they control, getting demoted or removed, then
   * accepting the old convite to regain levels the Dono took away.
   */
  private async inviterStillGrants(tx: Tx, invite: FarmInviteRow): Promise<boolean> {
    if (invite.invitedByUserId === null) return false;

    const [inviter] = await tx
      .select({ email: user.email, role: farmUsers.role, permissions: farmUsers.permissions })
      .from(user)
      .leftJoin(farmUsers, and(eq(farmUsers.farmId, invite.farmId), eq(farmUsers.userId, user.id)))
      .innerJoin(farm, eq(farm.id, invite.farmId))
      .where(and(eq(user.id, invite.invitedByUserId), isNull(farm.deletedAt)))
      .limit(1);
    if (!inviter) return false;
    if (isSuperuser(inviter.email) || inviter.role === "owner") return true;
    if (inviter.role === null) return false;

    const levels = resolvePermissions({ role: inviter.role, permissions: inviter.permissions }, false);
    return can(levels, "team", "edit") && canGrant(levels, parsePermissions(invite.permissions)).ok;
  }
}
