/**
 * Lançamentos by the plano de contas: the tree of nós with their figures for
 * the window, the rows of the picked nó with contra partida and running saldo,
 * its strip of four figures, what "Novo" starts with, and the Painel's
 * "Capital, dívidas e sócios". Pure.
 *
 * A conta bancária reads its movimentação by payment day (`accountMovements`);
 * every other nó reads the ledger rows by `date` (competência) in the window.
 */
import type {
  Account,
  AccountGroup,
  BankAccount,
  BankAccountKind,
  CapitalGroup,
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  Transfer,
} from "@/lib/types";
import { accountsByGroup } from "@/lib/domain/accounts";
import {
  BANK_ACCOUNT_KIND_LABEL,
  accountBalance,
  accountMovements,
  bankTotal,
  cents,
  faturaOf,
} from "@/lib/domain/bankAccounts";
import { formatDate } from "@/lib/domain/dates";
import { coe, periodRevenue } from "@/lib/domain/economics";
import { isInflow } from "@/lib/domain/entries";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { TOP_GROUP_LABEL, despesaGroups, groupLabel, isBuiltinCategory, isDespesaGroup } from "@/lib/domain/groups";
import {
  effectiveDueDate,
  ledgerRows,
  type LedgerInputs,
  type LedgerKind,
  type LedgerRow,
  type LedgerStatus,
} from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import { installmentLabel } from "@/lib/domain/series";

/** A row of the tree. `group: "expenses"` is the whole COE. */
export type PlanNode =
  | { type: "all" }
  | { type: "banks" }
  | { type: "bank"; id: string }
  | { type: "group"; group: CapitalGroup | "expenses" | "revenue" | ExpenseCategory }
  | { type: "account"; id: string }
  | { type: "auto"; which: "purchases" | "sales" };

export interface PlanInputs extends LedgerInputs {
  bankAccounts: BankAccount[];
  transfers: Transfer[];
}

export interface TreeItem {
  node: PlanNode;
  /** nodeParam(node). */
  key: string;
  label: string;
  /** What the figure is, on the six top groups: "saldo", "no período", "devedor", "retirado", "custo (COE)". */
  tag?: string;
  /** 0 shows "—". */
  amountBrl: number;
  bankKind?: BankAccountKind;
  /** Written by the manejos (Compra de gado, Venda de gado). */
  locked?: boolean;
  archived?: boolean;
  /** Present (maybe empty) on what can open. */
  children?: TreeItem[];
}

export interface PaneRow {
  /** Ledger row id, or the transferência id (`<id>:<conta bancária>` per side in Bancos e caixa). */
  id: string;
  /** Payment day on a conta bancária; competência everywhere else. */
  date: string;
  /** Who or what: counterparty, else notes, else the conta or grupo name. */
  history: string;
  /** Observação, documento (a manejo's "manejo · 24 animais · 512 @") and parcela, each only when it is not the history. */
  detail: string | null;
  /** Contra partida. */
  contra: string | null;
  contraGroup: string | null;
  /** Signed: + entra, − sai. */
  amountBrl: number;
  /** Saldo after the line (conta bancária) or saldo devedor after it (financiamento, paid lines); else null. */
  balance: number | null;
  /** Null for a transferência. */
  ledger: LedgerRow | null;
  transfer: Transfer | null;
}

export type FigureTone = "ink" | "healthy" | "attention" | "overdue" | "scheduled";

export interface Figure {
  label: string;
  /** BRL unless `text` is set. */
  amountBrl: number | null;
  text?: string;
  sub: string;
  tone: FigureTone;
}

export interface NodeSummary {
  /** "Bancos e caixa", "Despesas › Nutrição"; null on a top group and on "todos". */
  crumb: string | null;
  title: string;
  /** "conta corrente", "principal", "investimento", "fora do custo (COE)"… */
  pills: { text: string; tone: "muted" | "brand" | "scheduled" | "fmd" }[];
  /** Always four. */
  figures: Figure[];
  /** A financiamento: 0–1 of what was owed that is paid; else undefined. */
  paidShare?: number;
  /** The conta bancária of a bank nó. */
  bank?: BankAccount;
  /** The conta do plano of an account nó. */
  account?: Account;
}

/** What "Novo" starts with on a nó. */
export interface EntryInitial {
  kind?: EntryKind;
  flow?: EntryFlow;
  category?: ExpenseCategory;
  accountId?: string;
  bankAccountId?: string;
}

/** The Painel's "Capital, dívidas e sócios". */
export interface CapitalSummary {
  invested: number;
  investedAssets: number;
  investedCattle: number;
  applications: number;
  yieldInPeriod: number;
  debt: number;
  debtAccounts: number;
  nextInstallment: { dueDate: string; amountBrl: number } | null;
  withdrawn: number;
}

