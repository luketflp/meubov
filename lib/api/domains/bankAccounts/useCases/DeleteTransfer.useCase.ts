import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { transfers } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteTransferUseCaseProps {
  farmId: number;
  id: string;
}

type CurrUseCase = _UseCase<DeleteTransferUseCaseProps, boolean>;

/**
 * Removes a transferência; false when it is not on this farm. A linha do
 * extrato that pointed at it goes back to pending (FK set null + trigger).
 */
export class DeleteTransferUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteTransferUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const removed = await this.repository
      .delete(transfers)
      .where(and(eq(transfers.farmId, farmId), eq(transfers.id, id)))
      .returning({ id: transfers.id });
    return removed.length > 0;
  };
}
