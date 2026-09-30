/**
 * Contas bancárias: saldo of a conta corrente or caixa, the fatura of a
 * cartão and the movimentação of one conta with its running saldo. Pure.
 * A cartão's saldo is what is owed on it, negative: its saldo inicial (the
 * valor em aberto on `openingDate`), minus its purchases, plus the payments
 * into it; "A pagar no cartão" is `-accountBalance(card)`.
 *
 * What counts in a conta: the paid lançamentos and the vendas/compras whose
 * `bankAccountId` is it, and the transferências in and out, all dated after
 * `openingDate` (anything on or before it is already in the saldo inicial).
 */
import type { BankAccount, EntryKind, Expense, Movement, Transfer } from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { addDays, lastDayOfMonth } from "@/lib/domain/dates";

export interface BankInputs {
  expenses: Expense[];
  movements: Movement[];
  transfers: Transfer[];
}

export type BankMoveKind = "expense" | "revenue" | "sale" | "purchase" | "transferIn" | "transferOut";

/** One line of a conta's movimentação. */
export interface BankMove {
  /** The record's id (lançamento, movement or transferência). */
  id: string;
  kind: BankMoveKind;
  date: string;
  /** Signed: + entrada, − saída. */
  amountBrl: number;
  /** Saldo of the conta after this line. */
  balance: number;
  expense?: Expense;
  movement?: Movement;
  transfer?: Transfer;
}

export const BANK_ACCOUNT_KIND_LABEL: Record<BankAccount["kind"], string> = {
  checking: "Conta corrente",
  cash: "Caixa",
  card: "Cartão",
};

/** Money rounded to the centavo, so running sums never show 0,30000000004. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every line of the conta after its opening date, oldest first, without saldo. */
function movesOf(account: BankAccount, inputs: BankInputs): Omit<BankMove, "balance">[] {
  const after = (date: string) => date > account.openingDate;
  const moves: Omit<BankMove, "balance">[] = [];
  for (const e of inputs.expenses) {
    if (e.bankAccountId !== account.id || e.paidAt === undefined || !after(e.paidAt)) continue;
    const revenue = e.kind === "revenue";
    moves.push({
      id: e.id,
      kind: revenue ? "revenue" : "expense",
      date: e.paidAt,
      amountBrl: revenue ? e.amountBrl : -e.amountBrl,
      expense: e,
    });
  }
  for (const m of inputs.movements) {
    if (m.bankAccountId !== account.id || m.amountBrl === undefined || !after(m.date)) continue;
    if (m.type === "transfer") continue;
    const sale = m.type === "sale";
    moves.push({
      id: m.id,
      kind: sale ? "sale" : "purchase",
      date: m.date,
      amountBrl: sale ? m.amountBrl : -m.amountBrl,
      movement: m,
    });
  }
  for (const t of inputs.transfers) {
    if (!after(t.date)) continue;
    if (t.toId === account.id) {
      moves.push({ id: t.id, kind: "transferIn", date: t.date, amountBrl: t.amountBrl, transfer: t });
    } else if (t.fromId === account.id) {
      moves.push({ id: t.id, kind: "transferOut", date: t.date, amountBrl: -t.amountBrl, transfer: t });
    }
  }
  return moves.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
}

/** Saldo of a conta at the end of `day`. */
export function accountBalance(account: BankAccount, inputs: BankInputs, day: string): number {
  let balance = account.openingBalanceBrl;
  for (const move of movesOf(account, inputs)) {
    if (move.date <= day) balance += move.amountBrl;
  }
  return cents(balance);
}

/** "Saldo em contas": every conta corrente and caixa that is not archived. Cartões stay out. */
export function bankTotal(accounts: BankAccount[], inputs: BankInputs, day: string): number {
  return cents(
    accounts
      .filter((a) => a.kind !== "card" && a.archivedAt === undefined)
      .reduce((sum, a) => sum + accountBalance(a, inputs, day), 0)
  );
}

/** The conta's lines inside the window, newest first, each with the saldo after it. */
export function accountMovements(account: BankAccount, inputs: BankInputs, period: Period): BankMove[] {
  let balance = account.openingBalanceBrl;
  const rows: BankMove[] = [];
  for (const move of movesOf(account, inputs)) {
    if (move.date > period.end) break;
    balance = cents(balance + move.amountBrl);
    if (move.date >= period.start) rows.push({ ...move, balance });
  }
  return rows.reverse();
}

/** Day `day` of the month of `iso`; a shorter month uses its last day. */
function dayOfMonth(iso: string, day: number): string {
  const last = lastDayOfMonth(iso);
  return Number(last.slice(8, 10)) < day ? last : `${iso.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** First day of the month after the month of `iso`. */
function nextMonth(iso: string): string {
  return addDays(lastDayOfMonth(iso), 1);
}

/** First day of the month before the month of `iso`. */
function previousMonth(iso: string): string {
  return `${addDays(`${iso.slice(0, 8)}01`, -1).slice(0, 8)}01`;
}

export interface Fatura {
  /** Purchases after this day belong to it. */
  opensAfter: string;
  /** Its closing day: the last purchase day it takes. */
  closing: string;
  due: string;
}

/**
 * The fatura a purchase on `date` belongs to: the first closing day on or
 * after it; due on the next due day after that closing day.
 */
export function faturaOf(card: Pick<BankAccount, "closingDay" | "dueDay">, date: string): Fatura {
  const closingDay = card.closingDay ?? 1;
  const dueDay = card.dueDay ?? 1;
  const thisMonth = dayOfMonth(date, closingDay);
  const closing = date <= thisMonth ? thisMonth : dayOfMonth(nextMonth(date), closingDay);
  const dueSameMonth = dayOfMonth(closing, dueDay);
  const due = dueSameMonth > closing ? dueSameMonth : dayOfMonth(nextMonth(closing), dueDay);
  return { opensAfter: dayOfMonth(previousMonth(closing), closingDay), closing, due };
}

/**
 * The contas "Pago por" offers: not archived, the conta principal first; a
 * cartão only for a despesa.
 */
export function payingAccounts(accounts: BankAccount[], kind: EntryKind): BankAccount[] {
  return accounts
    .filter((a) => a.archivedAt === undefined && (kind === "expense" || a.kind !== "card"))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));
}

/** "Sicredi · c/c 12.345-6". */
export function bankAccountLabel(account: Pick<BankAccount, "name" | "label">): string {
  return account.label ? `${account.name} · ${account.label}` : account.name;
}
