/**
 * Receitas e despesas por grupo: the window's receitas and despesas by grupo
 * (each opening into its contas, Venda de gado a line of its own), the saldo
 * between them, and what moved outside the resultado. Competência takes the
 * lines dated in the window, paid or not; caixa the ones paid or received in
 * it, by payment day. Pure.
 */
import type { CapitalGroup, GroupKind, PlanGroup } from "@/lib/types";
import { ledgerRows, type LedgerInputs, type LedgerKind, type LedgerRow } from "@/lib/domain/ledger";
import { inPeriod, type Period } from "@/lib/domain/period";
import { GROUP_KIND_LABEL, groupLabel, groupsOf } from "@/lib/domain/groups";
import { cents } from "@/lib/domain/bankAccounts";

export type Regime = "accrual" | "cash";

export const REGIME_LABEL: Record<Regime, string> = { accrual: "competência", cash: "caixa" };

/** What a line without a conta of the plano reads. */
export const NO_ACCOUNT = "Sem conta";

export interface ReportLine {
  label: string;
  amountBrl: number;
  /** Written by the manejos, not typed. */
  locked: boolean;
}

export interface GroupLine {
  key: string;
  label: string;
  amountBrl: number;
  accounts: ReportLine[];
  /** Venda de gado: a single line, no contas. */
  locked?: boolean;
}

export interface CapitalLine {
  key: CapitalGroup | "yield";
  label: string;
  inBrl: number;
  outBrl: number;
  accounts: { label: string; inBrl: number; outBrl: number; locked: boolean }[];
}

export interface GroupsReport {
  /** Venda de gado first when it is not 0, then by grupo like `expenses`. */
  revenues: GroupLine[];
  revenueTotal: number;
  /** By grupo, by name, a removed one last; only grupos with lines. */
  expenses: GroupLine[];
  expenseTotal: number;
  /** Receitas − despesas. */
  balance: number;
  /** Investimentos (compras de gado too), financiamentos, sócios and rendimentos; never in the balance. */
  capital: CapitalLine[];
  /** The tipo shows a single grupo (active, or archived/removed with lines): its contas list without the header, like the tree. */
  flat: Record<"revenue" | "expense", boolean>;
}

const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

const CAPITAL_KEY: Partial<Record<LedgerKind, CapitalLine["key"]>> = {
  investment: "investment",
  purchase: "investment",
  financing: "financing",
  partners: "partners",
  yield: "yield",
};
const CAPITAL_ORDER: CapitalLine["key"][] = ["investment", "financing", "partners", "yield"];
const CAPITAL_LABEL: Record<CapitalLine["key"], string> = {
  investment: GROUP_KIND_LABEL.investment,
  financing: GROUP_KIND_LABEL.financing,
  partners: GROUP_KIND_LABEL.partners,
  yield: "Rendimentos",
};

const accountLabel = (r: LedgerRow): string => r.account ?? NO_ACCOUNT;

/** Alphabetical, the lines without conta last. */
const byLabel = (a: { label: string }, b: { label: string }): number =>
  Number(a.label === NO_ACCOUNT) - Number(b.label === NO_ACCOUNT) || a.label.localeCompare(b.label, "pt-BR");

/** Sums the rows by conta, sorted by byLabel. */
function byAccount(rows: LedgerRow[]): ReportLine[] {
  const lines = new Map<string, ReportLine>();
  for (const r of rows) {
    const label = accountLabel(r);
    const line = lines.get(label) ?? { label, amountBrl: 0, locked: r.locked };
    line.amountBrl = cents(line.amountBrl + r.amountBrl);
    lines.set(label, line);
  }
  return [...lines.values()].sort(byLabel);
}

const total = (lines: { amountBrl: number }[]): number => cents(lines.reduce((sum, l) => sum + l.amountBrl, 0));

/** The lançamentos of a tipo by grupo, in groupsOf order; an id that names no grupo any more comes last. */
function byGroup(rows: LedgerRow[], kind: GroupKind, groups: readonly PlanGroup[]): GroupLine[] {
  const ofKind = rows.filter((r) => r.kind === kind);
  const known = groupsOf(groups, kind, { archived: true });
  const rank = (id: string): number => {
    const i = known.findIndex((g) => g.id === id);
    return i === -1 ? known.length : i;
  };
  return [...new Set(ofKind.map((r) => r.group))]
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => {
      const accounts = byAccount(ofKind.filter((r) => r.group === key));
      return { key, label: groupLabel(key, groups), amountBrl: total(accounts), accounts };
    });
}

export function groupsReport(inputs: LedgerInputs, period: Period, regime: Regime, todayIso: string): GroupsReport {
  const rows =
    regime === "accrual"
      ? ledgerRows(inputs, period, todayIso)
      : ledgerRows(inputs, ALL_TIME, todayIso).filter((r) => r.paidAt !== null && inPeriod(r.paidAt, period));

  const sales = total(rows.filter((r) => r.kind === "sale"));
  const revenues: GroupLine[] = [
    ...(sales !== 0 ? [{ key: "venda-de-gado", label: "Venda de gado", amountBrl: sales, accounts: [], locked: true }] : []),
    ...byGroup(rows, "revenue", inputs.planGroups),
  ];
  const expenses = byGroup(rows, "expense", inputs.planGroups);

  const capital = CAPITAL_ORDER.flatMap((key): CapitalLine[] => {
    const inGroup = rows.filter((r) => CAPITAL_KEY[r.kind] === key);
    if (inGroup.length === 0) return [];
    const accounts = new Map<string, CapitalLine["accounts"][number]>();
    for (const r of inGroup) {
      const label = accountLabel(r);
      const line = accounts.get(label) ?? { label, inBrl: 0, outBrl: 0, locked: r.locked };
      if (r.inflow) line.inBrl = cents(line.inBrl + r.amountBrl);
      else line.outBrl = cents(line.outBrl + r.amountBrl);
      accounts.set(label, line);
    }
    const lines = [...accounts.values()].sort(byLabel);
    return [
      {
        key,
        label: CAPITAL_LABEL[key],
        inBrl: cents(lines.reduce((sum, l) => sum + l.inBrl, 0)),
        outBrl: cents(lines.reduce((sum, l) => sum + l.outBrl, 0)),
        accounts: lines,
      },
    ];
  });

  const revenueTotal = total(revenues);
  const expenseTotal = total(expenses);
  // A tipo reads flat when it shows one grupo: the active ones plus those with lines (archived or removed), as the tree.
  const shown = (kind: GroupKind, lines: GroupLine[]): number =>
    new Set([...groupsOf(inputs.planGroups, kind).map((g) => g.id), ...lines.filter((g) => !g.locked).map((g) => g.key)]).size;
  const flat = { revenue: shown("revenue", revenues) <= 1, expense: shown("expense", expenses) <= 1 };
  return { revenues, revenueTotal, expenses, expenseTotal, balance: cents(revenueTotal - expenseTotal), capital, flat };
}
