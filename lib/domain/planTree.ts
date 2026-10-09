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
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  GroupKind,
  PlanGroup,
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
import { isCapitalKind, isInflow } from "@/lib/domain/entries";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { GROUP_KINDS, GROUP_KIND_LABEL, groupKind, groupLabel, groupsOf } from "@/lib/domain/groups";
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

/** A row of the tree. A tipo opens into its grupos, a grupo into its contas. */
export type PlanNode =
  | { type: "all" }
  | { type: "banks" }
  | { type: "bank"; id: string }
  /** A tipo: Receitas, Despesas (the whole COE), Investimentos, Financiamentos, Sócios. */
  | { type: "kind"; kind: GroupKind }
  /** A grupo of the plano. */
  | { type: "group"; id: string }
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
  /** What the figure is, on Bancos e caixa and the five tipos: "saldo", "no período", "devedor", "retirado", "custo (COE)". */
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
  /** "Bancos e caixa", "Despesas › Nutrição"; null on a tipo and on "todos". */
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

const KIND_PARAM: Record<GroupKind, string> = {
  investment: "investimentos",
  financing: "financiamentos",
  partners: "socios",
  expense: "despesas",
  revenue: "receitas",
};

/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<id> · conta:<id> · compra-de-gado · venda-de-gado. */
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
    case "kind":
      return KIND_PARAM[node.kind];
    case "group":
      return `grupo:${node.id}`;
  }
}

/**
 * The nó of a `conta` value; null when absent, unknown or malformed. Any grupo
 * id reads: one that names no grupo opens as "Grupo removido".
 */
export function parseNode(param: string | null | undefined): PlanNode | null {
  if (!param) return null;
  if (param === "todos") return { type: "all" };
  if (param === "bancos") return { type: "banks" };
  if (param === "compra-de-gado") return { type: "auto", which: "purchases" };
  if (param === "venda-de-gado") return { type: "auto", which: "sales" };
  const kind = GROUP_KINDS.find((k) => KIND_PARAM[k] === param);
  if (kind) return { type: "kind", kind };
  const match = /^(banco|conta|grupo):(.+)$/.exec(param);
  if (!match) return null;
  const [, prefix, value] = match;
  if (prefix === "banco") return { type: "bank", id: value };
  if (prefix === "conta") return { type: "account", id: value };
  return { type: "group", id: value };
}

/** The old Extrato's `tipo` values. */
const LEGACY_KIND = new Map<string, PlanNode>([
  ["expense", { type: "kind", kind: "expense" }],
  ["revenue", { type: "kind", kind: "revenue" }],
  ["sale", { type: "auto", which: "sales" }],
  ["purchase", { type: "auto", which: "purchases" }],
]);

/**
 * The old Extrato filters (?tipo, ?conta=<account id>) as a nó; null when none
 * was set. Its ?grupo held keys that name no grupo any more: it is ignored.
 */