/** The groups that are not a grupo of Despesas. */
type TopGroup = CapitalGroup | "expenses" | "revenue";

const GROUP_PARAM: Record<TopGroup, string> = {
  investment: "investimentos",
  financing: "financiamentos",
  partners: "socios",
  expenses: "despesas",
  revenue: "receitas",
};

/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<key> (a built-in grupo or the id of a farm's) · conta:<id> ·
 *  compra-de-gado · venda-de-gado. */
export function nodeParam(node: PlanNode): string {
  switch (node.type) {
    case "all":
      return "todos";
    case "banks":
      return "bancos";
    case "bank":
      return `banco:${node.id}`;
    case "account":
      return `conta:${node.id}`;
    case "auto":
      return node.which === "purchases" ? "compra-de-gado" : "venda-de-gado";
    case "group":
      return isDespesaGroup(node.group) ? `grupo:${node.group}` : GROUP_PARAM[node.group as TopGroup];
  }
}

/**
 * The nó of a `conta` value; null when absent, unknown or malformed. Any grupo
 * de despesa key reads: one that names no grupo opens as "Grupo removido".
 */
export function parseNode(param: string | null | undefined): PlanNode | null {
  if (!param) return null;
  if (param === "todos") return { type: "all" };
  if (param === "bancos") return { type: "banks" };
  if (param === "compra-de-gado") return { type: "auto", which: "purchases" };
  if (param === "venda-de-gado") return { type: "auto", which: "sales" };
  const group = (Object.keys(GROUP_PARAM) as TopGroup[]).find((g) => GROUP_PARAM[g] === param);
  if (group) return { type: "group", group };
  const match = /^(banco|conta|grupo):(.+)$/.exec(param);
  if (!match) return null;
  const [, prefix, value] = match;
  if (prefix === "banco") return { type: "bank", id: value };
  if (prefix === "conta") return { type: "account", id: value };
  return isDespesaGroup(value) ? { type: "group", group: value } : null;
}

/** The old Extrato's `tipo` values. */
const LEGACY_KIND = new Map<string, PlanNode>([
  ["expense", { type: "group", group: "expenses" }],
  ["revenue", { type: "group", group: "revenue" }],
  ["sale", { type: "auto", which: "sales" }],
  ["purchase", { type: "auto", which: "purchases" }],
  ["treatment", { type: "group", group: "health" }],
]);

/** The old Extrato filters (?tipo, ?grupo, ?conta=<account id>) as a nó; null when none was set. */
export function legacyNode(params: {
  tipo?: string | null;
  grupo?: string | null;
  conta?: string | null;
}): PlanNode | null {
  const { tipo, grupo, conta } = params;
  if (conta) return { type: "account", id: conta };
  if (grupo === "revenue") return { type: "group", group: "revenue" };
  if (grupo === "capital") return { type: "auto", which: "purchases" };
  // The old Extrato only knew the seven built-in grupos.
  if (grupo && isBuiltinCategory(grupo)) return { type: "group", group: grupo };
  return LEGACY_KIND.get(tipo ?? "") ?? null;
}

/** The paid lines that move a financiamento's saldo devedor, in payment order. */
function debtMoves(account: Account, expenses: Expense[]): (Expense & { paidAt: string })[] {
  return expenses
    .filter(
      (e): e is Expense & { paidAt: string } =>
        e.accountId === account.id &&
        e.paidAt !== undefined &&
        // On or before the opening date it is already inside the saldo inicial.
        !(account.openingDate !== undefined && e.paidAt <= account.openingDate)
    )
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id));
}

interface DebtParts {
  /** Saldo inicial + liberações. */
  owed: number;
  paid: number;
  releases: Expense[];
  payments: Expense[];
}

/** What a financiamento owed and paid by the end of `day`. */
function debtParts(account: Account, expenses: Expense[], day: string): DebtParts {
  const moves = debtMoves(account, expenses).filter((e) => e.paidAt <= day);
  const releases = moves.filter(isInflow);
  const payments = moves.filter((e) => !isInflow(e));
  const total = (list: Expense[]) => list.reduce((sum, e) => sum + e.amountBrl, 0);
  return { owed: (account.openingBalanceBrl ?? 0) + total(releases), paid: total(payments), releases, payments };
}

/** Saldo devedor of a conta de financiamento at the end of `day`. Pending lines never count. */
export function debtBalance(account: Account, expenses: Expense[], day: string): number {
  const { owed, paid } = debtParts(account, expenses, day);
  return cents(owed - paid);
}

