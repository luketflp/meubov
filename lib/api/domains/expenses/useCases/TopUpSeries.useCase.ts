import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { recurringDates, seriesHorizon } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface TopUpSeriesUseCaseProps {
  farmId: number;
  todayIso: string;
}

/** How many ocorrências were written. */
type CurrUseCase = _UseCase<TopUpSeriesUseCaseProps, number>;

/**
 * Writes the ocorrências of the farm's recorrências that now fall inside
 * today + 12 months, continuing after the last one generated (so one removed
 * on its own never comes back). Idempotent: a second run finds nothing new,
 * and two loads racing collide on the unique (series_id, series_index) index
 * instead of doubling a bill.
 */
export class TopUpSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("TopUpSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, todayIso }) => {
    const recurring = await this.repository
      .select()
      .from(expenseSeries)
      .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.mode, "recurring")));
    const horizon = seriesHorizon(todayIso);
    let written = 0;
    for (const listed of recurring) {
      if (recurringDates(listed, listed.generatedCount + 1, horizon).length === 0) continue;
      written += await this.repository.transaction(async (tx) => {
        // Re-read under lock: a removal may have cut ends_on, or another load written ahead.
        const [series] = await tx
          .select()
          .from(expenseSeries)
          .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, listed.id)))
          .limit(1)
          .for("update");
        if (!series) return 0;
        const due = recurringDates(series, series.generatedCount + 1, horizon);
        if (due.length === 0) return 0;
        await tx
          .insert(expenses)
          .values(
            due.map(({ index, date }) => ({
              id: randomUUID(),
              farmId,
              kind: series.kind,
              date,
              dueDate: date,
              category: series.category,
              amountBrl: series.amountBrl,
              notes: series.notes,
              counterparty: series.counterparty,
              document: series.document,
              accountId: series.accountId,
              lotId: series.lotId,
              seriesId: series.id,
              seriesIndex: index,
            }))
          )
          .onConflictDoNothing();
        await tx
          .update(expenseSeries)
          .set({ generatedCount: due[due.length - 1].index })
          .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, series.id)));
        return due.length;
      });
    }
    return written;
  };
}