export function legacyNode(params: {
  tipo?: string | null;
  grupo?: string | null;
  conta?: string | null;
}): PlanNode | null {
  const { tipo, conta } = params;
  if (conta) return { type: "account", id: conta };
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

/** As Contas bancárias lists them: the conta principal first, cartões last. */
const byBankOrder = (a: BankAccount, b: BankAccount): number =>
  Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card");

/** The contas of financiamento whose saldo devedor counts in the tipo's. */
const liveFinancing = (inputs: Pick<PlanInputs, "accounts" | "planGroups">): Account[] =>
  inputs.accounts.filter((a) => a.archivedAt === undefined && groupKind(a.group, inputs.planGroups) === "financing");

/** Ledger kinds of each tipo. */
const LEDGER_KINDS: Record<GroupKind, readonly LedgerKind[]> = {
  investment: ["investment", "purchase"],
  financing: ["financing"],
  partners: ["partners"],
  expense: ["expense"],
  revenue: ["revenue", "sale"],
};

interface ShownGroup {
  id: string;
  label: string;
  archived: boolean;
}

/** The grupos whose live financiamento contas still owe something: an archived one stays listed while they do. */
const owingGroups = (inputs: PlanInputs, todayIso: string): Set<string> =>
  new Set(liveFinancing(inputs).filter((a) => debtBalance(a, inputs.expenses, todayIso) !== 0).map((a) => a.group));

/**
 * The grupos a tipo lists in the window, by name: an archived one only while
 * it has a line in the window, like an archived conta, or while `keep` names
 * it (a financiamento still owed); an id that names no grupo (a removed one)
 * while its lines are there, as "Grupo removido", last.
 */
function shownGroups(
  kind: GroupKind,
  rows: LedgerRow[],
  groups: readonly PlanGroup[],
  keep: ReadonlySet<string> = new Set()
): ShownGroup[] {
  const inWindow = new Set(rows.filter((r) => r.kind === kind).map((r) => r.group));
  const known = groupsOf(groups, kind, { archived: true })
    .filter((g) => g.archivedAt === undefined || inWindow.has(g.id) || keep.has(g.id))
    .map((g) => ({ id: g.id, label: g.name, archived: g.archivedAt !== undefined }));
  const removed = [...inWindow]
    .filter((id) => groupKind(id, groups) === null)
    .map((id) => ({ id, label: groupLabel(id, groups), archived: false }));
  return [...known, ...removed];
}

/** A row of the tree, keyed by its URL value. */
const item = (node: PlanNode, label: string, amountBrl: number, extra: Partial<TreeItem> = {}): TreeItem => ({
  node,
  key: nodeParam(node),
  label,
  amountBrl,
  ...extra,
});

/** Bancos e caixa, then the five tipos in order: investment, financing, partners, expense, revenue. */
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
  const live = liveFinancing(inputs);
  const banks = [...inputs.bankAccounts]
    .sort(byBankOrder)
    .filter((b) => b.archivedAt === undefined || accountMovements(b, inputs, period).length > 0);
  /** A grupo's or a conta's figure, by the tipo's rule: what was spent, earned, or (financiamento) still owed. */
  const figure = (kind: GroupKind, pick: (r: LedgerRow) => boolean, owing: Account[]): number =>
    kind === "financing" ? sum(owing, debt) : kind === "revenue" ? earned(rows, pick) : spent(rows, pick);
  /** A tipo's grupos, each opening into its contas; a tipo with a single grupo lists that grupo's contas itself. */
  const owing = owingGroups(inputs, todayIso);
  const grupos = (kind: GroupKind): TreeItem[] => {
    const shown = shownGroups(kind, rows, inputs.planGroups, kind === "financing" ? owing : undefined);
    const contasOf = (id: string) => contas(id, (a) => figure(kind, of(a.id), [a]));
    if (shown.length === 1) return contasOf(shown[0].id);
    return shown.map((g) =>
      item({ type: "group", id: g.id }, g.label, figure(kind, (r) => r.kind === kind && r.group === g.id, live.filter((a) => a.group === g.id)), {
        archived: g.archived,
        children: contasOf(g.id),
      })
    );
  };

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
      { type: "kind", kind: "investment" },
      GROUP_KIND_LABEL.investment,
      spent(rows, isKind("investment", "purchase")),
      {
        tag: "no período",
        children: [
          ...grupos("investment"),
          item({ type: "auto", which: "purchases" }, PURCHASES, spent(rows, isKind("purchase")), { locked: true }),
        ],
      }
    ),
    item({ type: "kind", kind: "financing" }, GROUP_KIND_LABEL.financing, sum(live, debt), {
      tag: "devedor",
      children: grupos("financing"),
    }),
    item({ type: "kind", kind: "partners" }, GROUP_KIND_LABEL.partners, spent(rows, isKind("partners")), {
      tag: "retirado",
      children: grupos("partners"),
    }),
    item({ type: "kind", kind: "expense" }, GROUP_KIND_LABEL.expense, cents(coe(inputs.expenses, period)), {
      tag: "custo (COE)",
      children: grupos("expense"),
    }),
    item(
      { type: "kind", kind: "revenue" },
      GROUP_KIND_LABEL.revenue,
      cents(periodRevenue(inputs.expenses, inputs.movements, period).total),
      {
        tag: "no período",
        children: [
          item({ type: "auto", which: "sales" }, SALES, earned(rows, isKind("sale")), { locked: true }),
          ...grupos("revenue"),
        ],
      }
    ),
  ];
}

/** Every day there is: a conta bancária looks its lançamentos up whatever their competência. */
const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