const BANKS = "Bancos e caixa";
const EXPENSES = "Despesas";
const PURCHASES = "Compra de gado";
const SALES = "Venda de gado";

/** + entra, − sai. */
const signed = (r: LedgerRow): number => (r.inflow ? r.amountBrl : -r.amountBrl);

/** Σ of `value` over `items`, to the centavo. */
function sum<T>(items: T[], value: (item: T) => number): number {
  return cents(items.reduce((total, item) => total + value(item), 0));
}

/** Saídas − entradas of the rows `pick` takes: what was invested, retirado or spent. */
const spent = (rows: LedgerRow[], pick: (r: LedgerRow) => boolean = () => true): number =>
  sum(rows.filter(pick), (r) => -signed(r));

/** Entradas − saídas of the rows `pick` takes. */
const earned = (rows: LedgerRow[], pick: (r: LedgerRow) => boolean): number => sum(rows.filter(pick), signed);

/** Picks the rows of these kinds. */
const isKind = (...kinds: LedgerKind[]) => (r: LedgerRow): boolean => kinds.includes(r.kind);

/** A row of the COE: a despesa or a treatment. */
const inCoe = isKind("expense", "treatment");

/** As Contas bancárias lists them: the conta principal first, cartões last. */
const byBankOrder = (a: BankAccount, b: BankAccount): number =>
  Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card");

/** The financiamentos whose saldo devedor counts in the group's. */
const liveFinancing = (accounts: Account[]): Account[] =>
  accounts.filter((a) => a.group === "financing" && a.archivedAt === undefined);

/** A row of the tree, keyed by its URL value. */
const item = (node: PlanNode, label: string, amountBrl: number, extra: Partial<TreeItem> = {}): TreeItem => ({
  node,
  key: nodeParam(node),
  label,
  amountBrl,
  ...extra,
});

/** The six top groups in order: banks, investment, financing, partners, expenses, revenue. */
export function planTree(inputs: PlanInputs, period: Period, todayIso: string): TreeItem[] {
  const rows = ledgerRows(inputs, period, todayIso);
  const withLines = new Set(rows.map((r) => r.expense?.accountId));
  const byGroup = accountsByGroup(inputs.accounts, true);
  const of = (id: string) => (r: LedgerRow) => r.expense?.accountId === id;
  /** The grupo's contas by name; an archived one only while it has a line in the window. */
  const contas = (group: AccountGroup, amount: (a: Account) => number): TreeItem[] =>
    (byGroup[group] ?? [])
      .filter((a) => a.archivedAt === undefined || withLines.has(a.id))
      .map((a) => item({ type: "account", id: a.id }, a.name, amount(a), { archived: a.archivedAt !== undefined }));
  const debt = (a: Account) => debtBalance(a, inputs.expenses, todayIso);
  const live = liveFinancing(inputs.accounts);
  const banks = [...inputs.bankAccounts]
    .sort(byBankOrder)
    .filter((b) => b.archivedAt === undefined || accountMovements(b, inputs, period).length > 0);
  // The grupos de despesa: an archived farm grupo only while it has a line in the window, like an
  // archived conta; a key that names no grupo (a removed one) while its lines are there, as "Grupo removido".
  const coeGroups = new Set(rows.filter(inCoe).map((r) => r.group));
  const grupos = despesaGroups(inputs.expenseGroups, { archived: true }).filter(
    (g) => !g.archived || coeGroups.has(g.key)
  );
  for (const key of coeGroups) {
    if (!grupos.some((g) => g.key === key)) {
      grupos.push({ key, label: groupLabel(key, inputs.expenseGroups), custom: true, archived: false });
    }
  }

  return [
    item({ type: "banks" }, BANKS, bankTotal(inputs.bankAccounts, inputs, todayIso), {
      tag: "saldo",
      children: banks.map((b) =>
        item({ type: "bank", id: b.id }, b.name, accountBalance(b, inputs, todayIso), {
          bankKind: b.kind,
          archived: b.archivedAt !== undefined,
        })
      ),
    }),
    item(
      { type: "group", group: "investment" },
      TOP_GROUP_LABEL.investment,
      spent(rows, isKind("investment", "purchase")),
      {
        tag: "no período",
        children: [
          ...contas("investment", (a) => spent(rows, of(a.id))),
          item({ type: "auto", which: "purchases" }, PURCHASES, spent(rows, isKind("purchase")), { locked: true }),
        ],
      }
    ),
    item({ type: "group", group: "financing" }, TOP_GROUP_LABEL.financing, sum(live, debt), {
      tag: "devedor",
      children: contas("financing", debt),
    }),
    item({ type: "group", group: "partners" }, TOP_GROUP_LABEL.partners, spent(rows, isKind("partners")), {
      tag: "retirado",
      children: contas("partners", (a) => spent(rows, of(a.id))),
    }),
    item({ type: "group", group: "expenses" }, EXPENSES, cents(coe(inputs.expenses, inputs.treatments, period)), {
      tag: "custo (COE)",
      children: grupos.map((g) =>
        item({ type: "group", group: g.key }, g.label, spent(rows, (r) => inCoe(r) && r.group === g.key), {
          archived: g.archived,
          children: contas(g.key, (a) => spent(rows, of(a.id))),
        })
      ),
    }),
    item(
      { type: "group", group: "revenue" },
      TOP_GROUP_LABEL.revenue,
      cents(periodRevenue(inputs.expenses, inputs.movements, period).total),
      {
        tag: "no período",
        children: [
          item({ type: "auto", which: "sales" }, SALES, earned(rows, isKind("sale")), { locked: true }),
          ...contas("revenue", (a) => earned(rows, of(a.id))),
        ],
      }
    ),
  ];
}

