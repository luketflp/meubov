import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ExpenseCategory } from "@/lib/types";

interface DeleteBudgetLineUseCaseProps {
  farmId: number;
  safra: number;
  /** The início da safra the client read `safra` with. */
  startMonth: number;
  category: ExpenseCategory;
  /** Absent = the grupo's own line. */
  accountId?: string;
}

/** How many rows went (0 when the line had none), or nothing gone because the farm's início is no longer `startMonth`. */
type DeleteBudgetLineUseCaseResponse = number | "start_month_changed";

type CurrUseCase = _UseCase<DeleteBudgetLineUseCaseProps, DeleteBudgetLineUseCaseResponse>;

/** Removes one line of a safra's orçamento. A grupo's own line goes alone: its contas' lines stay. */
export class DeleteBudgetLineUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBudgetLineUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, startMonth, ...key }) => {
    if ((await safraStartMonth(this.repository, farmId)) !== startMonth) return "start_month_changed";
    const removed = await this.repository
      .delete(budgets)
      .where(lineWhere(farmId, startMonth, key))
      .returning({ id: budgets.id });
    return removed.length;
  };
}
