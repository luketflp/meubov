/**
 * Which despesa grupo keys a farm may write. normaliseEntry (lançamentos,
 * séries, "Criar lançamento" from a linha do extrato), AddAccount and
 * PutBudgetLine ask here before a category or a conta's grupo is stored: the
 * columns are text, so nothing in the database checks them.
 */
import { and, eq } from "drizzle-orm";

import { expenseGroups } from "@/lib/db/schema";
import { isBuiltinCategory } from "@/lib/domain/groups";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/**
 * A despesa grupo key this farm may write: a built-in key, or the id of one of
 * its own expense_groups, archived ones too (an old lançamento in an archived
 * grupo still saves; the forms just stop offering it). A built-in key asks
 * nothing of the database. Takes the pooled client or a transaction.
 */
export async function isFarmCategory(repo: RepositoryType, farmId: number, key: string): Promise<boolean> {
  if (isBuiltinCategory(key)) return true;
  const [row] = await repo
    .select({ id: expenseGroups.id })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.farmId, farmId), eq(expenseGroups.id, key)))
    .limit(1);
  return row !== undefined;
}
