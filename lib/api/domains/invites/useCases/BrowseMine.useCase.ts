import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers, user } from "@/lib/db/schema";
import { parsePermissions, type MemberPreset, type Permissions } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export interface MyInvite {
  id: number;
  farmId: number;
  farmName: string;
  municipality: string;
  invitedByName: string | null;
  preset: MemberPreset;
  permissions: Permissions;
  expiresAt: string;
}

export interface MyInvites {
  invites: MyInvite[];
  /** Lets /convites choose between "Criar minha fazenda" and "Ir para o painel"
      without calling a farm-scoped route, which would create a farm. */
  hasFarm: boolean;
}

interface BrowseMyInvitesUseCaseProps {
  userId: string;
  /** Normalized e-mail of the signed-in user. */
  email: string;
  now: Date;
}

type CurrUseCase = _UseCase<BrowseMyInvitesUseCaseProps, MyInvites>;

/** The convites waiting for the signed-in e-mail, oldest first. */
export class BrowseMyInvitesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BrowseMyInvitesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, email, now }) => {
    const [rows, memberships] = await Promise.all([
      this.repository
        .select({
          id: farmInvites.id,
          farmId: farmInvites.farmId,
          preset: farmInvites.preset,
          permissions: farmInvites.permissions,
          expiresAt: farmInvites.expiresAt,
          farmName: farm.name,
          municipality: farm.municipality,
          invitedByName: user.name,
        })
        .from(farmInvites)
        .innerJoin(farm, eq(farm.id, farmInvites.farmId))
        .leftJoin(user, eq(user.id, farmInvites.invitedByUserId))
        .where(
          and(
            eq(farmInvites.email, email),
            eq(farmInvites.status, "pending"),
            gt(farmInvites.expiresAt, now)
          )
        )
        .orderBy(asc(farmInvites.createdAt)),
      this.repository
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .where(eq(farmUsers.userId, userId))
        .limit(1),
    ]);

    return {
      invites: rows.map((row) => ({
        id: row.id,
        farmId: row.farmId,
        preset: row.preset,
        permissions: parsePermissions(row.permissions),
        expiresAt: row.expiresAt.toISOString(),
        farmName: row.farmName,
        municipality: row.municipality,
        invitedByName: row.invitedByName ?? null,
      })),
      hasFarm: memberships.length > 0,
    };
  };
}
