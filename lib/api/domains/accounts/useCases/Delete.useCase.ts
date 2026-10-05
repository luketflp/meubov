import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteAccountUseCaseProps {
  farmId: number;
  id: string;
}

/** `not_found` off this farm; `in_use` when a lançamento or recorrência points at it (archive it instead). */
type DeleteAccountUseCaseResponse = "deleted" | "not_found" | "in_use";

type CurrUseCase = _UseCase<DeleteAccountUseCaseProps, DeleteAccountUseCaseResponse>;

/** Deletes a conta nothing points at — one created by mistake. Its orçamento lines go with it. */
export class DeleteAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id }) =>
    // The row lock holds off a lançamento naming the conta meanwhile (its FK check waits).
    this.repository.transaction(async (tx) => {
      const scope = and(eq(accounts.farmId, farmId), eq(accounts.id, id));
      const [current] = await tx.select().from(accounts).where(scope).limit(1).for("update");
      if (!current) return "not_found";
      const [usage] = await tx
        .select({
          used: sql<boolean>`exists (select 1 from ${expenses} where ${expenses.accountId} = ${id})
            or exists (select 1 from ${expenseSeries} where ${expenseSeries.accountId} = ${id})`,
        })
        .from(accounts)
        .where(scope);
      if (usage?.used) return "in_use";
      await tx.delete(accounts).where(scope);
      return "deleted";
    });
}