function belongs(node: Exclude<PlanNode, { type: "bank" | "banks" }>, r: LedgerRow): boolean {
  switch (node.type) {
    case "all":
      return true;
    case "account":
      return r.expense?.accountId === node.id;
    case "auto":
      return r.kind === (node.which === "purchases" ? "purchase" : "sale");
    case "kind":
      return LEDGER_KINDS[node.kind].includes(r.kind);
    case "group":
      // A lançamento of the grupo: a rendimento and the manejos' rows sit in none.
      return r.expense?.category === node.id;
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
      // A despesa sits in a grupo de despesa.
      const group = r.kind === "expense" ? `${GROUP_KIND_LABEL.expense} › ${r.groupLabel}` : r.groupLabel;
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
    node.type === "account"
      ? inputs.accounts.find((a) => a.id === node.id && groupKind(a.group, inputs.planGroups) === "financing")
      : undefined;
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

/** Which strip a nó shows: a tipo's, or one of the two that are not. */
type Strip = "all" | "banks" | GroupKind;

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
const RESULT_KINDS: readonly LedgerKind[] = [...LEDGER_KINDS.expense, ...LEDGER_KINDS.revenue];

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

/**
 * Where a nó sits and which strip it shows. A conta's crumb names its grupo
 * unless the tree lists the tipo flat (a single grupo). A grupo or conta whose
 * grupo is gone reads as a despesa's, as before grupos had a tipo.
 */
function placeOf(
  node: PlanNode,
  account: Account | undefined,
  inputs: PlanInputs,
  period: Period,
  todayIso: string
): { strip: Strip; crumb: string | null; title: string } {
  const groups = inputs.planGroups;
  if (account) {
    const kind = groupKind(account.group, groups) ?? "expense";
    const keep = kind === "financing" ? owingGroups(inputs, todayIso) : undefined;
    const shown = shownGroups(kind, ledgerRows(inputs, period, todayIso), groups, keep);
    const flat = shown.length === 1 && shown[0].id === account.group;
    const crumb = flat ? GROUP_KIND_LABEL[kind] : `${GROUP_KIND_LABEL[kind]} › ${groupLabel(account.group, groups)}`;
    return { strip: kind, crumb, title: account.name };
  }
  if (node.type === "banks") return { strip: "banks", crumb: null, title: BANKS };
  if (node.type === "auto") {
    return node.which === "purchases"
      ? { strip: "investment", crumb: GROUP_KIND_LABEL.investment, title: PURCHASES }
      : { strip: "revenue", crumb: GROUP_KIND_LABEL.revenue, title: SALES };
  }
  if (node.type === "kind") return { strip: node.kind, crumb: null, title: GROUP_KIND_LABEL[node.kind] };
  if (node.type === "group") {
    const kind = groupKind(node.id, groups) ?? "expense";
    return { strip: kind, crumb: GROUP_KIND_LABEL[kind], title: groupLabel(node.id, groups) };
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

  const { strip, crumb, title } = placeOf(node, account, inputs, period, todayIso);
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
      const cost = cents(coe(inputs.expenses, period));
      const result = cents(revenue - cost);
      return summary([
        fig("Receitas", revenue, "vendas e outras receitas", "healthy"),
        fig("Despesas (COE)", cost, "despesas lançadas"),
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
      const cost = cents(coe(inputs.expenses, period));
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
          node.type === "kind" || node.type === "group" ? "tudo o que entrou no grupo" : "tudo o que entrou nesta conta"
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
      const contas = account
        ? [account]
        : liveFinancing(inputs).filter((a) => node.type !== "group" || a.group === node.id);
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

/** What "Novo" starts with on a nó: an aplicação starts a rendimento, a grupo or conta its tipo and grupo. */
export function entryInitialFor(
  node: PlanNode,
  accounts: Account[],
  bankAccounts: BankAccount[],
  planGroups: readonly PlanGroup[]
): EntryInitial {
  switch (node.type) {
    case "bank":
      return bankAccounts.find((b) => b.id === node.id)?.kind === "investment"
        ? { kind: "yield", bankAccountId: node.id }
        : { bankAccountId: node.id };
    case "kind":
      return isCapitalKind(node.kind) ? { kind: node.kind, flow: "out" } : { kind: node.kind };
    case "group": {
      const kind = groupKind(node.id, planGroups);
      return kind === null ? {} : { kind, category: node.id };
    }
    case "account": {
      const account = accounts.find((a) => a.id === node.id);
      const kind = account ? groupKind(account.group, planGroups) : null;
      return account && kind ? { kind, category: account.group, accountId: account.id } : {};
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
  const live = liveFinancing(inputs);
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
