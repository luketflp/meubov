import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses, semenPurchases } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { lockBullStock } from "../_shared/stock";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeletePurchaseUseCaseProps {
  farmId: number;
  bullId: string;
  purchaseId: string;
}

/** The removed purchase and the expense removed with it (null when already gone). */
type DeletePurchaseUseCaseResponse =
  | { id: string; expenseId: string | null }
  | "not_found"
  | "stock_negative";

type CurrUseCase = _UseCase<DeletePurchaseUseCaseProps, DeletePurchaseUseCaseResponse>;

/**
 * Removes a purchase of a bull and the expense it wrote. Refused with
 * `stock_negative` when the other purchases would not cover the doses already
 * used; the count runs under the bull's row lock, so a dose taken concurrently
 * is either counted here or waits for this delete.
 */
export class DeletePurchaseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeletePurchaseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, bullId, purchaseId }) => {
    return this.repository.transaction(async (tx) => {
      const stock = await lockBullStock(tx, farmId, bullId);
      if (!stock) return "not_found";

      const [purchase] = await tx
        .select({
          id: semenPurchases.id,
          doses: semenPurchases.doses,
          expenseId: semenPurchases.expenseId,
        })
        .from(semenPurchases)
        .where(and(eq(semenPurchases.id, purchaseId), eq(semenPurchases.bullId, stock.bull.id)))
        .limit(1);
      if (!purchase) return "not_found";
      if (stock.bought - purchase.doses < stock.used) return "stock_negative";

      // Purchase first: deleting the expense first would only null its link.
      await tx.delete(semenPurchases).where(eq(semenPurchases.id, purchase.id));
      if (purchase.expenseId !== null) {
        await tx
          .delete(expenses)
          .where(and(eq(expenses.farmId, farmId), eq(expenses.id, purchase.expenseId)));
      }
      return { id: purchase.id, expenseId: purchase.expenseId };
    });
  };
}
