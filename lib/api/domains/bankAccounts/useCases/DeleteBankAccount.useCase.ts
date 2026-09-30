import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  bankAccounts,
  expenses,
  manejoSessions,
  movements,
  statementImports,
  transfers,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteBankAccountUseCaseProps {
  farmId: number;
  id: string;
}

/**
 * `not_found` off this farm; `in_use` when a lançamento, venda, compra,
 * transferência or extrato points at it (archive it instead); `is_main` for the
 * conta principal while the farm has other contas.
 */
type DeleteBankAccountUseCaseResponse = "deleted" | "not_found" | "in_use" | "is_main";

type CurrUseCase = _UseCase<DeleteBankAccountUseCaseProps, DeleteBankAccountUseCaseResponse>;

/** Deletes a conta nothing points at — one created by mistake. */
export class DeleteBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id }) =>
    // The row lock holds off a lançamento or transferência naming the conta meanwhile (its FK check waits).
    this.repository.transaction(async (tx) => {
      const scope = and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, id));
      const [current] = await tx.select().from(bankAccounts).where(scope).limit(1).for("update");
      if (!current) return "not_found";
      // A manejo removed from the history (soft delete) keeps no conta in use.
      const [usage] = await tx
        .select({
          used: sql<boolean>`exists (select 1 from ${expenses} where ${expenses.bankAccountId} = ${id})
            or exists (select 1 from ${movements} where ${movements.bankAccountId} = ${id})
            or exists (select 1 from ${manejoSessions} where ${manejoSessions.bankAccountId} = ${id} and ${manejoSessions.deletedAt} is null)
            or exists (select 1 from ${transfers} where ${transfers.fromId} = ${id} or ${transfers.toId} = ${id})
            or exists (select 1 from ${statementImports} where ${statementImports.bankAccountId} = ${id})`,
        })
        .from(bankAccounts)
        .where(scope);
      if (usage?.used) return "in_use";
      if (current.isMain) {
        const [others] = await tx
          .select({ total: count() })
          .from(bankAccounts)
          .where(eq(bankAccounts.farmId, farmId));
        if ((others?.total ?? 0) > 1) return "is_main";
      }
      await tx.delete(bankAccounts).where(scope);
      return "deleted";
    });
}
