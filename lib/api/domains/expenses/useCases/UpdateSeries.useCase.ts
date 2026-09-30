import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { occurrenceDate, ruleFromOccurrence, scopeRows } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense } from "@/lib/types";

import { UpdateExpenseUseCase, type ExpensePatchInput } from "./Update.useCase";

interface UpdateSeriesUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpensePatchInput;
  scope: "following" | "all";
}

/** Null when the lançamento is not on this farm. */
type UpdateSeriesUseCaseResponse = Expense | "due_before_date" | "invalid_bank_account" | null;

type CurrUseCase = _UseCase<UpdateSeriesUseCaseProps, UpdateSeriesUseCaseResponse>;

type SharedFields = Pick<
  ExpensePatchInput,
  "category" | "accountId" | "lotId" | "counterparty" | "document" | "notes" | "amountBrl"
>;

/** What an edit carries to the série's other rows: only the fields it sent. */
function sharedFields(patch: ExpensePatchInput, recurring: boolean): SharedFields {
  const { category, accountId, lotId, counterparty, document, notes, amountBrl } = patch;
  // A parcela's value is edited per parcela: the total is never re-split.
  const fields: SharedFields = {
    category,
    accountId,
    lotId,
    counterparty,
    document,
    notes,
    amountBrl: recurring ? amountBrl : undefined,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as SharedFields;
}

/**
 * "Esta e as próximas" / "Todas" on a row of a série. The row itself takes the
 * whole patch; the série's template and every UNPAID row in scope take the
 * shared fields (conta, lote, pago para, documento, observação, and the valor
 * of a recorrência). Moving an ocorrência's vencimento moves the rule: its day
 * becomes the série's day and every unpaid row in scope is re-dated by its
 * position, in place (ids and anexos survive). Paid rows never change.
 */
export class UpdateSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch, scope }) =>
    this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
        .limit(1);
      if (!current) return null;
      const alone = () => new UpdateExpenseUseCase(tx).run({ farmId, id, patch });
      if (current.seriesId === null || current.seriesIndex === null) return alone();
      const [series] = await tx
        .select()
        .from(expenseSeries)
        .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, current.seriesId)))
        .limit(1)
        .for("update");
      if (!series) return alone();

      const recurring = series.mode === "recurring";
      const dueDate = patch.dueDate ?? null;
      const moved = recurring && dueDate !== null && dueDate !== (current.dueDate ?? current.date);
      // An ocorrência's data is its vencimento: moving one moves both.
      const updated = await new UpdateExpenseUseCase(tx).run({
        farmId,
        id,
        patch: moved ? { ...patch, date: dueDate } : patch,
      });
      if (updated === null || typeof updated === "string") return updated;

      const shared = sharedFields(patch, recurring);
      const rule = moved ? ruleFromOccurrence(series.frequency, current.seriesIndex, dueDate) : null;
      if (Object.keys(shared).length === 0 && rule === null) return updated;

      await tx
        .update(expenseSeries)
        .set({ ...shared, ...rule })
        .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, series.id)));

      const siblings = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.farmId, farmId), eq(expenses.seriesId, series.id)));
      const targets = scopeRows(siblings, current.seriesIndex, scope).filter((row) => row.id !== id);
      if (targets.length === 0) return updated;

      if (rule === null) {
        await tx
          .update(expenses)
          .set(shared)
          .where(and(eq(expenses.farmId, farmId), inArray(expenses.id, targets.map((row) => row.id))));
        return updated;
      }
      // ponytail: a row the move pushes past endsOn stays; the next edit or removal settles it.
      const next = { frequency: series.frequency, ...rule };
      for (const row of targets) {
        const date = occurrenceDate(next, row.seriesIndex ?? 0);
        await tx
          .update(expenses)
          .set({ ...shared, date, dueDate: date })
          .where(and(eq(expenses.farmId, farmId), eq(expenses.id, row.id)));
      }
      return updated;
    });
}
