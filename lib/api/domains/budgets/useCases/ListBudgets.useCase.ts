import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { toBudget } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { safraStartMonth, safraWhere } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Budget } from "@/lib/types";

interface ListBudgetsUseCaseProps {
  farmId: number;
  safra: number;
}

type ListBudgetsUseCaseResponse = Budget[];

type CurrUseCase = _UseCase<ListBudgetsUseCaseProps, ListBudgetsUseCaseResponse>;

/** Every row of one safra's orçamento on this farm: its twelve calendar months by the farm's start month. */
export class ListBudgetsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ListBudgetsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, safra }) => {
    const startMonth = await safraStartMonth(this.repository, farmId);
    const rows = await this.repository.select().from(budgets).where(safraWhere(farmId, startMonth, safra));
    return rows.map(toBudget);
  };
}
