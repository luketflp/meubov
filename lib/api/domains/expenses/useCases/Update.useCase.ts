import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { sameCents, unpairStale } from "@/lib/api/domains/statements/unpairStale";

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
  /** "Pago por"; cleared whenever the row ends up unpaid. */
  bankAccountId?: string | null;
}

interface UpdateExpenseUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpensePatchInput;
}

/** Null when the lançamento is not on this farm. */
type UpdateExpenseUseCaseResponse = Expense | "due_before_date" | "invalid_bank_account" | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

/**
 * Edits a lançamento of the farm ("Editar", "Marcar como pago"). The vencimento
 * is checked against the data the row will have after the patch. A conta is
 * checked when it changes, or against the new kind when that changes. A linha
 * do extrato the edit no longer agrees with (unpaid, other conta, value or
 * side) is unpaired in the same transaction.
 */
export class UpdateExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id, patch }) =>
    this.repository.transaction(async (tx) => {
      const scope = and(eq(expenses.farmId, farmId), eq(expenses.id, id));
      const [current] = await tx.select().from(expenses).where(scope).limit(1).for("update");
      if (!current) return null;

      const date = patch.date ?? current.date;
      const dueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
      if (dueDate !== null && dueDate < date) return "due_before_date";

      // Unpaying clears the conta; a pending lançamento never holds one.
      const paid = (patch.paidAt === undefined ? current.paidAt : patch.paidAt) !== null;
      const bankAccountId = !paid ? (current.bankAccountId ? null : undefined) : patch.bankAccountId;
      const kindAfter = patch.kind ?? current.kind;
      const contaAfter = bankAccountId === undefined ? current.bankAccountId : bankAccountId;
      // An unchanged conta saves even archived; a new kind still keeps a receita off a cartão.
      const contaChanged = contaAfter !== current.bankAccountId;
      if (
        contaAfter !== null &&
        (contaChanged || kindAfter !== current.kind) &&
        !(await isPayingAccount(tx, farmId, contaAfter, kindAfter, !contaChanged))
      ) {
        return "invalid_bank_account";
      }

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
        bankAccountId,
      };
      const set = Object.fromEntries(
        Object.entries(declared).filter(([, value]) => value !== undefined)
      ) as ExpensePatchInput;
      if (Object.keys(set).length === 0) return toExpense(current);
      const [row] = await tx.update(expenses).set(set).where(scope).returning();
      if (!row) return null;
      if (paidAt !== undefined || bankAccountId !== undefined || amountBrl !== undefined || kind !== undefined) {
        const signed = row.kind === "revenue" ? row.amountBrl : -row.amountBrl;
        await unpairStale(
          tx,
          farmId,
          "expenseId",
          id,
          (line) => row.paidAt !== null && row.bankAccountId === line.bankAccountId && sameCents(signed, line)
        );
      }
      return toExpense(row);
    });
}
