import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, semenBulls, semenPurchases } from "@/lib/db/schema";
import { purchaseExpenseNotes } from "@/lib/domain/semen";
import { toSemenPurchase } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { AddExpenseUseCase } from "@/lib/api/domains/expenses/useCases/Add.useCase";

import { textOrNull } from "../_shared/text";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, SemenPurchase } from "@/lib/types";

/** A purchase of doses as the client sends it. */
export interface NewSemenPurchaseInput {
  date: string;
  doses: number;
  totalBrl: number;
  seller?: string;
}

/** A written purchase and the expense it became. */
export interface WrittenSemenPurchase {
  purchase: SemenPurchase;
  expense: Expense;
}

/**
 * Writes one purchase of a bull and its Reprodução expense ("Sêmen — <touro>,
 * <N> doses"), paid on the purchase date, paid to the bull's central, in the
 * farm's active "Sêmen" conta when it has one. The expense goes first so the
 * purchase can point at it. Call inside a transaction: the two rows land
 * together or not at all.
 */
export async function writeSemenPurchase(
  repository: RepositoryType,
  farmId: number,
  bull: { id: string; name: string; central: string | null },
  input: NewSemenPurchaseInput
): Promise<WrittenSemenPurchase> {
  const [account] = await repository
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.farmId, farmId),
        eq(accounts.group, "breeding"),
        isNull(accounts.archivedAt),
        sql`lower(${accounts.name}) = 'sêmen'`
      )
    )
    .limit(1);
  const expense = await new AddExpenseUseCase(repository).run({
    farmId,
    kind: "expense",
    date: input.date,
    paidAt: input.date,
    category: "breeding",
    amountBrl: input.totalBrl,
    counterparty: bull.central ?? undefined,
    accountId: account?.id,
    notes: purchaseExpenseNotes(bull.name, input.doses),
  });
  // No vencimento is sent, so Add's only refusal cannot happen here.
  if (expense === "due_before_date") throw new Error(expense);
  const [row] = await repository
    .insert(semenPurchases)
    .values({
      id: randomUUID(),
      bullId: bull.id,
      date: input.date,
      doses: input.doses,
      totalBrl: input.totalBrl,
      seller: textOrNull(input.seller),
      expenseId: expense.id,
    })
    .returning();
  return { purchase: toSemenPurchase(row), expense };
}

interface AddPurchaseUseCaseProps {
  farmId: number;
  bullId: string;
  input: NewSemenPurchaseInput;
}

type AddPurchaseUseCaseResponse = WrittenSemenPurchase | "not_found";

type CurrUseCase = _UseCase<AddPurchaseUseCaseProps, AddPurchaseUseCaseResponse>;

/**
 * Registers a purchase of doses of a bull of the farm, with its expense in the
 * same transaction. Buying only adds stock, so no row lock is needed here.
 */
export class AddPurchaseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddPurchaseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, bullId, input }) => {
    return this.repository.transaction(async (tx) => {
      const [bull] = await tx
        .select({ id: semenBulls.id, name: semenBulls.name, central: semenBulls.central })
        .from(semenBulls)
        .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, bullId)))
        .limit(1);
      if (!bull) return "not_found";

      return writeSemenPurchase(tx, farmId, bull, input);
    });
  };
}
