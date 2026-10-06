import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  bankAccounts,
  expenses,
  manejoSessionAnimals,
  manejoSessions,
  movements,
  statementLines,
  transfers,
} from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toExpense, toStatementLine, toTransfer } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { AddExpenseUseCase } from "@/lib/api/domains/expenses/useCases/Add.useCase";
import { entryFlow } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, StatementLine, Transfer } from "@/lib/types";
import type { MatchTarget } from "@/lib/domain/statements/match";

/** The EntryDialog's fields for "Criar lançamento"; kind, pagamento and conta come from the line. */
export interface LineEntry {
  date: string;
  category: Expense["category"];
  amountBrl: number;
  notes?: string;
  dueDate?: string;
  paidAt?: string;
  history?: string;
  counterparty?: string;
  document?: string;
  accountId?: string;
  lotId?: string;
}

export type LineAction =
  | { type: "match"; target: MatchTarget }
  | { type: "create"; entry: LineEntry }
  | { type: "transfer"; otherAccountId: string }
  | { type: "ignore"; reason: string }
  | { type: "undo" };

/** The line after the decision, with what the store must merge. */
export interface Resolved {
  line: StatementLine;
  /** A lançamento paid, given the conta, or created. */
  expense?: Expense;
  /** A venda or compra that took the conta. */
  movement?: { id: string; bankAccountId: string };
  transfer?: Transfer;
}

/**
 * `not_found`: the line is not the farm's; `target_not_found`: the record is
 * not; `not_pending`: the line already has a decision; `wrong_side`: an
 * entrada paired with a saída or the reverse; `paid_by_other`: the record was
 * paid by another conta; `already_paired`: another line confirms it;
 * `same_account`: a transferência to the line's own conta; `card_from`: an
 * entrada from a cartão (a cartão only receives its fatura); `amount_differs`:
 * a paid lançamento, a venda/compra or a transferência worth another value
 * than the line; `due_before_date`, `invalid_category`, `invalid_account`
 * and `invalid_bank_account`: the lançamento "Criar lançamento" sent.
 */
export type ResolveRefusal =
  | "not_found"
  | "target_not_found"
  | "not_pending"
  | "wrong_side"
  | "paid_by_other"
  | "already_paired"
  | "same_account"
  | "card_from"
  | "amount_differs"
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account";

interface ResolveLineUseCaseProps {
  farmId: number;
  userId: string;
  lineId: string;
  action: LineAction;
}

type CurrUseCase = _UseCase<ResolveLineUseCaseProps, Resolved | ResolveRefusal>;

class Refused extends Error {
  constructor(readonly code: ResolveRefusal) {
    super(code);
  }
}

/**
 * One decision on a linha do extrato: pair it with a record, create the
 * lançamento it is, turn it into a transferência, ignore it, or undo any of
 * these (the record stays as it is). Pairing a pending lançamento pays it on
 * the line's date from the line's conta, at the line's value; a paid one or a
 * venda without a conta takes this one; one paid by another conta, or a
 * record already settled at another value, is refused: the saldo must equal
 * the bank's.
 */
export class ResolveLineUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ResolveLineUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async (props) => {
    try {
      return await this.repository.transaction((tx) => resolve(tx, props));
    } catch (error) {
      if (error instanceof Refused) return error.code;
      if (isUniqueViolation(error)) return "already_paired";
      throw error;
    }
  };
}