/** Every day there is: a conta bancária looks its lançamentos up whatever their competência. */
const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

/** Ledger kinds of each group that is not a grupo of Despesas. */
const GROUP_KINDS: Record<TopGroup, readonly LedgerKind[]> = {
  investment: ["investment", "purchase"],
  financing: ["financing"],
  partners: ["partners"],
  expenses: ["expense", "treatment"],
  revenue: ["revenue", "sale"],
};

function belongs(node: Exclude<PlanNode, { type: "bank" | "banks" }>, r: LedgerRow): boolean {
  switch (node.type) {
    case "all":
      return true;
    case "account":
      return r.expense?.accountId === node.id;
    case "auto":
      return r.kind === (node.which === "purchases" ? "purchase" : "sale");
    case "group":
      return isDespesaGroup(node.group)
        ? inCoe(r) && r.group === node.group
        : GROUP_KINDS[node.group as TopGroup].includes(r.kind);
  }
}

/** "Agro Máquinas Uberaba · NF 2.871 · parcela 2/10": pago para, observação, documento and parcela, without what the history already says. */
function detailOf(r: LedgerRow, history: string): string | null {
  const parcela = r.expense ? installmentLabel(r.expense) : null;
  return (
    [r.counterparty, r.notes, r.document, parcela && `parcela ${parcela}`]
      .filter((t) => t && t !== history)
      .join(" · ") || null
  );
}

const bankName = (banks: BankAccount[], id: string | null): string | null =>
  banks.find((b) => b.id === id)?.name ?? null;

/** A ledger row as every nó but a conta bancária shows it: the contra partida is the conta bancária. */
function ledgerLine(r: LedgerRow, banks: BankAccount[]): PaneRow {
  const contra = bankName(banks, r.bankAccountId);
  // Rows typed before the Histórico existed fall back to who, then what.
  const history = r.history ?? r.counterparty ?? r.notes ?? r.account ?? r.groupLabel;
  return {
    id: r.id,
    date: r.date,
    history,
    detail: detailOf(r, history),
    contra,
    contraGroup: contra === null ? null : BANKS,
    amountBrl: signed(r),
    balance: null,
    ledger: r,
    transfer: null,
  };
}

/** One side of a transferência: the contra partida is the other conta. */
function transferLine(t: Transfer, side: string, banks: BankAccount[], balance: number | null, id = t.id): PaneRow {
  const incoming = t.toId === side;
  const other = bankName(banks, incoming ? t.fromId : t.toId) ?? "outra conta";
  return {
    id,
    date: t.date,
    history: t.notes ?? `Transferência ${incoming ? "de" : "para"} ${other}`,
    detail: null,
    contra: other,
    contraGroup: "transferência",
    amountBrl: incoming ? t.amountBrl : -t.amountBrl,
    balance,
    ledger: null,
    transfer: t,
  };
}

