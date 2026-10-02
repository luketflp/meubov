/**
 * The fields of "Novo lançamento" and what they become. `initialFields` says
 * where the form starts (the lançamento edited or duplicated, the nó picked,
 * a linha do extrato), `withKind` keeps it sound when the type or the
 * movimento changes, and `entryValues` turns it into the row the API takes: a
 * receita and the capital kinds write category "other"; the capital kinds
 * need a conta and a movimento and take no lote. Pure.
 */
import type { BankAccount, EntryFlow, EntryKind, Expense, ExpenseCategory, StatementLine } from "@/lib/types";
import { isCapitalKind, isInflow, mayPayFrom } from "@/lib/domain/entries";
import type { EntryInitial } from "@/lib/domain/planTree";
import { parseAmount } from "@/components/finance/parseAmount";
import { defaultPaidBy } from "@/components/finance/contas/PaidByField";

/** Select value for "Sem conta" and "Fazenda toda": Radix refuses "". */
export const NONE = "none";

export interface EntryFields {
  kind: EntryKind;
  /** Movimento; read on investimento, financiamento and sócios only. */
  flow: EntryFlow;
  date: string;
  amount: string;
  category: ExpenseCategory;
  accountId: string;
  dueDate: string;
  /** The user changed Vencimento; until then it follows Data. */
  dueTouched: boolean;
  paid: boolean;
  paidAt: string;
  /** "Pago por": a conta bancária id, "" when the farm has none. */
  bankAccountId: string;
  counterparty: string;
  document: string;
  lotId: string;
  notes: string;
}

/** Where the form starts. */
export interface EntrySource {
  /** Editar. */
  expense?: Expense;
  /** Duplicar: a new lançamento filled from this one. */
  template?: Expense;
  /** "Novo" on a picked nó. */
  initial?: EntryInitial;
  /** "Criar lançamento" from a linha do extrato. */
  fromLine?: StatementLine;
  defaultKind: EntryKind;
}

/** The row the fields describe, without its kind; null clears (edit) or is left out (create). */
export interface EntryValues {
  /** Movimento of an investimento, financiamento or sócios; absent on the others. */
  flow?: EntryFlow;
  date: string;
  category: ExpenseCategory;
  amountBrl: number;
  dueDate: string;
  paidAt: string | null;
  counterparty: string | null;
  document: string | null;
  accountId: string | null;
  bankAccountId: string | null;
  lotId: string | null;
  notes: string | null;
}

const amountText = (amountBrl: number) => String(amountBrl).replace(".", ",");

export function initialFields(source: EntrySource, bankAccounts: BankAccount[], today: string): EntryFields {
  const { expense, template, initial, fromLine } = source;
  if (fromLine) {
    return {
      kind: fromLine.amountBrl < 0 ? "expense" : "revenue",
      flow: "out",
      date: fromLine.date,
      amount: amountText(Math.abs(fromLine.amountBrl)),
      category: "nutrition",
      accountId: NONE,
      dueDate: fromLine.date,
      dueTouched: false,
      paid: true,
      paidAt: fromLine.date,
      bankAccountId: fromLine.bankAccountId,
      counterparty: "",
      document: "",
      lotId: NONE,
      notes: fromLine.description,
    };
  }
  if (expense) {
    return {
      kind: expense.kind,
      flow: expense.flow ?? "out",
      date: expense.date,
      amount: amountText(expense.amountBrl),
      category: expense.category,
      accountId: expense.accountId ?? NONE,
      dueDate: expense.dueDate ?? expense.date,
      dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
      paid: expense.paidAt !== undefined,
      paidAt: expense.paidAt ?? today,
      // A row paid before the contas existed stays without one until the farmer picks it.
      bankAccountId:
        expense.bankAccountId ?? (expense.paidAt ? "" : defaultPaidBy(bankAccounts, expense.kind, expense.flow)),
      counterparty: expense.counterparty ?? "",
      document: expense.document ?? "",
      lotId: expense.lotId ?? NONE,
      notes: expense.notes ?? "",
    };
  }
  // Duplicar keeps what the lançamento is and drops when and how it was paid.
  const kind = template?.kind ?? initial?.kind ?? source.defaultKind;
  const flow = template?.flow ?? initial?.flow ?? "out";
  return {
    kind,
    flow,
    date: today,
    amount: template ? amountText(template.amountBrl) : "",
    category: template?.category ?? initial?.category ?? "nutrition",
    accountId: template?.accountId ?? initial?.accountId ?? NONE,
    dueDate: today,
    dueTouched: false,
    paid: !template,
    paidAt: today,
    bankAccountId: initial?.bankAccountId ?? defaultPaidBy(bankAccounts, kind, flow),
    counterparty: template?.counterparty ?? "",
    document: template?.document ?? "",
    lotId: template?.lotId ?? NONE,
    notes: template?.notes ?? "",
  };
}

/**
 * The type or the movimento changed: another kind starts without conta (its
 * grupo changed), and "Pago por" leaves a conta that may not take the new
 * direction (a cartão never receives).
 */
export function withKind(
  fields: EntryFields,
  kind: EntryKind,
  flow: EntryFlow,
  bankAccounts: BankAccount[]
): EntryFields {
  const current = bankAccounts.find((a) => a.id === fields.bankAccountId);
  return {
    ...fields,
    kind,
    flow,
    accountId: kind === fields.kind ? fields.accountId : NONE,
    bankAccountId:
      current && mayPayFrom(current.kind, kind, flow) ? current.id : defaultPaidBy(bankAccounts, kind, flow),
  };
}

/**
 * The row the fields describe, or the message that stops it. `repeating`:
 * Repetir sets the vencimentos, so Vencimento is not read.
 */
export function entryValues(fields: EntryFields, repeating: boolean): EntryValues | string {
  if (fields.date === "") return "Informe a data do lançamento.";
  const amountBrl = parseAmount(fields.amount);
  if (!Number.isFinite(amountBrl) || amountBrl <= 0) return "Informe o valor (maior que zero).";
  const capital = isCapitalKind(fields.kind);
  if (capital && fields.accountId === NONE) return "Escolha a conta do plano.";
  if (!repeating && fields.dueDate === "") return "Informe o vencimento.";
  if (!repeating && fields.dueDate < fields.date) return "O vencimento não pode ser antes da data";
  if (fields.paid && fields.paidAt === "") {
    return isInflow(fields) ? "Informe a data do recebimento." : "Informe a data do pagamento.";
  }
  return {
    ...(capital ? { flow: fields.flow } : {}),
    date: fields.date,
    category: fields.kind === "expense" ? fields.category : "other",
    amountBrl,
    dueDate: fields.dueDate,
    paidAt: fields.paid ? fields.paidAt : null,
    counterparty: fields.counterparty.trim() || null,
    document: fields.document.trim() || null,
    accountId: fields.accountId === NONE ? null : fields.accountId,
    bankAccountId: fields.paid && fields.bankAccountId !== "" ? fields.bankAccountId : null,
    lotId: capital || fields.lotId === NONE ? null : fields.lotId,
    notes: fields.notes.trim() || null,
  };
}
