/**
 * The ledger: every line of money of the farm in a window — the lançamentos
 * typed by hand plus the rows derived from the manejos (vendas, compras),
 * which are locked — with the caixa and the pending bills. A tratamento's cost
 * stays in Sanidade and is no line here. Pure.
 */
import type {
  Account,
  AccountGroup,
  Animal,
  EntryKind,
  Expense,
  Lot,
  ManejoSession,
  ManejoSessionAnimal,
  Movement,
  PlanGroup,
} from "@/lib/types";
import { inPeriod, type Period } from "@/lib/domain/period";
import { accountName } from "@/lib/domain/accounts";
import { GROUP_KIND_LABEL, groupLabel } from "@/lib/domain/groups";
import { saleSummary } from "@/lib/domain/movements";
import { KG_PER_ARROBA } from "@/lib/domain/weights";
import { formatArroba } from "@/lib/domain/format";
import { ENTRY_KIND_LABEL, entryGroup, isInflow } from "@/lib/domain/entries";

export type LedgerKind = EntryKind | "sale" | "purchase";
export type LedgerStatus = "paid" | "received" | "payable" | "receivable" | "overdue";

export interface LedgerRow {
  /** Expense id | movement id. */
  id: string;
  kind: LedgerKind;
  /** Money in: receitas, vendas, rendimentos and capital rows that enter. */
  inflow: boolean;
  date: string;
  dueDate: string;
  paidAt: string | null;
  status: LedgerStatus;
  /** The grupo of the plano (a PlanGroup id); "capital" for what has none: compras de gado and rendimentos. A venda de gado reads "revenue". */
  group: AccountGroup | "capital";
  groupLabel: string;
  account: string | null;
  /** The conta bancária it went through ("Pago por", or a venda's conta); null for none. */
  bankAccountId: string | null;
  /** The lançamento's histórico; null on manejo rows. */
  history: string | null;
  counterparty: string | null;
  document: string | null;
  lotId: string | null;
  lotName: string | null;
  amountBrl: number;
  /** The lançamento's observação. */
  notes: string | null;
  /** Derived from a manejo: not editable here. */
  locked: boolean;
  headCount: number | null;
  expense: Expense | null;
}

export interface LedgerInputs {
  expenses: Expense[];
  accounts: Account[];
  movements: Movement[];
  manejoSessions: ManejoSession[];
  animals: Animal[];
  lots: Lot[];
  /** Every grupo of the plano, archived ones included: they name the rows. */
  planGroups: readonly PlanGroup[];
}

/** Order of the kinds on the same day. */
const KIND_ORDER: Record<LedgerKind, number> = {
  revenue: 0,
  sale: 1,
  expense: 2,
  investment: 3,
  financing: 4,
  partners: 5,
  yield: 6,
  purchase: 7,
};

/** Vencimento: the due date, or the date when none was typed. */
export function effectiveDueDate(e: Expense): string {
  return e.dueDate ?? e.date;
}

/** Settled or pending by direction; a pending one past its vencimento is overdue either way. */
function entryStatus(e: Expense, todayIso: string): LedgerStatus {
  const inflow = isInflow(e);
  if (e.paidAt !== undefined) return inflow ? "received" : "paid";
  if (effectiveDueDate(e) < todayIso) return "overdue";
  return inflow ? "receivable" : "payable";
}

/** Most frequent value, the first one seen winning a tie; null when empty. */
function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

/** "manejo · N animais · X @": carcass @ for a venda, live @ for a compra. */
function sessionDocument(session: ManejoSession, done: ManejoSessionAnimal[]): string {
  const heads = `manejo · ${done.length} ${done.length === 1 ? "animal" : "animais"}`;
  let arrobas: number | null = null;
  if (session.kind === "sale") {
    arrobas = saleSummary(session)?.totalCarcassArrobas ?? null;
  } else {
    const weighed = done.filter((a) => a.weightKg !== undefined);
    if (weighed.length > 0) {
      arrobas = weighed.reduce((sum, a) => sum + (a.weightKg ?? 0), 0) / KG_PER_ARROBA;
    }
  }
  return arrobas === null ? heads : `${heads} · ${formatArroba(arrobas)}`;
}

