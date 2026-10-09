import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessions, semenBulls } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { lockBullStock } from "../_shared/stock";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteBullUseCaseProps {
  farmId: number;
  id: string;
}

type DeleteBullUseCaseResponse =
  | { id: string }
  | "not_found"
  | "doses_used"
  | "open_insemination";

type CurrUseCase = _UseCase<DeleteBullUseCaseProps, DeleteBullUseCaseResponse>;

/**
 * Removes a bull with its purchases (cascade). Refused with `doses_used` once a
 * cobertura took one of its doses — the record must keep naming the bull, and
 * the foreign key would refuse it anyway — and with `open_insemination` while
 * an open inseminação still offers it at the brete. The counts run under the
 * bull's row lock, so a dose taken concurrently is either counted here or waits
 * for this delete.
 */
export class DeleteBullUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBullUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    return this.repository.transaction(async (tx) => {
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

      await tx
        .delete(semenBulls)
        .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, stock.bull.id)));
      return { id: stock.bull.id };
    });
  };
}
