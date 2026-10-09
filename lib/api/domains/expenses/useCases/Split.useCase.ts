import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { parseISODate } from "@/lib/domain/dates";
import { installmentPlan, MAX_INSTALLMENTS, MIN_INSTALLMENTS } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, SeriesFrequency } from "@/lib/types";

interface SplitExpenseUseCaseProps {
  farmId: number;
  id: string;
  /** Parcelas, 2–48. */
  count: number;
  frequency: SeriesFrequency;
  /** Vencimento of the first parcela. */
  startsOn: string;
}

/**
 * - null: the lançamento is not on this farm.
 * - `not_splittable`: it is paid, already part of a série, or a rendimento.
 * - `invalid_repeat` and `due_before_date`: as for a new parcelamento (AddSeries).
 */
type SplitExpenseUseCaseResponse = Expense[] | "not_splittable" | "invalid_repeat" | "due_before_date" | null;

type CurrUseCase = _UseCase<SplitExpenseUseCaseProps, SplitExpenseUseCaseResponse>;

/**
 * "Parcelar": turns one pending lançamento into a parcelamento of `count`
 * parcelas. Their total is the lançamento's value, split as a new
 * parcelamento is: the last parcela takes the centavos.
 *
 * The row becomes parcela 1 in place, so its id and its anexos stay.
 * Parcelas 2..N are new rows with its fields. Answers every row, first
 * position first, mapped as the load maps them.
 */
export class SplitExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SplitExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id, count: parcelas, frequency, startsOn }) =>
    this.repository.transaction(async (tx) => {
      const scope = and(eq(expenses.farmId, farmId), eq(expenses.id, id));
      const [row] = await tx.select().from(expenses).where(scope).limit(1).for("update");
      if (!row) return null;
      // A rendimento is the one row without a grupo.
      if (row.paidAt !== null || row.seriesId !== null || row.category === null) return "not_splittable";
      if (!Number.isInteger(parcelas) || parcelas < MIN_INSTALLMENTS || parcelas > MAX_INSTALLMENTS) {
        return "invalid_repeat";
      }
      // Every parcela carries at least one centavo.
      if (Math.round(row.amountBrl * 100) < parcelas) return "invalid_repeat";
      if (startsOn < row.date) return "due_before_date";

      const [first, ...rest] = installmentPlan(row.amountBrl, parcelas, startsOn, frequency);
      const template = {
        kind: row.kind,
        flow: row.flow,
        category: row.category,
        notes: row.notes,
        history: row.history,
        counterparty: row.counterparty,
        document: row.document,
        accountId: row.accountId,
        lotId: row.lotId,
      };
      const [series] = await tx
        .insert(expenseSeries)
        .values({
          id: randomUUID(),
          farmId,
          mode: "installments",
          frequency,
          dayOfMonth: frequency === "monthly" ? parseISODate(startsOn).getDate() : null,
          startsOn,
          endsOn: null,
          count: parcelas,
          generatedCount: parcelas,
          amountBrl: row.amountBrl,
          ...template,
        })
        .returning();
      const [updated] = await tx
        .update(expenses)
        .set({ dueDate: first.dueDate, amountBrl: first.amountBrl, seriesId: series.id, seriesIndex: 1 })
        .where(scope)
        .returning();
      const added = await tx
        .insert(expenses)
        .values(
          rest.map((line) => ({
            id: randomUUID(),
            farmId,
            ...template,
            date: row.date,
            dueDate: line.dueDate,
            amountBrl: line.amountBrl,
            seriesId: series.id,
            seriesIndex: line.index,
          }))
        )
        .returning();
      const [files] = await tx
        .select({ total: count() })
        .from(attachments)
        .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, id)));
      return [
        toExpense(updated, series, files?.total ?? 0),
        ...added
          .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))
          .map((parcela) => toExpense(parcela, series)),
      ];
    });
}
