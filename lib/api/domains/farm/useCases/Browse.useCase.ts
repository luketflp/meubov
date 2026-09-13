import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";
import {
  resolvePermissions,
  type FarmRole,
  type MemberPreset,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export interface FarmSummary {
  id: number;
  name: string;
  municipality: string;
  role: FarmRole;
  preset: MemberPreset | null;
  /** Resolved levels: the client never re-derives the Dono or superuser case. */
  permissions: Permissions;
  /** When the membership began; null for a superuser who is not a member. */
  joinedAt: string | null;
}

interface BrowseFarmsUseCaseProps {
  userId: string;
  superuser: boolean;
}

type BrowseFarmsUseCaseResponse = FarmSummary[];

type CurrUseCase = _UseCase<BrowseFarmsUseCaseProps, BrowseFarmsUseCaseResponse>;

/**
 * Lists the live farms the user can access, first item being the default farm.
 * A deleted farm (`deleted_at` set) is gone from here for everyone.
 *
 * Regular users see the farms they are members of (oldest membership first, the
 * same ordering the farm macro uses to pick the default farm). Superusers see
 * every farm, with their real role where a membership exists and "owner"
 * elsewhere, mirroring the bypass in lib/api/plugins/farm.ts.
 */
export class BrowseFarmsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BrowseFarmsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, superuser }) => {
    const columns = {
      id: farm.id,
      name: farm.name,
      municipality: farm.municipality,
      role: farmUsers.role,
      preset: farmUsers.preset,
      permissions: farmUsers.permissions,
      joinedAt: farmUsers.createdAt,
    };

    if (superuser) {
      const rows = await this.repository
        .select(columns)
        .from(farm)
        .leftJoin(farmUsers, and(eq(farmUsers.farmId, farm.id), eq(farmUsers.userId, userId)))
        .where(isNull(farm.deletedAt))
        .orderBy(asc(farm.id));
      return rows.map((row) => {
        const role = row.role ?? "owner";
        return {
          id: row.id,
          name: row.name,
          municipality: row.municipality,
          role,
          preset: row.preset,
          permissions: resolvePermissions({ role, permissions: row.permissions }, true),
          joinedAt: row.joinedAt?.toISOString() ?? null,
        };
      });
    }

    const rows = await this.repository
      .select(columns)
      .from(farmUsers)
      .innerJoin(farm, eq(farm.id, farmUsers.farmId))
      .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)))
      .orderBy(asc(farmUsers.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      municipality: row.municipality,
      role: row.role,
      preset: row.preset,
      permissions: resolvePermissions(row, false),
      joinedAt: row.joinedAt.toISOString(),
    }));
  };
}
