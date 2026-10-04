import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, budgets } from "@/lib/db/schema";
import { toBudget } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { lineRows, lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Budget, BudgetDistribution, ExpenseCategory } from "@/lib/types";

interface PutBudgetLineUseCaseProps {
  farmId: number;
  /** Who saved it: kept in `updated_by`. */
  userId: string;
  safra: number;
  /** The início da safra the client read `safra` with. */
  startMonth: number;
  category: ExpenseCategory;
  /** Absent = the grupo's own line. */
  accountId?: string;
  /** By safra month, the first month of the safra first. */
  months: number[];
  distribution: BudgetDistribution;
}

/**
 * - `months_mismatch`: not twelve months.
 * - `invalid_account`: the conta is not of this farm, or not of this grupo.
 * - `start_month_changed`: the farm's início is no longer `startMonth`, so the
 *   safra the client means is other calendar months.
 */
type PutBudgetLineUseCaseResponse = Budget[] | "months_mismatch" | "invalid_account" | "start_month_changed";

type CurrUseCase = _UseCase<PutBudgetLineUseCaseProps, PutBudgetLineUseCaseResponse>;

/**
 * Saves one line of a safra's orçamento: its twelve calendar months replace
 * the ones it had in that safra, in one transaction. The months are stored as
 * sent; that they add up to the total typed is the dialog's check (the body
 * carries no total).
 */
export class PutBudgetLineUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("PutBudgetLineUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, startMonth, months, distribution, ...key }) => {
    if (months.length !== 12) return "months_mismatch";
    if (key.accountId !== undefined) {
      const [account] = await this.repository
        .select({ group: accounts.group })
        .from(accounts)
        .where(and(eq(accounts.farmId, farmId), eq(accounts.id, key.accountId)))
        .limit(1);
      if (account?.group !== key.category) return "invalid_account";
    }
    if ((await safraStartMonth(this.repository, farmId)) !== startMonth) return "start_month_changed";
    return this.repository.transaction(async (tx) => {
      await tx.delete(budgets).where(lineWhere(farmId, startMonth, key));
      const rows = await tx
        .insert(budgets)
        .values(lineRows(farmId, userId, startMonth, { ...key, months, distribution }))
        .returning();
      return rows.map(toBudget);
    });
  };
}
