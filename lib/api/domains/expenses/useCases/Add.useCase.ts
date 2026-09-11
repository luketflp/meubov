import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id"> & { farmId: number };

type AddExpenseUseCaseResponse = Expense;

type CurrUseCase = _UseCase<AddExpenseUseCaseProps, AddExpenseUseCaseResponse>;

/** Registers an expense and returns it with its server-generated id. */
export class AddExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, date, category, amountBrl, notes }) => {
    const [row] = await this.repository
      .insert(expenses)
      .values({ id: randomUUID(), farmId, date, category, amountBrl, notes })
      .returning();
    return toExpense(row);
  };
}
