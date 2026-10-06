import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { normaliseEntry } from "@/lib/api/domains/expenses/entryRules";
import { parseISODate } from "@/lib/domain/dates";
import {
  addMonths,
  HORIZON_MONTHS,
  installmentPlan,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  recurringDates,
  seriesHorizon,
} from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, Expense, ExpenseCategory, SeriesRepeat } from "@/lib/types";

interface AddSeriesUseCaseProps {
  farmId: number;
  todayIso: string;
  kind?: EntryKind;
  /** Movimento of an investment, financing or partners série; absent = saída. */
  flow?: EntryFlow;
  /** Competência of every parcela; a recorrência ignores it (each ocorrência is its own). */
  date: string;
  category: ExpenseCategory;
  /** Total of a parcelamento; value of each ocorrência of a recorrência. */
  amountBrl: number;
  /** Paid/received on this day: the first row only. */
  paidAt?: string;
  notes?: string;
  history?: string;
  counterparty?: string;
  document?: string;
  accountId?: string;
  lotId?: string;
  /** "Pago por" of the first row, when it is paid. */
  bankAccountId?: string;
  repeat: SeriesRepeat;
}

/**
 * - `due_before_date`: the first parcela falls before the purchase.
 * - `invalid_repeat`: a parcelamento has no valid count (2–48, at least a
 *   centavo each), a recorrência ends before it starts, nothing falls in the
 *   window, or it is a rendimento.
 * - `starts_too_old`: a recorrência starts more than 12 months ago.
 * - `invalid_category`, `invalid_account` and `invalid_bank_account`: as for
 *   one lançamento (normaliseEntry, isPayingAccount).
 */
type AddSeriesUseCaseResponse =
  | Expense[]
  | "due_before_date"
  | "invalid_repeat"
  | "starts_too_old"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account";

type CurrUseCase = _UseCase<AddSeriesUseCaseProps, AddSeriesUseCaseResponse>;

/**
 * Creates a série and its rows in one transaction.
 *
 * A parcelamento writes every parcela with the purchase's `date` and stepped
 * vencimentos; the last one takes the centavos. A recorrência writes each
 * ocorrência on its own vencimento up to min(endsOn, today + 12 months), and
 * the herd load tops up the rest as time passes.
 */
export class AddSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, todayIso, repeat, kind = "expense", flow, ...entry }) => {
    // A rendimento is what one day earned: it never repeats.
    if (kind === "yield") return "invalid_repeat";
    const installments = repeat.mode === "installments";
    const count = repeat.count ?? 0;
    if (installments && (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS)) {
      return "invalid_repeat";
    }
    // Every parcela carries at least one centavo.
    if (installments && Math.round(entry.amountBrl * 100) < count) return "invalid_repeat";
    if (installments && repeat.startsOn < entry.date) return "due_before_date";
    if (!installments && repeat.endsOn !== undefined && repeat.endsOn < repeat.startsOn) {
      return "invalid_repeat";
    }
    // A backdated recorrência would write a year of past bills at once.
    if (!installments && repeat.startsOn < addMonths(todayIso, -HORIZON_MONTHS)) return "starts_too_old";

    const dayOfMonth =
      repeat.frequency === "monthly"
        ? (repeat.dayOfMonth ?? parseISODate(repeat.startsOn).getDate())
        : null;
    const endsOn = installments ? null : (repeat.endsOn ?? null);
    const lines = installments
      ? installmentPlan(entry.amountBrl, count, repeat.startsOn, repeat.frequency).map((line) => ({
          ...line,
          date: entry.date,
        }))
      : recurringDates(
          { frequency: repeat.frequency, dayOfMonth, startsOn: repeat.startsOn, endsOn },
          1,
          seriesHorizon(todayIso)
        ).map(({ index, date }) => ({ index, date, dueDate: date, amountBrl: entry.amountBrl }));
    if (lines.length === 0) return "invalid_repeat";
    const shape = await normaliseEntry(this.repository, farmId, { ...entry, kind, flow });
    if (typeof shape === "string") return shape;
    const firstAccountId = entry.paidAt === undefined ? null : (entry.bankAccountId ?? null);
    if (
      firstAccountId !== null &&
      !(await isPayingAccount(this.repository, farmId, firstAccountId, kind, false, shape.flow))
    ) {
      return "invalid_bank_account";
    }

    const template = {
      kind,
      flow: shape.flow,
      category: shape.category,
      notes: entry.notes ?? null,
      history: entry.history ?? null,
      counterparty: entry.counterparty ?? null,
      document: entry.document ?? null,
      accountId: shape.accountId,
      lotId: shape.lotId,
    };

    return this.repository.transaction(async (tx) => {
      const [series] = await tx
        .insert(expenseSeries)
        .values({
          id: randomUUID(),
          farmId,
          mode: repeat.mode,
          frequency: repeat.frequency,
          dayOfMonth,
          startsOn: repeat.startsOn,
          endsOn,
          count: installments ? count : null,
          generatedCount: lines.length,
          amountBrl: entry.amountBrl,
          ...template,
        })
        .returning();
      const rows = await tx
        .insert(expenses)
        .values(
          lines.map((line) => ({
            id: randomUUID(),
            farmId,
            ...template,
            date: line.date,
            dueDate: line.dueDate,
            amountBrl: line.amountBrl,
            // "Já pago" belongs to the first row; the others are bills to come.
            paidAt: line.index === 1 ? (entry.paidAt ?? null) : null,
            bankAccountId: line.index === 1 ? firstAccountId : null,
            seriesId: series.id,
            seriesIndex: line.index,
          }))
        )
        .returning();
      return rows
        .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))
        .map((row) => toExpense(row, series));
    });
  };
}