/** Newest first. */
export function nodeRows(node: PlanNode, inputs: PlanInputs, period: Period, todayIso: string): PaneRow[] {
  const banks = inputs.bankAccounts;
  if (node.type === "banks") {
    // The movimentação of every conta by payment day, as each conta's own nó shows it: both sides of a
    // transferência, keyed as the conciliação keys them. The contra partida is the conta the line sits in.
    const byId = new Map(ledgerRows(inputs, ALL_TIME, todayIso).map((r) => [r.id, r]));
    return banks
      .flatMap((bank) =>
        accountMovements(bank, inputs, period).map((move) =>
          move.transfer
            ? transferLine(move.transfer, bank.id, banks, null, `${move.transfer.id}:${bank.id}`)
            : { ...ledgerLine(byId.get(move.id)!, banks), date: move.date, amountBrl: move.amountBrl }
        )
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  if (node.type === "bank") {
    const bank = banks.find((b) => b.id === node.id);
    if (!bank) return [];
    const byId = new Map(ledgerRows(inputs, ALL_TIME, todayIso).map((r) => [r.id, r]));
    return accountMovements(bank, inputs, period).map((move) => {
      if (move.transfer) return transferLine(move.transfer, bank.id, banks, move.balance);
      const r = byId.get(move.id)!;
      // A despesa or a treatment sits in a grupo de despesa.
      const group = inCoe(r) ? `${EXPENSES} › ${r.groupLabel}` : r.groupLabel;
      return {
        ...ledgerLine(r, banks),
        date: move.date,
        contra: r.account ?? group,
        contraGroup: r.account === null ? null : group,
        amountBrl: move.amountBrl,
        balance: move.balance,
      };
    });
  }

  const rows = ledgerRows(inputs, period, todayIso)
    .filter((r) => belongs(node, r))
    .map((r) => ledgerLine(r, banks));
  const financing =
    node.type === "account" ? inputs.accounts.find((a) => a.id === node.id && a.group === "financing") : undefined;
  if (financing) {
    // The saldo devedor after each line that moved it; a pending line or one inside the saldo inicial has none.
    let balance = financing.openingBalanceBrl ?? 0;
    const after = new Map<string, number>();
    for (const e of debtMoves(financing, inputs.expenses)) {
      balance = cents(balance + (isInflow(e) ? e.amountBrl : -e.amountBrl));
      after.set(e.id, balance);
    }
    for (const row of rows) row.balance = after.get(row.id) ?? null;
  }
  const due = (r: PaneRow) => r.ledger?.dueDate ?? r.date;
  // Parcelas share their competência: the latest vencimento first.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || due(b).localeCompare(due(a)));
}

const PENDING: readonly LedgerStatus[] = ["payable", "receivable", "overdue"];

/** Lower case without accents, so "socios" finds "Sócios": the searches of Lançamentos. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Lote ("farm" = without lote; a transferência passes only "all"), pending only, and search. */
export function filterPaneRows(
  rows: PaneRow[],
  filter: { lotId: string | "farm" | "all"; pendingOnly: boolean; search: string }
): PaneRow[] {
  const term = fold(filter.search.trim());
  return rows.filter(
    (r) =>
      (filter.lotId === "all" ||
        (r.ledger !== null && r.ledger.lotId === (filter.lotId === "farm" ? null : filter.lotId))) &&
      (!filter.pendingOnly || (r.ledger !== null && PENDING.includes(r.ledger.status))) &&
      (term === "" ||
        [r.history, r.detail, r.contra, r.contraGroup].some((text) => text !== null && fold(text).includes(term)))
  );
}

type Pill = NodeSummary["pills"][number];

/** Which strip a nó shows. */
type Strip = "all" | "banks" | "expense" | "revenue" | CapitalGroup;

const PILLS: Record<Strip, Pill[]> = {
  all: [],
  banks: [],
  expense: [{ text: "custo (COE)", tone: "muted" }],
  revenue: [{ text: "receita", tone: "muted" }],
  investment: [{ text: "investimento", tone: "scheduled" }, { text: "fora do custo (COE)", tone: "muted" }],
  financing: [{ text: "financiamento", tone: "fmd" }, { text: "fora do resultado", tone: "muted" }],
  partners: [{ text: "sócios", tone: "muted" }, { text: "fora do resultado", tone: "muted" }],
};
const ARCHIVED: Pill = { text: "arquivada", tone: "muted" };

/** What is in the resultado; the rest of "todos" is "Fora do resultado". */
const RESULT_KINDS: readonly LedgerKind[] = [...GROUP_KINDS.expenses, ...GROUP_KINDS.revenue];

const count = (n: number, one: string, many: string): string => `${formatNumber(n)} ${n === 1 ? one : many}`;
const dayMonth = (iso: string): string => formatDate(iso).slice(0, 5);
/** A figure in BRL, or in words when `value` is text. */
const fig = (label: string, value: number | string, sub: string, tone: FigureTone = "ink"): Figure =>
  typeof value === "string"
    ? { label, amountBrl: null, text: value, sub, tone }
    : { label, amountBrl: value, sub, tone };
const share = (part: number, whole: number): string =>
  whole > 0 ? `${formatNumber((part / whole) * 100)} %` : "—";
const amount = (rows: LedgerRow[]): number => sum(rows, (r) => r.amountBrl);
const settled = (rows: LedgerRow[]): LedgerRow[] => rows.filter((r) => r.paidAt !== null);
const pending = (rows: LedgerRow[]): LedgerRow[] => rows.filter((r) => r.paidAt === null);

/** "A pagar" / "A receber": the pending rows, how many and the next vencimento. */
function dueFigure(label: string, rows: LedgerRow[], none: string, tone: FigureTone): Figure {
  if (rows.length === 0) return fig(label, 0, none);
  const next = rows.map((r) => r.dueDate).sort()[0];
  const sub = `${count(rows.length, "lançamento", "lançamentos")} · próxima ${dayMonth(next)}`;
  return fig(label, amount(rows), sub, tone);
}

/** Pending saídas of the lançamentos `pick` takes, earliest vencimento first. */
const toPay = (expenses: Expense[], pick: (e: Expense) => boolean): Expense[] =>
  expenses
    .filter((e) => pick(e) && e.paidAt === undefined && !isInflow(e))
    .sort((a, b) => effectiveDueDate(a).localeCompare(effectiveDueDate(b)));

/** Where a nó sits and which strip it shows. */
function placeOf(
  node: PlanNode,
  account: Account | undefined,
  groups: readonly ExpenseGroup[]
): { strip: Strip; crumb: string | null; title: string } {
  if (account) {
    const g = account.group;
    return isDespesaGroup(g)
      ? { strip: "expense", crumb: `${EXPENSES} › ${groupLabel(g, groups)}`, title: account.name }
      : { strip: g as Strip, crumb: groupLabel(g, groups), title: account.name };
  }
  if (node.type === "banks") return { strip: "banks", crumb: null, title: BANKS };
  if (node.type === "auto") {
    return node.which === "purchases"
      ? { strip: "investment", crumb: TOP_GROUP_LABEL.investment, title: PURCHASES }
      : { strip: "revenue", crumb: TOP_GROUP_LABEL.revenue, title: SALES };
  }
  if (node.type === "group") {
    if (node.group === "expenses") return { strip: "expense", crumb: null, title: EXPENSES };
    const title = groupLabel(node.group, groups);
    if (isDespesaGroup(node.group)) return { strip: "expense", crumb: EXPENSES, title };
    return { strip: node.group as Strip, crumb: null, title };
  }
  return { strip: "all", crumb: null, title: "Todos os lançamentos" };
}

/** The fourth figure of a conta bancária: what its kind needs to show. */
function bankFourth(bank: BankAccount, rows: PaneRow[], balance: number, todayIso: string): Figure {
  switch (bank.kind) {
    case "card": {
      // What is owed today, as a positive figure.
      const owed = Math.max(0, -balance);
      const due = formatDate(faturaOf(bank, todayIso).due);
      return fig("Fatura aberta", owed, `vence ${due}`, owed > 0 ? "attention" : "ink");
    }
    case "investment": {
      const yields = rows.filter((r) => r.ledger?.kind === "yield");
      const sub = count(yields.length, "rendimento", "rendimentos");
      return fig("Rendimento no período", sum(yields, (r) => r.amountBrl), sub, "healthy");
    }
    case "cash":
      return fig("Lançamentos", formatNumber(rows.length), "no período");
    case "checking":
      return fig(
        "Conciliação",
        bank.reconciledUntil ? `até ${dayMonth(bank.reconciledUntil)}` : "—",
        bank.pendingLines > 0
          ? `${count(bank.pendingLines, "linha", "linhas")} do banco a conciliar`
          : bank.lastImportId
            ? "tudo conciliado"
            : "nenhum extrato importado",
        bank.pendingLines > 0 ? "attention" : "ink"
      );
  }
}

function bankSummary(bank: BankAccount, inputs: PlanInputs, period: Period, todayIso: string): NodeSummary {
  const rows = nodeRows({ type: "bank", id: bank.id }, inputs, period, todayIso);
  const ins = rows.filter((r) => r.amountBrl > 0);
  const outs = rows.filter((r) => r.amountBrl < 0);
  const balance = accountBalance(bank, inputs, todayIso);
  const pills: Pill[] = [{ text: BANK_ACCOUNT_KIND_LABEL[bank.kind].toLowerCase(), tone: "muted" }];
  if (bank.isMain) pills.push({ text: "principal", tone: "brand" });
  if (bank.archivedAt !== undefined) pills.push(ARCHIVED);
  return {
    crumb: BANKS,
    title: bank.name,
    pills,
    figures: [
      fig("Saldo hoje", balance, `em ${formatDate(todayIso)}`),
      fig(
        "Entradas no período",
        sum(ins, (r) => r.amountBrl),
        count(ins.length, "recebimento", "recebimentos"),
        "healthy"
      ),
      fig("Saídas no período", sum(outs, (r) => -r.amountBrl), count(outs.length, "pagamento", "pagamentos")),
      bankFourth(bank, rows, balance, todayIso),
    ],
    bank,
  };
}

/** null when the nó points at something that no longer exists. */
export function nodeSummary(node: PlanNode, inputs: PlanInputs, period: Period, todayIso: string): NodeSummary | null {
  if (node.type === "bank") {
    const bank = inputs.bankAccounts.find((b) => b.id === node.id);
    return bank ? bankSummary(bank, inputs, period, todayIso) : null;
  }
  const account = node.type === "account" ? inputs.accounts.find((a) => a.id === node.id) : undefined;
  if (node.type === "account" && account === undefined) return null;

  const { strip, crumb, title } = placeOf(node, account, inputs.expenseGroups);
  const lines = nodeRows(node, inputs, period, todayIso).flatMap((r) => (r.ledger ? [r.ledger] : []));
  const ins = lines.filter((r) => r.inflow);
  const outs = lines.filter((r) => !r.inflow);
  const pills = [...PILLS[strip], ...(account?.archivedAt !== undefined ? [ARCHIVED] : [])];
  const summary = (figures: Figure[], paidShare?: number): NodeSummary => ({
    crumb,
    title,
    pills,
    figures,
    ...(paidShare !== undefined && { paidShare }),
    ...(account && { account }),
  });

  switch (strip) {
    case "all": {
      const revenue = cents(periodRevenue(inputs.expenses, inputs.movements, period).total);
      const cost = cents(coe(inputs.expenses, inputs.treatments, period));
      const result = cents(revenue - cost);
      return summary([
        fig("Receitas", revenue, "vendas e outras receitas", "healthy"),
        fig("Despesas (COE)", cost, "despesas e tratamentos"),
        fig("Resultado", result, "receitas − custo", result < 0 ? "overdue" : "healthy"),
        fig(
          "Fora do resultado",
          earned(lines, (r) => !RESULT_KINDS.includes(r.kind)),
          "capital, dívidas e sócios · entradas − saídas"
        ),
      ]);
    }
    case "banks": {
      const cards = inputs.bankAccounts.filter((b) => b.kind === "card" && b.archivedAt === undefined);
      const owed = sum(cards, (c) => Math.max(0, -accountBalance(c, inputs, todayIso)));
      const card = new Set(inputs.bankAccounts.filter((b) => b.kind === "card").map((b) => b.id));
      // What crossed the edge of the saldo em contas: a cartão's own lines and the transferências
      // between two contas stay out; paying a fatura is a saída.
      const crossed = nodeRows(node, inputs, period, todayIso).filter((r) => {
        if (!r.transfer) return !card.has(r.ledger?.bankAccountId ?? "");
        const [side, other] = r.amountBrl < 0 ? [r.transfer.fromId, r.transfer.toId] : [r.transfer.toId, r.transfer.fromId];
        return !card.has(side) && card.has(other);
      });
      const entered = crossed.filter((r) => r.amountBrl > 0);
      const left = crossed.filter((r) => r.amountBrl < 0);
      return summary([
        fig("Saldo em contas", bankTotal(inputs.bankAccounts, inputs, todayIso), "hoje · sem os cartões"),
        fig(
          "Entradas no período",
          sum(entered, (r) => r.amountBrl),
          count(entered.length, "recebimento", "recebimentos"),
          "healthy"
        ),
        fig("Saídas no período", sum(left, (r) => -r.amountBrl), count(left.length, "pagamento", "pagamentos")),
        fig("Cartões", owed, "a pagar · fora do saldo", owed > 0 ? "attention" : "ink"),
      ]);
    }
    case "expense": {
      const cost = cents(coe(inputs.expenses, inputs.treatments, period));
      return summary([
        fig("No período", amount(lines), count(lines.length, "lançamento", "lançamentos")),
        fig("Pago", amount(settled(lines)), "saiu do caixa"),
        dueFigure("A pagar", pending(lines), "nada a pagar", "attention"),
        fig("% do COE", share(amount(lines), cost), `de ${formatCurrency(cost)}`),
      ]);
    }
    case "revenue": {
      const revenue = cents(periodRevenue(inputs.expenses, inputs.movements, period).total);
      return summary([
        fig("No período", amount(lines), count(lines.length, "lançamento", "lançamentos")),
        fig("Recebido", amount(settled(lines)), "entrou no caixa", "healthy"),
        dueFigure("A receber", pending(lines), "nada a receber", "scheduled"),
        fig("% da receita", share(amount(lines), revenue), `de ${formatCurrency(revenue)}`),
      ]);
    }
    case "investment": {
      const sinceStart = nodeRows(node, inputs, ALL_TIME, todayIso).flatMap((r) => (r.ledger ? [r.ledger] : []));
      return summary([
        fig("Investido no período", spent(lines), `${count(outs.length, "compra", "compras")} · pela data da compra`),
        fig("Pago", amount(settled(outs)), "saiu do caixa"),
        dueFigure("A pagar", pending(outs), "nada a pagar", "attention"),
        fig(
          "Desde o início",
          spent(sinceStart),
          node.type === "group" ? "tudo o que entrou no grupo" : "tudo o que entrou nesta conta"
        ),
      ]);
    }
    case "partners": {
      const out = amount(outs);
      const back = amount(ins);
      return summary([
        fig("Retirado", out, count(outs.length, "retirada", "retiradas")),
        fig("Aportado", back, count(ins.length, "aporte", "aportes"), "healthy"),
        fig("Líquido", cents(out - back), "retirado − aportado"),
        dueFigure("A pagar", pending(outs), "nada a pagar", "attention"),
      ]);
    }
    case "financing": {
      const contas = account ? [account] : liveFinancing(inputs.accounts);
      const ids = new Set(contas.map((a) => a.id));
      const parts = contas.map((a) => debtParts(a, inputs.expenses, todayIso));
      const owed = sum(parts, (p) => p.owed);
      const paid = sum(parts, (p) => p.paid);
      const due = toPay(inputs.expenses, (e) => e.accountId !== undefined && ids.has(e.accountId));
      // What moved the saldo devedor since the saldo inicial, whatever the window: the strip adds up.
      const released = parts.flatMap((p) => p.releases);
      const payments = parts.flatMap((p) => p.payments);
      return summary(
        [
          fig(
            "Saldo devedor",
            cents(owed - paid),
            due.length === 0 ? "nenhuma parcela a pagar" : `${count(due.length, "parcela", "parcelas")} a pagar`
          ),
          fig("Liberado", sum(released, (e) => e.amountBrl), count(released.length, "liberação", "liberações"), "scheduled"),
          fig("Pago", cents(paid), count(payments.length, "parcela", "parcelas")),
          due.length > 0
            ? fig("Próxima parcela", due[0].amountBrl, `vence ${formatDate(effectiveDueDate(due[0]))}`, "attention")
            : fig("Próxima parcela", "—", "nenhuma parcela a pagar"),
        ],
        owed > 0 ? Math.min(1, paid / owed) : 0
      );
    }
  }
}

/** What "Novo" starts with on a nó. Pass `bankAccounts` so an aplicação starts a rendimento. */
export function entryInitialFor(node: PlanNode, accounts: Account[], bankAccounts: BankAccount[] = []): EntryInitial {
  switch (node.type) {
    case "bank":
      return bankAccounts.find((b) => b.id === node.id)?.kind === "investment"
        ? { kind: "yield", bankAccountId: node.id }
        : { bankAccountId: node.id };
    case "group":
      if (node.group === "expenses") return { kind: "expense" };
      if (isDespesaGroup(node.group)) return { kind: "expense", category: node.group };
      return { kind: node.group as "revenue" | CapitalGroup };
    case "account": {
      const account = accounts.find((a) => a.id === node.id);
      if (!account) return {};
      const g = account.group;
      return isDespesaGroup(g)
        ? { kind: "expense", category: g, accountId: account.id }
        : { kind: g as "revenue" | CapitalGroup, accountId: account.id };
    }
    default:
      return {};
  }
}

/** The Painel's "Capital, dívidas e sócios". */
export function capitalSummary(inputs: PlanInputs, period: Period, todayIso: string): CapitalSummary {
  const rows = ledgerRows(inputs, period, todayIso);
  const investedAssets = spent(rows, isKind("investment"));
  const investedCattle = spent(rows, isKind("purchase"));
  const live = liveFinancing(inputs.accounts);
  const liveIds = new Set(live.map((a) => a.id));
  const debts = live.map((a) => debtBalance(a, inputs.expenses, todayIso));
  const next = toPay(inputs.expenses, (e) => e.accountId !== undefined && liveIds.has(e.accountId))[0];
  return {
    invested: cents(investedAssets + investedCattle),
    investedAssets,
    investedCattle,
    applications: sum(
      inputs.bankAccounts.filter((b) => b.kind === "investment" && b.archivedAt === undefined),
      (b) => accountBalance(b, inputs, todayIso)
    ),
    yieldInPeriod: earned(rows, isKind("yield")),
    debt: sum(debts, (d) => d),
    debtAccounts: debts.filter((d) => d !== 0).length,
    nextInstallment: next ? { dueDate: effectiveDueDate(next), amountBrl: next.amountBrl } : null,
    withdrawn: spent(rows, isKind("partners")),
  };
}
