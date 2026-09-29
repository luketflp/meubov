import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense } from "@/lib/types";

interface GetExpenseUseCaseProps {
  farmId: number;
  id: string;
}

/** Null when the lançamento is not on this farm. */
type CurrUseCase = _UseCase<GetExpenseUseCaseProps, Expense | null>;

/**
 * One lançamento as the herd load maps it — with its série's fields and its
 * anexos' count — for the answer of an edit.
 */
export class GetExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("GetExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const [row] = await this.repository
      .select()
      .from(expenses)
      .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
      .limit(1);
    if (!row) return null;
    const [series] =
      row.seriesId === null
        ? []
        : await this.repository
            .select()
            .from(expenseSeries)
            .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, row.seriesId)))
            .limit(1);
    const [files] = await this.repository
      .select({ total: count() })
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, id)));
    return toExpense(row, series, files?.total ?? 0);
  };
}
