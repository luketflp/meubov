/**
 * The fields of "Novo lançamento" and what they become. `initialFields` says
 * where the form starts (the lançamento edited or duplicated, the nó picked,
 * a linha do extrato), `withKind` keeps it sound when the type or the
 * movimento changes, and `entryValues` turns it into the row the API takes:
 * every kind carries its grupo (a PlanGroup of its tipo); the capital kinds
 * need a conta and a movimento and take no lote. `entrySummary` is the line
 * at the foot of the dialog that says what will be lançado. Pure.
 */
import type {
  BankAccount,
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  PlanGroup,
  SeriesRepeat,
  StatementLine,
} from "@/lib/types";
import { ENTRY_KIND_LABEL, FLOW_LABEL, isCapitalKind, isInflow, mayPayFrom } from "@/lib/domain/entries";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { installmentPlan } from "@/lib/domain/series";
import { groupsOf } from "@/lib/domain/groups";
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
  /** A PlanGroup id of the tipo; "" when the tipo has no active grupo. */
  category: ExpenseCategory;
  accountId: string;
  dueDate: string;
  /** The user changed Vencimento; until then it follows Data. */
  dueTouched: boolean;
  paid: boolean;
  paidAt: string;
  /** "Pago por": a conta bancária id, "" when the farm has none. */
  bankAccountId: string;
  history: string;
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
  history: string | null;
  counterparty: string | null;
  document: string | null;
  accountId: string | null;
  bankAccountId: string | null;
  lotId: string | null;
  notes: string | null;
}

const amountText = (amountBrl: number) => String(amountBrl).replace(".", ",");

/** The grupo a tipo starts in: its first active one by name, "" when it has none. */
const firstGroup = (planGroups: readonly PlanGroup[], kind: EntryKind): ExpenseCategory =>
  kind === "yield" ? "" : (groupsOf(planGroups, kind)[0]?.id ?? "");

/** `planGroups`: every grupo of the farm; a new lançamento only starts in one it may still pick. */
export function initialFields(
  source: EntrySource,
  bankAccounts: BankAccount[],
  today: string,
  planGroups: readonly PlanGroup[]
): EntryFields {
  const { expense, template, initial, fromLine } = source;
  if (fromLine) {
    const kind = fromLine.amountBrl < 0 ? "expense" : "revenue";
    return {
      kind,
      flow: "out",
      date: fromLine.date,
      amount: amountText(Math.abs(fromLine.amountBrl)),
      category: firstGroup(planGroups, kind),
      accountId: NONE,
      dueDate: fromLine.date,
      dueTouched: false,
      paid: true,
      paidAt: fromLine.date,
      bankAccountId: fromLine.bankAccountId,
      // The bank's description is what the line was: the histórico.
      history: fromLine.description,
      counterparty: "",
      document: "",
      lotId: NONE,
      notes: "",
    };
  }
  if (expense) {
    return {
      kind: expense.kind,
      flow: expense.flow ?? "out",
      date: expense.date,
      amount: amountText(expense.amountBrl),
      // Its own grupo, archived or not: the picker keeps it for this row.
      category: expense.category ?? "",
      accountId: expense.accountId ?? NONE,
      dueDate: expense.dueDate ?? expense.date,
      dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
      paid: expense.paidAt !== undefined,
      paidAt: expense.paidAt ?? today,
      // A row paid before the contas existed stays without one until the farmer picks it.
      bankAccountId:
        expense.bankAccountId ?? (expense.paidAt ? "" : defaultPaidBy(bankAccounts, expense.kind, expense.flow)),
      history: expense.history ?? "",
      counterparty: expense.counterparty ?? "",
      document: expense.document ?? "",
      lotId: expense.lotId ?? NONE,
      notes: expense.notes ?? "",
    };
  }
  // Duplicar keeps what the lançamento is and drops when and how it was paid.
  const kind = template?.kind ?? initial?.kind ?? source.defaultKind;
  const flow = template?.flow ?? initial?.flow ?? "out";
  // An archived grupo, one deleted meanwhile or one of another tipo falls back to the tipo's first, without its conta.
  const picked = template?.category ?? initial?.category;
  const live = kind !== "yield" && groupsOf(planGroups, kind).some((g) => g.id === picked);
  return {
    kind,
    flow,
    date: today,
    amount: template ? amountText(template.amountBrl) : "",
    category: live && picked ? picked : firstGroup(planGroups, kind),
    accountId: live ? (template?.accountId ?? initial?.accountId ?? NONE) : NONE,
    dueDate: today,
    dueTouched: false,
    paid: !template,
    paidAt: today,
    bankAccountId: initial?.bankAccountId ?? defaultPaidBy(bankAccounts, kind, flow),
    history: template?.history ?? "",
    counterparty: template?.counterparty ?? "",
    document: template?.document ?? "",
    lotId: template?.lotId ?? NONE,
    notes: template?.notes ?? "",
  };
}

