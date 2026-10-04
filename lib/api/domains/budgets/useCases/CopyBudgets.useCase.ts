import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, animals, budgets, expenses, treatments } from "@/lib/db/schema";
import { toAccount, toBudget, toExpense, toTreatment } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { lineRows, safraStartMonth, safraWhere } from "@/lib/api/domains/budgets/budgetLine";
import { copyPlan } from "@/lib/domain/budget";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Budget } from "@/lib/types";

interface CopyBudgetsUseCaseProps {
  farmId: number;
  /** Who copied: kept in `updated_by`. */
  userId: string;
  from: number;
  to: number;
  /** The início da safra the client read `from` and `to` with. */
  startMonth: number;
  source: "budgeted" | "realized";
  /** −50 to +100. */
  adjustPct: number;
  /** Realizado stops here. */
  todayIso: string;
}

interface CopyBudgetsUseCaseResponse {
  /** Lines written. */
  copied: number;
  /** Lines of `from` left out: `to` already had a budget for them. */
  skipped: number;
  /** Every row of `to` after the copy. */
  budgets: Budget[];
}

/** `start_month_changed`: the farm's início is no longer `startMonth`; nothing copied. */
type CurrUseCase = _UseCase<CopyBudgetsUseCaseProps, CopyBudgetsUseCaseResponse | "start_month_changed">;

/**
 * "Copiar da safra anterior": each line of `from` — its orçado, or its
 * realizado by grupo — that has no budget yet in `to`, adjusted by
 * `adjustPct` and rounded month by month (copyPlan says which and how much).
 * Written as "manual": the months are the ones copied, not a split of a total.
 */
export class CopyBudgetsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CopyBudgetsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, from, to, startMonth, source, adjustPct, todayIso }) => {
    if ((await safraStartMonth(this.repository, farmId)) !== startMonth) return "start_month_changed";
    const [budgetRows, expenseRows, treatmentRows, accountRows] = await Promise.all([
      this.repository
        .select()
        .from(budgets)
        .where(or(safraWhere(farmId, startMonth, from), safraWhere(farmId, startMonth, to))),
      this.repository.select().from(expenses).where(eq(expenses.farmId, farmId)),
      this.repository
        .select({ row: treatments, earTag: animals.earTag })
        .from(treatments)
        .innerJoin(animals, eq(treatments.animalId, animals.id))
        .where(and(eq(animals.farmId, farmId), isNull(treatments.deletedAt))),
      this.repository.select().from(accounts).where(eq(accounts.farmId, farmId)),
    ]);
    const { lines, skipped } = copyPlan(
      {
        budgets: budgetRows.map(toBudget),
        expenses: expenseRows.map((row) => toExpense(row)),
        treatments: treatmentRows.map(({ row, earTag }) => toTreatment(row, earTag)),
        accounts: accountRows.map(toAccount),
      },
      from,
      to,
      source,
      adjustPct,
      startMonth,
      todayIso
    );
    if (lines.length > 0) {
      await this.repository
        .insert(budgets)
        .values(
          lines.flatMap((line) =>
            lineRows(farmId, userId, startMonth, { ...line, safra: to, distribution: "manual" })
          )
        )
        // A line saved in `to` meanwhile keeps its own rows.
        .onConflictDoNothing();
    }
    const target = await this.repository.select().from(budgets).where(safraWhere(farmId, startMonth, to));
    return { copied: lines.length, skipped, budgets: target.map(toBudget) };
  };
}
