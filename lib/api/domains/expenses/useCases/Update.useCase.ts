import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense, ExpenseCategory } from "@/lib/types";

/** Editable fields of a lançamento; absent leaves a field, null clears it. */
export interface ExpensePatchInput {
  date?: string;
  category?: ExpenseCategory;
  amountBrl?: number;
  kind?: EntryKind;
  notes?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  counterparty?: string | null;
  document?: string | null;
  accountId?: string | null;
  lotId?: string | null;
}

interface UpdateExpenseUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpensePatchInput;
}

/** Null when the lançamento is not on this farm. */
type UpdateExpenseUseCaseResponse = Expense | "due_before_date" | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

/**
 * Edits a lançamento of the farm ("Editar", "Marcar como pago"). The vencimento
 * is checked against the data the row will have after the patch.
 */
export class UpdateExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(expenses.farmId, farmId), eq(expenses.id, id));
    const [current] = await this.repository.select().from(expenses).where(scope).limit(1);
    if (!current) return null;

    const date = patch.date ?? current.date;
    const dueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
    if (dueDate !== null && dueDate < date) return "due_before_date";

    // Only the declared fields reach the update, never a stray column like farmId.
    const { kind, category, amountBrl, notes, paidAt, counterparty, document, accountId, lotId } =
      patch;
    const declared = {
      date: patch.date,
      kind,
      category,
      amountBrl,
      notes,
      dueDate: patch.dueDate,
      paidAt,
      counterparty,
      document,
      accountId,
      lotId,
    };
    const set = Object.fromEntries(
      Object.entries(declared).filter(([, value]) => value !== undefined)
    ) as ExpensePatchInput;
    if (Object.keys(set).length === 0) return toExpense(current);
    const [row] = await this.repository.update(expenses).set(set).where(scope).returning();
    return row ? toExpense(row) : null;
  };
}
