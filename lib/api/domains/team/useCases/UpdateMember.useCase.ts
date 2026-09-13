import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmUsers } from "@/lib/db/schema";
import {
  canGrant,
  canManage,
  parsePermissions,
  presetFor,
  resolvePermissions,
  type Area,
  type ManageBlock,
  type MemberPreset,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import type { TeamActor } from "./BrowseTeam.useCase";

interface UpdateMemberUseCaseProps {
  farmId: number;
  actor: TeamActor;
  userId: string;
  permissions: Permissions;
}

type UpdateMemberUseCaseResponse =
  | "not_found"
  | { blocked: ManageBlock }
  | { forbidden: Area }
  | { preset: MemberPreset; permissions: Permissions };

type CurrUseCase = _UseCase<UpdateMemberUseCaseProps, UpdateMemberUseCaseResponse>;

/**
 * Changes a member's levels. The actor must be able to reach the member (not
 * the Dono, not themselves, nobody holding more) and may not grant above their
 * own levels. The preset is derived from the stored levels.
 */
export class UpdateMemberUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateMemberUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, userId, permissions }) => {
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

    const next = parsePermissions(permissions);
    const grant = canGrant(actor.permissions, next);
    if (!grant.ok) return { forbidden: grant.area };

    const preset = presetFor(next);
    await this.repository.update(farmUsers).set({ preset, permissions: next }).where(where);
    return { preset, permissions: next };
  };
}
