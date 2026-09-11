import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export interface FarmSummary {
  id: number;
  name: string;
  role: "owner" | "member";
}

interface BrowseFarmsUseCaseProps {
  userId: string;
  superuser: boolean;
}

type BrowseFarmsUseCaseResponse = FarmSummary[];

type CurrUseCase = _UseCase<BrowseFarmsUseCaseProps, BrowseFarmsUseCaseResponse>;

/**
 * Lists the farms the user can access, first item being the default farm.
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
    if (superuser) {
      const rows = await this.repository
        .select({ id: farm.id, name: farm.name, role: farmUsers.role })
        .from(farm)
        .leftJoin(
          farmUsers,
          and(eq(farmUsers.farmId, farm.id), eq(farmUsers.userId, userId))
        )
        .orderBy(asc(farm.id));
      return rows.map((row) => ({ ...row, role: row.role ?? "owner" }));
    }

    return this.repository
      .select({ id: farm.id, name: farm.name, role: farmUsers.role })
      .from(farmUsers)
      .innerJoin(farm, eq(farm.id, farmUsers.farmId))
      .where(eq(farmUsers.userId, userId))
      .orderBy(asc(farmUsers.createdAt));
  };
}
