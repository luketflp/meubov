import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenseSeries, expenses } from "@/lib/db/schema";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { addDays } from "@/lib/domain/dates";
import { occurrenceDate, scopeRows } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SeriesScope } from "@/lib/types";

interface DeleteExpenseUseCaseProps {
  farmId: number;
  id: string;
  /** For a row of a série; absent = "one". */
  scope?: SeriesScope;
}

/** False when the expense does not exist on this farm. */
type DeleteExpenseUseCaseResponse = boolean;

type CurrUseCase = _UseCase<DeleteExpenseUseCaseProps, DeleteExpenseUseCaseResponse>;

/**
 * Removes a lançamento — or, on a row of a série, "Esta e as próximas" (the
 * unpaid rows from it on) or "Todas" (every unpaid row). A recorrência also
 * stops: its `endsOn` becomes the day before the row removed ("Todas": before
 * position 1), so
 * the load writes nothing after it. Paid rows stay. The anexos' files go after
 * the rows; a failure there is logged and never blocks the removal.
 */
export class DeleteExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("DeleteExpenseUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, scope = "one" }) => {
    const pathnames = await this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
        .limit(1);
      if (!current) return null;

      let ids = [id];
      if (scope !== "one" && current.seriesId !== null && current.seriesIndex !== null) {
        const [series] = await tx
          .select()
          .from(expenseSeries)
          .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, current.seriesId)))
          .limit(1)
          .for("update");
        const siblings = await tx
          .select()
          .from(expenses)
          .where(and(eq(expenses.farmId, farmId), eq(expenses.seriesId, current.seriesId)));
        ids = scopeRows(siblings, current.seriesIndex, scope).map((row) => row.id);
        if (series?.mode === "recurring") {
          // "following" cuts at the row's own vencimento: it may have been moved off the rule.
          const from = scope === "all" ? occurrenceDate(series, 1) : (current.dueDate ?? current.date);
          const cut = addDays(from, -1);
          const endsOn = series.endsOn !== null && series.endsOn < cut ? series.endsOn : cut;
          await tx
            .update(expenseSeries)
            .set({ endsOn })
            .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, series.id)));
        }
      }
      if (ids.length === 0) return [];

      const files = await tx
        .select({ pathname: attachments.pathname })
        .from(attachments)
        .where(and(eq(attachments.farmId, farmId), inArray(attachments.expenseId, ids)));
      await tx.delete(expenses).where(and(eq(expenses.farmId, farmId), inArray(expenses.id, ids)));
      return files.map((file) => file.pathname);
    });
    if (pathnames === null) return false;
    if (pathnames.length > 0) await deleteBlobsQuietly(this.blob, pathnames);
    return true;
  };
}
