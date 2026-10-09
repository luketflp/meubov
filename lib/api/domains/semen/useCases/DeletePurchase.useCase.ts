import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { semenPurchases } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { lockBullStock } from "../_shared/stock";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeletePurchaseUseCaseProps {
  farmId: number;
  bullId: string;
  purchaseId: string;
}

type DeletePurchaseUseCaseResponse = { id: string } | "not_found" | "stock_negative";

type CurrUseCase = _UseCase<DeletePurchaseUseCaseProps, DeletePurchaseUseCaseResponse>;

/**
 * Removes a purchase of a bull. Refused with `stock_negative` when the other
 * purchases would not cover the doses already used; the count runs under the
 * bull's row lock, so a dose taken concurrently is either counted here or waits
 * for this delete.
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
        .select({ id: semenPurchases.id, doses: semenPurchases.doses })
        .from(semenPurchases)
        .where(and(eq(semenPurchases.id, purchaseId), eq(semenPurchases.bullId, stock.bull.id)))
        .limit(1);
      if (!purchase) return "not_found";
      if (stock.bought - purchase.doses < stock.used) return "stock_negative";

      await tx.delete(semenPurchases).where(eq(semenPurchases.id, purchase.id));
      return { id: purchase.id };
    });
  };
}