/** Every row of the window (by `date`), newest first, then by kind, then by id. */
export function ledgerRows(input: LedgerInputs, period: Period, todayIso: string): LedgerRow[] {
  // Deleted lotes stay in `lots`, so past rows still name them.
  const lotNames = new Map(input.lots.map((l) => [l.id, l.name]));
  const lotName = (id: string | null) => (id === null ? null : (lotNames.get(id) ?? null));
  const rows: LedgerRow[] = [];

  for (const e of input.expenses) {
    if (!inPeriod(e.date, period)) continue;
    const group = entryGroup(e);
    const lotId = e.lotId ?? null;
    rows.push({
      id: e.id,
      kind: e.kind,
      inflow: isInflow(e),
      date: e.date,
      dueDate: effectiveDueDate(e),
      paidAt: e.paidAt ?? null,
      status: entryStatus(e, todayIso),
      // A rendimento sits in no grupo of the plano.
      group: group ?? "capital",
      groupLabel: group === null ? ENTRY_KIND_LABEL.yield : groupLabel(group, input.planGroups),
      account: accountName(e.accountId, input.accounts),
      bankAccountId: e.bankAccountId ?? null,
      history: e.history ?? null,
      counterparty: e.counterparty ?? null,
      document: e.document ?? null,
      lotId,
      lotName: lotName(lotId),
      amountBrl: e.amountBrl,
      notes: e.notes ?? null,
      locked: false,
      headCount: null,
      expense: e,
    });
  }

  const sessions = new Map(input.manejoSessions.map((s) => [s.id, s]));
  const lotByEarTag = new Map(input.animals.map((a) => [a.earTag, a.lotId]));
  for (const m of input.movements) {
    if (m.type === "transfer" || m.amountBrl === undefined || !inPeriod(m.date, period)) continue;
    const sale = m.type === "sale";
    // Derived movements carry their session's id; legacy rows have no session.
    const session = sessions.get(m.id);
    const done = session?.animals.filter((a) => a.outcome === "done") ?? [];
    const lotId = session
      ? mostCommon(
          done
            .map((a) => lotByEarTag.get(a.earTag))
            .filter((id): id is string => id !== undefined)
        )
      : null;
    rows.push({
      id: m.id,
      kind: sale ? "sale" : "purchase",
      inflow: sale,
      date: m.date,
      dueDate: m.date,
      paidAt: m.date,
      status: sale ? "received" : "paid",
      // A compra de gado is an investimento the manejos write: no conta of the plano.
      group: sale ? "revenue" : "capital",
      groupLabel: sale ? GROUP_KIND_LABEL.revenue : GROUP_KIND_LABEL.investment,
      account: sale ? "Venda de gado" : "Compra de gado",
      bankAccountId: m.bankAccountId ?? null,
      history: null,
      counterparty: session
        ? session.counterparty?.trim() || null
        : sale
          ? m.destination
          : m.origin,
      document: session ? sessionDocument(session, done) : null,
      lotId,
      lotName: lotName(lotId),
      amountBrl: m.amountBrl,
      notes: m.notes ?? null,
      locked: true,
      headCount: session ? done.length : (m.quantity ?? null),
      expense: null,
    });
  }

  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface CashSummary {
  received: number;
  receivable: number;
  receivableCount: number;
  paid: number;
  payable: number;
  payableCount: number;
  overdueCount: number;
  balance: number;
}

/**
 * Caixa do período: received and paid by payment day inside the window (priced
 * vendas and compras de gado by their date); a receber / a pagar are the
 * pending lançamentos of any date. Every kind counts by its
 * direction: a liberação or an aporte is received, a parcela or a retirada
 * paid, a rendimento received. Compras count as pago here, though they stay
 * capital (outside the COE) in the rows.
 */
export function cashSummary(
  input: Pick<LedgerInputs, "expenses" | "movements">,
  period: Period,
  todayIso: string
): CashSummary {
  const s: CashSummary = {
    received: 0,
    receivable: 0,
    receivableCount: 0,
    paid: 0,
    payable: 0,
    payableCount: 0,
    overdueCount: 0,
    balance: 0,
  };
  for (const e of input.expenses) {
    const inflow = isInflow(e);
    if (e.paidAt === undefined) {
      if (inflow) {
        s.receivable += e.amountBrl;
        s.receivableCount += 1;
      } else {
        s.payable += e.amountBrl;
        s.payableCount += 1;
      }
      // Vencidas are outflows only; a late entrada shows "venceu dd/mm" in A receber.
      if (!inflow && effectiveDueDate(e) < todayIso) s.overdueCount += 1;
    } else if (inPeriod(e.paidAt, period)) {
      if (inflow) s.received += e.amountBrl;
      else s.paid += e.amountBrl;
    }
  }
  for (const m of input.movements) {
    if (m.amountBrl === undefined || !inPeriod(m.date, period)) continue;
    if (m.type === "sale") s.received += m.amountBrl;
    else if (m.type === "purchase") s.paid += m.amountBrl;
  }
  s.balance = s.received - s.paid;
  return s;
}

/** Pending lançamentos of every kind by direction, oldest vencimento first, then by date. */
export function pendingBills(
  expenses: Expense[],
  todayIso: string // eslint-disable-line @typescript-eslint/no-unused-vars -- contract signature; the caller colours overdue with it
): { payables: Expense[]; receivables: Expense[] } {
  const pending = expenses
    .filter((e) => e.paidAt === undefined)
    .sort(
      (a, b) =>
        effectiveDueDate(a).localeCompare(effectiveDueDate(b)) || a.date.localeCompare(b.date)
    );
  return {
    payables: pending.filter((e) => !isInflow(e)),
    receivables: pending.filter((e) => isInflow(e)),
  };
}
