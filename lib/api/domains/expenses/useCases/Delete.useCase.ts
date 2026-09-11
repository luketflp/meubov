import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteExpenseUseCaseProps {
  farmId: number;
  id: string;
}

/** False when the expense does not exist on this farm. */
type DeleteExpenseUseCaseResponse = boolean;

type CurrUseCase = _UseCase<DeleteExpenseUseCaseProps, DeleteExpenseUseCaseResponse>;

/** Removes an expense; false when it does not exist on this farm. */
export class DeleteExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const rows = await this.repository
      .delete(expenses)
      .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
      .returning({ id: expenses.id });
    return rows.length > 0;
  };
}
