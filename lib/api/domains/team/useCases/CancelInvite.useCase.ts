import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites } from "@/lib/db/schema";
import { canGrant, parsePermissions } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import type { TeamActor } from "./BrowseTeam.useCase";

interface CancelInviteUseCaseProps {
  farmId: number;
  id: number;
  actor: TeamActor;
  now: Date;
}

type CurrUseCase = _UseCase<CancelInviteUseCaseProps, boolean>;

/**
 * "Cancelar convite" on a pending convite and "Remover da lista" on a declined
 * one: both close it as canceled, which the list never shows. False when the
 * convite is not this farm's, is already closed, or holds levels above the
 * actor's own grant ceiling — the same ceiling that hides it from BrowseTeam,
 * so an actor cannot cancel (and free up the e-mail for) a convite they could
 * not have sent themselves.
 */
export class CancelInviteUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CancelInviteUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, actor, now }) => {
    const [invite] = await this.repository
      .select({ permissions: farmInvites.permissions })
      .from(farmInvites)
      .where(and(eq(farmInvites.id, id), eq(farmInvites.farmId, farmId)))
      .limit(1);
    if (!invite) return false;
    if (
      actor.role !== "owner" &&
      !canGrant(actor.permissions, parsePermissions(invite.permissions)).ok
    ) {
      return false;
    }

    const rows = await this.repository
      .update(farmInvites)
      .set({ status: "canceled", respondedAt: now })
      .where(
        and(
          eq(farmInvites.id, id),
          eq(farmInvites.farmId, farmId),
          inArray(farmInvites.status, ["pending", "declined"])
        )
      )
      .returning({ id: farmInvites.id });
    return rows.length > 0;
  };
}
