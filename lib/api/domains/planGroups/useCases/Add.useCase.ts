import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { planGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toPlanGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { GroupKind, PlanGroup } from "@/lib/types";

interface AddPlanGroupUseCaseProps {
  farmId: number;
  kind: GroupKind;
  name: string;
}

/** `duplicate`: another grupo of the farm, of any tipo and archived ones included, has the name in any case. */
type AddPlanGroupUseCaseResponse = PlanGroup | "duplicate";

type CurrUseCase = _UseCase<AddPlanGroupUseCaseProps, AddPlanGroupUseCaseResponse>;

/**
 * Creates a grupo of the plano under a tipo. The unique index on
 * (farm_id, lower(name)) is the only check against the farm's other grupos,
 * whatever their tipo, so a concurrent insert of the same name is caught the
 * same way.
 */
export class AddPlanGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddPlanGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, kind, name }) => {
    try {
      const [row] = await this.repository
        .insert(planGroups)
        .values({ id: randomUUID(), farmId, kind, name: name.trim() })
        .returning();
      return toPlanGroup(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
