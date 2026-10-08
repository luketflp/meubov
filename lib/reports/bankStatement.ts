/**
 * Extrato de conta bancária: for each conta, its saldo at the end of the day
 * before the window, every line that went through it in the window (by payment
 * day, oldest first, with the saldo after it) and the saldo it ends on. Only
 * paid money reaches a conta, so there is no competência here. Pure.
 */
import type { BankAccount } from "@/lib/types";
import { addDays } from "@/lib/domain/dates";
import { accountBalance, accountMovements, cents } from "@/lib/domain/bankAccounts";
import { ledgerRows, type LedgerRow } from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import type { PlanInputs } from "@/lib/domain/planTree";

/** What a transferência's conta do plano column reads. */
export const TRANSFER = "Transferência";

export interface StatementLine {
  id: string;
  paidAt: string;
  /** Competência ("Emissão"); a transferência's own date. */
  issuedAt: string;
  /** Null on a transferência. */
  dueDate: string | null;
  document: string | null;
  /** Pago para / recebido de. */
  counterparty: string | null;
  history: string;
  /** "Nutrição › Sal mineral", "Receitas › Venda de gado", "Transferência". */
  planAccount: string;
  /** Written by a manejo. */
  locked: boolean;
  /** Signed: + entrada, − saída. */
  amountBrl: number;
  /** Saldo of the conta after the line. */
  balance: number;
}

export interface StatementSection {
  bank: BankAccount;
  /** Saldo at the end of the day before the window. */
  opening: number;
  ins: number;
  outs: number;
  closing: number;
  /** Oldest first. */
  lines: StatementLine[];
}

const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

/** As Contas bancárias lists them: the conta principal first, cartões last. */
const byBankOrder = (a: BankAccount, b: BankAccount): number =>
  Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card");

function ledgerLine(r: LedgerRow): Omit<StatementLine, "id" | "paidAt" | "amountBrl" | "balance"> {
  return {
    issuedAt: r.date,
    dueDate: r.dueDate,
    document: r.document,
    counterparty: r.counterparty,
    // Rows typed before the Histórico existed fall back to the observação, then the conta or grupo.
    history: r.history ?? r.notes ?? r.account ?? r.groupLabel,
    planAccount: r.account !== null && r.account !== r.groupLabel ? `${r.groupLabel} › ${r.account}` : r.groupLabel,
    locked: r.locked,
  };
}

/** The sections of one conta (`bankId`) or of every conta (`"all"`): the archived ones only when they moved in the window. */
export function bankStatement(
  inputs: PlanInputs,
  bankId: string,
  period: Period,
  todayIso: string
): StatementSection[] {
  const banks = inputs.bankAccounts;
  const byId = new Map(ledgerRows(inputs, ALL_TIME, todayIso).map((r) => [r.id, r]));
  const name = (id: string) => banks.find((b) => b.id === id)?.name ?? "outra conta";

  const sections = [...banks]
    .filter((b) => (bankId === "all" ? true : b.id === bankId))
    .sort(byBankOrder)
    .map((bank): StatementSection => {
      const lines = accountMovements(bank, inputs, period)
        .reverse()
        .map((move): StatementLine => {
          const base = { id: move.id, paidAt: move.date, amountBrl: move.amountBrl, balance: move.balance };
          if (move.transfer) {
            const t = move.transfer;
            const incoming = t.toId === bank.id;
            return {
              ...base,
              issuedAt: t.date,
              dueDate: null,
              document: null,
              counterparty: null,
              history: t.notes ?? `Transferência ${incoming ? "de" : "para"} ${name(incoming ? t.fromId : t.toId)}`,
              planAccount: TRANSFER,
              locked: false,
            };
          }
          return { ...base, ...ledgerLine(byId.get(move.id)!) };
        });
      const ins = cents(lines.filter((l) => l.amountBrl > 0).reduce((sum, l) => sum + l.amountBrl, 0));
      const outs = cents(lines.filter((l) => l.amountBrl < 0).reduce((sum, l) => sum - l.amountBrl, 0));
      const opening = accountBalance(bank, inputs, addDays(period.start, -1));
      return { bank, opening, ins, outs, closing: cents(opening + ins - outs), lines };
    });
  return bankId === "all" ? sections.filter((s) => s.bank.archivedAt === undefined || s.lines.length > 0) : sections;
}

/** "05/09" in the window's year, "30/12/25" off it: the extrato's dates on paper. */
export function statementDate(iso: string, period: Period): string {
  const [year, month, day] = iso.split("-");
  return year === period.end.slice(0, 4) ? `${day}/${month}` : `${day}/${month}/${year.slice(2)}`;
}
