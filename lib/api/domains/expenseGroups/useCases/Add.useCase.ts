import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenseGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toExpenseGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { clashesWithFixedGroup } from "@/lib/domain/groups";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ExpenseGroup } from "@/lib/types";

interface AddExpenseGroupUseCaseProps {
  farmId: number;
  name: string;
}

/**
 * `duplicate`: the name is a built-in or top grupo's label, or another grupo
 * of the farm has it (archived ones included), in any case.
 */
type AddExpenseGroupUseCaseResponse = ExpenseGroup | "duplicate";

type CurrUseCase = _UseCase<AddExpenseGroupUseCaseProps, AddExpenseGroupUseCaseResponse>;

/**
 * Creates a grupo de despesa of the farm. The unique index on
 * (farm_id, lower(name)) is the only check against the farm's other grupos,
 * so a concurrent insert of the same name is caught the same way.
 */
export class AddExpenseGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddExpenseGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, name }) => {
    if (clashesWithFixedGroup(name)) return "duplicate";
    try {
      const [row] = await this.repository
        .insert(expenseGroups)
        .values({ id: randomUUID(), farmId, name: name.trim() })
        .returning();
      return toExpenseGroup(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