/** Runs one decision on `tx`; throws Refused to roll it back. ConfirmHigh reuses it. */
export async function resolve(
  tx: RepositoryType,
  { farmId, userId, lineId, action }: ResolveLineUseCaseProps
): Promise<Resolved> {
  const scope = and(eq(statementLines.farmId, farmId), eq(statementLines.id, lineId));
  const [line] = await tx.select().from(statementLines).where(scope).limit(1).for("update");
  if (!line) throw new Refused("not_found");

  const save = async (set: Partial<typeof statementLines.$inferInsert>) => {
    const [row] = await tx.update(statementLines).set(set).where(scope).returning();
    return toStatementLine(row);
  };
  const resolvedBy = { resolvedAt: new Date(), resolvedBy: userId };

  if (action.type === "undo") {
    if (line.status === "pending") return { line: toStatementLine(line) };
    return {
      line: await save({
        status: "pending",
        expenseId: null,
        movementId: null,
        transferId: null,
        ignoreReason: null,
        resolvedAt: null,
        resolvedBy: null,
      }),
    };
  }
  if (line.status !== "pending") throw new Refused("not_pending");
  const outflow = line.amountBrl < 0;
  const lineCents = Math.round(Math.abs(line.amountBrl) * 100);
  const sameValue = (amount: number | null) => amount !== null && Math.round(amount * 100) === lineCents;

  if (action.type === "ignore") {
    return { line: await save({ status: "ignored", ignoreReason: action.reason.trim(), ...resolvedBy }) };
  }

  if (action.type === "create") {
    const expense = await new AddExpenseUseCase(tx).run({
      ...action.entry,
      farmId,
      kind: outflow ? "expense" : "revenue",
      category: outflow ? action.entry.category : "other",
      // The line is the payment: its value and date, whatever the form sent.
      amountBrl: Math.abs(line.amountBrl),
      paidAt: line.date,
      bankAccountId: line.bankAccountId,
    });
    if (typeof expense === "string") throw new Refused(expense);
    return { line: await save({ status: "created", expenseId: expense.id, ...resolvedBy }), expense };
  }

  if (action.type === "transfer") {
    if (action.otherAccountId === line.bankAccountId) throw new Refused("same_account");
    const [other] = await tx
      .select({ id: bankAccounts.id, kind: bankAccounts.kind })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.farmId, farmId),
          eq(bankAccounts.id, action.otherAccountId),
          isNull(bankAccounts.archivedAt)
        )
      )
      .limit(1);
    if (!other) throw new Refused("target_not_found");
    if (!outflow && other.kind === "card") throw new Refused("card_from");
    const [row] = await tx
      .insert(transfers)
      .values({
        id: randomUUID(),
        farmId,
        fromId: outflow ? line.bankAccountId : other.id,
        toId: outflow ? other.id : line.bankAccountId,
        date: line.date,
        amountBrl: Math.abs(line.amountBrl),
        notes: line.description,
        createdBy: userId,
      })
      .returning();
    return { line: await save({ status: "transfer", transferId: row.id, ...resolvedBy }), transfer: toTransfer(row) };
  }

  const { target } = action;
  if (target.kind === "expense") {
    const where = and(eq(expenses.farmId, farmId), eq(expenses.id, target.id));
    const [expense] = await tx.select().from(expenses).where(where).limit(1).for("update");
    if (!expense) throw new Refused("target_not_found");
    if ((entryFlow(expense) === "out") !== outflow) throw new Refused("wrong_side");
    if (expense.bankAccountId !== null && expense.bankAccountId !== line.bankAccountId) {
      throw new Refused("paid_by_other");
    }
    const pending = expense.paidAt === null;
    if (!pending && !sameValue(expense.amountBrl)) throw new Refused("amount_differs");
    let updated = expense;
    if (pending || expense.bankAccountId === null) {
      [updated] = await tx
        .update(expenses)
        .set({
          paidAt: expense.paidAt ?? line.date,
          bankAccountId: line.bankAccountId,
          // A pending lançamento is paid at what the bank moved.
          ...(pending && !sameValue(expense.amountBrl) ? { amountBrl: Math.abs(line.amountBrl) } : {}),
        })
        .where(where)
        .returning();
    }
    const saved = await save({ status: "matched", expenseId: expense.id, ...resolvedBy });
    return { line: saved, expense: toExpense(updated) };
  }

  if (target.kind === "movement") {
    const [session] = await tx
      .select({
        kind: manejoSessions.kind,
        bankAccountId: manejoSessions.bankAccountId,
        totalAmountBrl: manejoSessions.totalAmountBrl,
      })
      .from(manejoSessions)
      .where(
        and(
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessions.id, target.id),
          inArray(manejoSessions.kind, ["sale", "entry"]),
          isNull(manejoSessions.deletedAt)
        )
      )
      .limit(1)
      .for("update");
    const [legacy] = session
      ? []
      : await tx
          .select({ type: movements.type, bankAccountId: movements.bankAccountId, amountBrl: movements.amountBrl })
          .from(movements)
          .where(and(eq(movements.farmId, farmId), eq(movements.id, target.id), inArray(movements.type, ["sale", "purchase"])))
          .limit(1)
          .for("update");
    if (!session && !legacy) throw new Refused("target_not_found");
    const sale = session ? session.kind === "sale" : legacy.type === "sale";
    if (sale === outflow) throw new Refused("wrong_side");
    // A session's value: its closed price, or what each animal handled was worth (sessionToMovement).
    let amount = session ? session.totalAmountBrl : legacy.amountBrl;
    if (session && amount === null) {
      const [sum] = await tx
        .select({ total: sql<number | null>`sum(${manejoSessionAnimals.amountBrl})`.mapWith(Number) })
        .from(manejoSessionAnimals)
        .where(and(eq(manejoSessionAnimals.sessionId, target.id), eq(manejoSessionAnimals.outcome, "done")));
      amount = sum?.total ?? null;
    }
    if (!sameValue(amount)) throw new Refused("amount_differs");
    const current = session ? session.bankAccountId : legacy.bankAccountId;
    if (current !== null && current !== line.bankAccountId) throw new Refused("paid_by_other");
    if (current === null) {
      if (session) {
        await tx
          .update(manejoSessions)
          .set({ bankAccountId: line.bankAccountId })
          .where(and(eq(manejoSessions.farmId, farmId), eq(manejoSessions.id, target.id)));
      } else {
        await tx
          .update(movements)
          .set({ bankAccountId: line.bankAccountId })
          .where(and(eq(movements.farmId, farmId), eq(movements.id, target.id)));
      }
    }
    const saved = await save({ status: "matched", movementId: target.id, ...resolvedBy });
    return { line: saved, movement: { id: target.id, bankAccountId: line.bankAccountId } };
  }

  const [transfer] = await tx
    .select()
    .from(transfers)
    .where(and(eq(transfers.farmId, farmId), eq(transfers.id, target.id)))
    .limit(1);
  if (!transfer) throw new Refused("target_not_found");
  const ours = outflow ? transfer.fromId : transfer.toId;
  if (ours !== line.bankAccountId) throw new Refused("wrong_side");
  if (!sameValue(transfer.amountBrl)) throw new Refused("amount_differs");
  return { line: await save({ status: "transfer", transferId: transfer.id, ...resolvedBy }), transfer: toTransfer(transfer) };
}

export { Refused };
