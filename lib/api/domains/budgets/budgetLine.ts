/**
 * One line of the orçamento as rows: a grupo's own line (no conta) or a
 * conta's, one row per calendar month. The API speaks in safras; the farm's
 * start month, read first by every use case, says which twelve months form
 * one.
 */
import { randomUUID } from "node:crypto";
import { and, between, eq, isNull } from "drizzle-orm";

import { budgets, farm } from "@/lib/db/schema";
import { cents } from "@/lib/domain/bankAccounts";
import { safraMonths, safraRange } from "@/lib/domain/budget";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BudgetDistribution, ExpenseCategory } from "@/lib/types";

export interface BudgetLineKey {
  safra: number;
  category: ExpenseCategory;
  /** Absent or null = the grupo's own line. */
  accountId?: string | null;
}

/** The month the farm's safra starts on (the column's default when the row is missing). */
export async function safraStartMonth(repo: RepositoryType, farmId: number): Promise<number> {
  const [row] = await repo
    .select({ startMonth: farm.safraStartMonth })
    .from(farm)
    .where(eq(farm.id, farmId))
    .limit(1);
  return row?.startMonth ?? 10;
}

/** This farm's rows whose month falls in the safra. */
export function safraWhere(farmId: number, startMonth: number, safra: number) {
  const { start, end } = safraRange(safra, startMonth);
  return and(eq(budgets.farmId, farmId), between(budgets.month, start, end));
}

/** The line's rows in the safra. The grupo's own line never takes its contas' rows. */
export function lineWhere(farmId: number, startMonth: number, { safra, category, accountId }: BudgetLineKey) {
  return and(
    safraWhere(farmId, startMonth, safra),
    eq(budgets.category, category),
    accountId ? eq(budgets.accountId, accountId) : isNull(budgets.accountId)
  );
}

/** The rows to insert: the i-th amount, to the centavo, on the first day of the i-th month of the safra. */
export function lineRows(
  farmId: number,
  userId: string,
  startMonth: number,
  line: BudgetLineKey & { months: number[]; distribution: BudgetDistribution }
): (typeof budgets.$inferInsert)[] {
  const calendar = safraMonths(line.safra, startMonth);
  return line.months.map((amountBrl, i) => ({
    id: randomUUID(),
    farmId,
    category: line.category,
    accountId: line.accountId ?? null,
    month: `${calendar[i].key}-01`,
    amountBrl: cents(amountBrl),
    distribution: line.distribution,
    updatedBy: userId,
  }));
}
