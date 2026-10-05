import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toExpenseGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { clashesWithFixedGroup } from "@/lib/domain/groups";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ExpenseGroup } from "@/lib/types";

/** Absent leaves a field as it is. */
export interface ExpenseGroupPatchInput {
  name?: string;
  /** True archives the grupo, false restores it. */
  archived?: boolean;
}

interface UpdateExpenseGroupUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpenseGroupPatchInput;
}

/** null: the grupo is not on this farm. `duplicate`: as in AddExpenseGroup. */
type UpdateExpenseGroupUseCaseResponse = ExpenseGroup | "duplicate" | null;

type CurrUseCase = _UseCase<UpdateExpenseGroupUseCaseProps, UpdateExpenseGroupUseCaseResponse>;

/**
 * Renames a grupo (its contas, lançamentos and orçamento lines hold its id, so
 * they follow), archives or restores it. Its own name in another case is no
 * clash: the unique index only compares it with the farm's other grupos.
 */
export class UpdateExpenseGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateExpenseGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    if (patch.name !== undefined && clashesWithFixedGroup(patch.name)) return "duplicate";
    const scope = and(eq(expenseGroups.farmId, farmId), eq(expenseGroups.id, id));
    const set: Partial<typeof expenseGroups.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    if (Object.keys(set).length === 0) {
      const [current] = await this.repository.select().from(expenseGroups).where(scope).limit(1);
      return current ? toExpenseGroup(current) : null;
    }

    try {
      const [row] = await this.repository.update(expenseGroups).set(set).where(scope).returning();
      return row ? toExpenseGroup(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
