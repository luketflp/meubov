import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, budgets, expenseGroups, expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteExpenseGroupUseCaseProps {
  farmId: number;
  id: string;
}

/**
 * `not_found` off this farm; `in_use` when a lançamento, or a série that still
 * has lançamentos, has the grupo as its category or points at one of its
 * contas, whatever category it carries (archive it instead).
 */
type DeleteExpenseGroupUseCaseResponse = "deleted" | "not_found" | "in_use";

type CurrUseCase = _UseCase<DeleteExpenseGroupUseCaseProps, DeleteExpenseGroupUseCaseResponse>;

/**
 * Deletes a grupo nothing uses — one created by mistake — with its contas, its
 * orçamento lines and the séries left empty by "Excluir todas".
 */
export class DeleteExpenseGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteExpenseGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id }) =>
    // The row lock makes a second delete or a rename of the grupo wait.
    // ponytail: a lançamento saved into the grupo meanwhile is not held off (a grupo key has no FK)
    // and then reads "Grupo removido"; have its writers read the grupo `for share` if that shows up.
    this.repository.transaction(async (tx) => {
      const scope = and(eq(expenseGroups.farmId, farmId), eq(expenseGroups.id, id));
      const [current] = await tx.select().from(expenseGroups).where(scope).limit(1).for("update");
      if (!current) return "not_found";
      const contas = sql`(select ${accounts.id} from ${accounts} where ${accounts.farmId} = ${farmId} and ${accounts.group} = ${id})`;
      const ofGroup = sql`${expenseSeries.farmId} = ${farmId} and (${expenseSeries.category} = ${id} or ${expenseSeries.accountId} in ${contas})`;
      // A row back means a lançamento or a recorrência still uses the grupo.
      const [used] = await tx
        .select({ id: expenseGroups.id })
        .from(expenseGroups)
        .where(
          and(
            scope,
            sql`(exists (select 1 from ${expenses} where ${expenses.farmId} = ${farmId} and (${expenses.category} = ${id} or ${expenses.accountId} in ${contas}))
              or exists (select 1 from ${expenseSeries} where ${ofGroup}
                and exists (select 1 from ${expenses} "e" where "e"."series_id" = ${expenseSeries.id})))`
          )
        )
        .limit(1);
      if (used) return "in_use";
      // Every orçamento line of the grupo, its own and its contas' (theirs would cascade with the conta anyway).
      await tx.delete(budgets).where(and(eq(budgets.farmId, farmId), eq(budgets.category, id)));
      // What is left of its séries has no lançamento any more.
      await tx.delete(expenseSeries).where(ofGroup);
      await tx.delete(accounts).where(and(eq(accounts.farmId, farmId), eq(accounts.group, id)));
      await tx.delete(expenseGroups).where(scope);
      return "deleted";
    });
}