/**
 * The type or the movimento changed: another kind starts in its first grupo
 * without conta, and "Pago por" leaves a conta that may not take the new
 * direction (a cartão never receives).
 */
export function withKind(
  fields: EntryFields,
  kind: EntryKind,
  flow: EntryFlow,
  bankAccounts: BankAccount[],
  planGroups: readonly PlanGroup[]
): EntryFields {
  const current = bankAccounts.find((a) => a.id === fields.bankAccountId);
  const same = kind === fields.kind;
  return {
    ...fields,
    kind,
    flow,
    category: same ? fields.category : firstGroup(planGroups, kind),
    accountId: same ? fields.accountId : NONE,
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
  if (fields.category === "") return "Escolha o grupo.";
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
    category: fields.category,
    amountBrl,
    dueDate: fields.dueDate,
    paidAt: fields.paid ? fields.paidAt : null,
    history: fields.history.trim() || null,
    counterparty: fields.counterparty.trim() || null,
    document: fields.document.trim() || null,
    accountId: fields.accountId === NONE ? null : fields.accountId,
    bankAccountId: fields.paid && fields.bankAccountId !== "" ? fields.bankAccountId : null,
    lotId: capital || fields.lotId === NONE ? null : fields.lotId,
    notes: fields.notes.trim() || null,
  };
}

/** "Despesa de" · "R$ 3.840,00" · "em Máquinas e veículos › Diesel · pago hoje · Sicredi". */
export interface EntrySummary {
  lead: string;
  value: string;
  rest: string;
}

/**
 * What the form will lançar, in one line; null while it would not save.
 * `repeat`: the parcelamento or recorrência chosen, null for Uma vez.
 */
export function entrySummary(
  fields: EntryFields,
  repeat: SeriesRepeat | null,
  names: { group?: string; account?: string; bank?: string },
  today: string
): EntrySummary | null {
  if (typeof entryValues(fields, repeat !== null) === "string") return null;
  const amount = parseAmount(fields.amount);
  const capital = isCapitalKind(fields.kind);
  const what = isCapitalKind(fields.kind) ? FLOW_LABEL[fields.kind][fields.flow] : ENTRY_KIND_LABEL[fields.kind];
  const where = [names.group, names.account].filter(Boolean).join(" › ");
  const day = (iso: string) => (iso === today ? "hoje" : formatDate(iso).slice(0, 5));
  const inflow = isInflow(fields);
  const rest = [where ? `em ${where}` : "", capital ? "fora do custo" : ""];
  // "a 1ª" is the first parcela or conta of a série; "Já pago" belongs to it alone.
  const first = (startsOn: string) =>
    fields.paid ? `a 1ª ${inflow ? "recebida" : "paga"} ${day(fields.paidAt)}` : `a 1ª vence ${day(startsOn)}`;
  let lead = `${what} de`;
  let value = formatCurrency(amount);
  if (repeat?.mode === "installments") {
    const plan = installmentPlan(amount, repeat.count ?? 0, repeat.startsOn, repeat.frequency);
    lead = `${plan.length} parcelas de`;
    value = formatCurrency(plan[0].amountBrl);
    rest.push(first(repeat.startsOn));
  } else if (repeat) {
    lead = `${what} recorrente de`;
    rest.push(first(repeat.startsOn));
  } else if (fields.paid) {
    rest.push(`${inflow ? "recebido" : "pago"} ${day(fields.paidAt)}`, names.bank ?? "");
  } else {
    rest.push(`vence ${day(fields.dueDate)}`);
  }
  return { lead, value, rest: rest.filter(Boolean).join(" · ") };
}
