import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenses, manejoSessions, semenBulls, semenPurchases } from "@/lib/db/schema";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { lockBullStock } from "../_shared/stock";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteBullUseCaseProps {
  farmId: number;
  id: string;
  /** Financeiro edit: the expenses of the purchases go with the bull. */
  canRemoveExpenses: boolean;
}

/** The removed bull and the expenses removed with it. */
type DeleteBullUseCaseResponse =
  | { id: string; expenseIds: string[] }
  | "not_found"
  | "doses_used"
  | "open_insemination"
  | "finance_forbidden";

type CurrUseCase = _UseCase<DeleteBullUseCaseProps, DeleteBullUseCaseResponse>;

/**
 * Removes a bull with its purchases (cascade) and the expenses those wrote.
 * Refused with `doses_used` once a cobertura took one of its doses — the
 * record must keep naming the bull, and the foreign key would refuse it anyway
 * — and with `open_insemination` while an open inseminação still offers it at
 * the brete. The counts run under the bull's row lock, so a dose taken
 * concurrently is either counted here or waits for this delete. A purchase is
 * money: when an expense would go, the caller needs Financeiro edit
 * (`finance_forbidden`).
 */
export class DeleteBullUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("DeleteBullUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, canRemoveExpenses }) => {
    let pathnames: string[] = [];
    const result = await this.repository.transaction(async (tx) => {
      const stock = await lockBullStock(tx, farmId, id);
      if (!stock) return "not_found";
      if (stock.used > 0) return "doses_used";

      const [offered] = await tx
        .select({ id: manejoSessions.id })
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.farmId, farmId),
            eq(manejoSessions.status, "open"),
            isNull(manejoSessions.deletedAt),
            sql`${manejoSessions.semenBullIds} @> ${JSON.stringify([stock.bull.id])}::jsonb`
          )
        )
        .limit(1);
      if (offered) return "open_insemination";

      const purchases = await tx
        .select({ expenseId: semenPurchases.expenseId })
        .from(semenPurchases)
        .where(eq(semenPurchases.bullId, stock.bull.id));
      const expenseIds = purchases.flatMap((p) => (p.expenseId === null ? [] : [p.expenseId]));
      if (expenseIds.length > 0 && !canRemoveExpenses) return "finance_forbidden";

      // The expenses by the ids just read: the purchases go with the bull (cascade).
      if (expenseIds.length > 0) {
        const files = await tx
          .select({ pathname: attachments.pathname })
          .from(attachments)
          .where(and(eq(attachments.farmId, farmId), inArray(attachments.expenseId, expenseIds)));
        pathnames = files.map((file) => file.pathname);
        await tx
          .delete(expenses)
          .where(and(eq(expenses.farmId, farmId), inArray(expenses.id, expenseIds)));
      }
      await tx
        .delete(semenBulls)
        .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, stock.bull.id)));
      return { id: stock.bull.id, expenseIds };
    });
    // The anexos' files after commit; a failure is logged, never blocks the removal.
    if (pathnames.length > 0) await deleteBlobsQuietly(this.blob, pathnames);
    return result;
  };
}
