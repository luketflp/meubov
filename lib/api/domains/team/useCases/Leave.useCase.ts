import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmUsers } from "@/lib/db/schema";
import type { FarmRole } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface LeaveFarmUseCaseProps {
  farmId: number;
  userId: string;
  role: FarmRole;
}

type CurrUseCase = _UseCase<LeaveFarmUseCaseProps, "owner_cannot_leave" | "left">;

/** "Sair da fazenda": any member but the Dono, who carries the farm and its plan. */
export class LeaveFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("LeaveFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, role }) => {
    if (role === "owner") return "owner_cannot_leave";
    await this.repository
      .delete(farmUsers)
      .where(and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, userId)));
    return "left";
  };
}
