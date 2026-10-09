import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { planGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toPlanGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { PlanGroup } from "@/lib/types";

/** Absent leaves a field as it is. The tipo is not here: it never changes. */
export interface PlanGroupPatchInput {
  name?: string;
  /** True archives the grupo, false restores it. */
  archived?: boolean;
}

interface UpdatePlanGroupUseCaseProps {
  farmId: number;
  id: string;
  patch: PlanGroupPatchInput;
}

/** null: the grupo is not on this farm. `duplicate`: as in AddPlanGroup. */
type UpdatePlanGroupUseCaseResponse = PlanGroup | "duplicate" | null;

type CurrUseCase = _UseCase<UpdatePlanGroupUseCaseProps, UpdatePlanGroupUseCaseResponse>;

/**
 * Renames a grupo (its contas, lançamentos and orçamento lines hold its id, so
 * they follow), archives or restores it. Its own name in another case is no
 * clash: the unique index only compares it with the farm's other grupos.
 */
export class UpdatePlanGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdatePlanGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(planGroups.farmId, farmId), eq(planGroups.id, id));
    const set: Partial<typeof planGroups.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    if (Object.keys(set).length === 0) {
      const [current] = await this.repository.select().from(planGroups).where(scope).limit(1);
      return current ? toPlanGroup(current) : null;
    }

    try {
      const [row] = await this.repository.update(planGroups).set(set).where(scope).returning();
      return row ? toPlanGroup(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
