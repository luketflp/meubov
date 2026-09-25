import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id" | "kind"> & {
  farmId: number;
  /** Defaults to a despesa. */
  kind?: EntryKind;
};

/** `due_before_date` when the vencimento is earlier than the data. */
type AddExpenseUseCaseResponse = Expense | "due_before_date";

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
    date,
    category,
    amountBrl,
    notes,
    dueDate,
    paidAt,
    counterparty,
    document,
    accountId,
    lotId,
  }) => {
    if (dueDate !== undefined && dueDate < date) return "due_before_date";
    // ponytail: accountId/lotId are not checked against the farm; the FK only proves they exist.
    const [row] = await this.repository
      .insert(expenses)
      .values({
        id: randomUUID(),
        farmId,
        kind,
        date,
        category,
        amountBrl,
        notes,
        dueDate: dueDate ?? null,
        paidAt: paidAt ?? null,
        counterparty: counterparty ?? null,
        document: document ?? null,
        accountId: accountId ?? null,
        lotId: lotId ?? null,
      })
      .returning();
    return toExpense(row);
  };
}
