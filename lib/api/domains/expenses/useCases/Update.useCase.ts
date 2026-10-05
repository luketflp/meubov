import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { normaliseEntry } from "@/lib/api/domains/expenses/entryRules";
import { sameCents, unpairStale } from "@/lib/api/domains/statements/unpairStale";
import { entryFlow } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, Expense, ExpenseCategory } from "@/lib/types";

/** Editable fields of a lançamento; absent leaves a field, null clears it. */
export interface ExpensePatchInput {
  date?: string;
  category?: ExpenseCategory;
  amountBrl?: number;
  kind?: EntryKind;
  /** Movimento of an investment, financing or partners row. */
  flow?: EntryFlow;
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
type UpdateExpenseUseCaseResponse =
  | Expense
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account"
  | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

/**
 * Edits a lançamento of the farm ("Editar", "Marcar como pago"), checked as
 * the row will be after the patch:
 * - the vencimento against the data;
 * - what the kind needs and stores (normaliseEntry), when the kind, the
 *   movimento, the grupo or the conta do plano changes, or when the row is
 *   fora do resultado;
 * - "Pago por", when it changes, or against a new kind or movimento.
 * A linha do extrato the edit no longer agrees with (unpaid, other conta,
 * value or side) is unpaired in the same transaction.
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

      const kind = patch.kind ?? current.kind;
      const date = patch.date ?? current.date;
      const merged = {
        kind,
        flow: patch.flow ?? current.flow,
        date,
        category: patch.category ?? current.category,
        dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
        paidAt: patch.paidAt === undefined ? current.paidAt : patch.paidAt,
        accountId: patch.accountId === undefined ? current.accountId : patch.accountId,
        lotId: patch.lotId === undefined ? current.lotId : patch.lotId,
        bankAccountId: patch.bankAccountId === undefined ? current.bankAccountId : patch.bankAccountId,
      };
      // A despesa or receita that keeps its kind, grupo and conta keeps its shape: no query. So a row whose
      // conta disagrees with its grupo from before that rule still takes "Marcar como pago".
      const reshaped =
        patch.kind !== undefined ||
        patch.flow !== undefined ||
        patch.category !== undefined ||
        patch.accountId !== undefined ||
        (kind !== "expense" && kind !== "revenue");
      const shape = reshaped ? await normaliseEntry(tx, farmId, merged) : null;
      if (typeof shape === "string") return shape;
      const after = shape ?? merged;
      if (after.dueDate !== null && after.dueDate < date) return "due_before_date";

      // Unpaying clears the conta; a pending lançamento never holds one.
      const paid = after.paidAt !== null;
      const bankAccountId = !paid ? (current.bankAccountId ? null : undefined) : patch.bankAccountId;
      const contaAfter = bankAccountId === undefined ? current.bankAccountId : bankAccountId;
      // An unchanged conta saves even if archived; a new kind or movimento is still checked (no receita on a cartão).
      const contaChanged = contaAfter !== current.bankAccountId;
      if (
        contaAfter !== null &&
        (contaChanged || kind !== current.kind || after.flow !== current.flow) &&
        !(await isPayingAccount(tx, farmId, contaAfter, kind, !contaChanged, after.flow))
      ) {
        return "invalid_bank_account";
      }

      // Only the declared fields reach the update, never a stray column like farmId. When
      // normaliseEntry ran, the columns the kind decides are written as it left them.
      const { category, amountBrl, notes, paidAt, counterparty, document, accountId, lotId } = patch;
      const declared = {
        date: patch.date,
        kind: patch.kind,
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
        ...shape,
      };
      const set = Object.fromEntries(
        Object.entries(declared).filter(([, value]) => value !== undefined)
      ) as Partial<typeof expenses.$inferInsert>;
      if (Object.keys(set).length === 0) return toExpense(current);
      const [row] = await tx.update(expenses).set(set).where(scope).returning();
      if (!row) return null;
      if (
        paidAt !== undefined ||
        bankAccountId !== undefined ||
        amountBrl !== undefined ||
        patch.kind !== undefined ||
        patch.flow !== undefined
      ) {
        const signed = entryFlow(row) === "in" ? row.amountBrl : -row.amountBrl;
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
