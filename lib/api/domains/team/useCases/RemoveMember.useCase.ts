import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmUsers } from "@/lib/db/schema";
import { canManage, resolvePermissions, type ManageBlock } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import type { TeamActor } from "./BrowseTeam.useCase";

interface RemoveMemberUseCaseProps {
  farmId: number;
  actor: TeamActor;
  userId: string;
}

type RemoveMemberUseCaseResponse = "not_found" | { blocked: ManageBlock } | "removed";

type CurrUseCase = _UseCase<RemoveMemberUseCaseProps, RemoveMemberUseCaseResponse>;

/**
 * Takes a member out of the farm under the same reach rules as a level change.
 * Their next request answers 403 not_a_member, which the client already turns
 * into a return to their own farm.
 */
export class RemoveMemberUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveMemberUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, userId }) => {
    const where = and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, userId));
    const [target] = await this.repository
      .select({ role: farmUsers.role, permissions: farmUsers.permissions })
      .from(farmUsers)
      .where(where)
      .limit(1);
    if (!target) return "not_found";

    const manage = canManage(actor, {
      userId,
      role: target.role,
      permissions: resolvePermissions(target, false),
    });
    if (!manage.ok) return { blocked: manage.reason };

    await this.repository.delete(farmUsers).where(where);
    return "removed";
  };
}
