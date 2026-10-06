import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { normaliseEntry } from "@/lib/api/domains/expenses/entryRules";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id" | "kind"> & {
  farmId: number;
  /** Defaults to a despesa. */
  kind?: EntryKind;
};

/**
 * - `due_before_date`: the vencimento is earlier than the data.
 * - `invalid_category`: the grupo is neither a built-in one nor one of this farm's.
 * - `invalid_account`: the conta do plano does not fit the kind or the grupo (see normaliseEntry).
 * - `invalid_bank_account`: "Pago por" is not a conta of the farm that may pay
 *   it. That covers an archived conta, a cartão receiving money, and anything
 *   but an aplicação for a rendimento.
 */
type AddExpenseUseCaseResponse =
  | Expense
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account";

type CurrUseCase = _UseCase<AddExpenseUseCaseProps, AddExpenseUseCaseResponse>;

/** Registers a lançamento and returns it with its server-generated id. */
export class AddExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({
    farmId,
    kind = "expense",
    flow,
    date,
    category,
    amountBrl,
    notes,
    dueDate,
    paidAt,
    history,
    counterparty,
    document,
    accountId,
    lotId,
    bankAccountId,
  }) => {
    const entry = await normaliseEntry(this.repository, farmId, {
      kind,
      flow,
      date,
      category,
      dueDate,
      paidAt,
      accountId,
      lotId,
      bankAccountId,
    });
    if (typeof entry === "string") return entry;
    if (entry.dueDate !== null && entry.dueDate < date) return "due_before_date";
    // A pending lançamento has no conta.
    const payingAccountId = entry.paidAt === null ? null : (bankAccountId ?? null);
    if (
      payingAccountId !== null &&
      !(await isPayingAccount(this.repository, farmId, payingAccountId, kind, false, entry.flow))
    ) {
      return "invalid_bank_account";
    }
    // ponytail: lotId is not checked against the farm; the FK only proves it exists.
    const [row] = await this.repository
      .insert(expenses)
      .values({
        id: randomUUID(),
        farmId,
        ...entry,
        date,
        amountBrl,
        notes,
        history: history ?? null,
        counterparty: counterparty ?? null,
        document: document ?? null,
        bankAccountId: payingAccountId,
      })
      .returning();
    return toExpense(row);
  };
}
