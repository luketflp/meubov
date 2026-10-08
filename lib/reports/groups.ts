/**
 * Receitas e despesas por grupo: the window's receitas by conta, despesas by
 * grupo (each opening into its contas), the saldo between them, and what moved
 * outside the resultado. Competência takes the lines dated in the window, paid
 * or not; caixa the ones paid or received in it, by payment day. Pure.
 */
import type { CapitalGroup } from "@/lib/types";
import { ledgerRows, type LedgerInputs, type LedgerKind, type LedgerRow } from "@/lib/domain/ledger";
import { inPeriod, type Period } from "@/lib/domain/period";
import { TOP_GROUP_LABEL, despesaGroups } from "@/lib/domain/groups";
import { cents } from "@/lib/domain/bankAccounts";

export type Regime = "accrual" | "cash";

export const REGIME_LABEL: Record<Regime, string> = { accrual: "competência", cash: "caixa" };

/** What a line without a conta of the plano reads. */
export const NO_ACCOUNT = "Sem conta";
/** The treatments with cost, which sit in Sanidade without a conta. */
export const TREATMENTS = "Tratamentos do calendário";

export interface ReportLine {
  label: string;
  amountBrl: number;
  /** Written by the manejos or the calendário, not typed. */
  locked: boolean;
}

export interface GroupLine {
  key: string;
  label: string;
  /** The farm's own grupo. */
  custom: boolean;
  amountBrl: number;
  accounts: ReportLine[];
}

export interface CapitalLine {
  key: CapitalGroup | "yield";
  label: string;
  inBrl: number;
  outBrl: number;
  accounts: { label: string; inBrl: number; outBrl: number; locked: boolean }[];
}

export interface GroupsReport {
  /** By conta. */
  revenues: ReportLine[];
  revenueTotal: number;
  /** By grupo, in despesaGroups order; only grupos with lines. */
  expenses: GroupLine[];
  expenseTotal: number;
  /** Receitas − despesas. */
  balance: number;
  /** Investimentos (compras de gado too), financiamentos, sócios and rendimentos; never in the balance. */
  capital: CapitalLine[];
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
const CAPITAL_LABEL: Record<CapitalLine["key"], string> = { ...TOP_GROUP_LABEL, yield: "Rendimentos" };

const accountLabel = (r: LedgerRow): string => r.account ?? (r.kind === "treatment" ? TREATMENTS : NO_ACCOUNT);

/** Alphabetical, the treatments and then the lines without conta last. */
const rank = (label: string): number => (label === NO_ACCOUNT ? 2 : label === TREATMENTS ? 1 : 0);
const byLabel = (a: { label: string }, b: { label: string }): number =>
  rank(a.label) - rank(b.label) || a.label.localeCompare(b.label, "pt-BR");

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

export function groupsReport(inputs: LedgerInputs, period: Period, regime: Regime, todayIso: string): GroupsReport {
  const rows =
    regime === "accrual"
      ? ledgerRows(inputs, period, todayIso)
      : ledgerRows(inputs, ALL_TIME, todayIso).filter((r) => r.paidAt !== null && inPeriod(r.paidAt, period));

  const revenues = byAccount(rows.filter((r) => r.kind === "revenue" || r.kind === "sale"));

  const costs = rows.filter((r) => r.kind === "expense" || r.kind === "treatment");
  const known = despesaGroups(inputs.expenseGroups, { archived: true });
  // A key that names no grupo any more (a removed one) comes after the known ones.
  const keys = [...new Set(costs.map((r) => r.group))].sort((a, b) => {
    const ia = known.findIndex((g) => g.key === a);
    const ib = known.findIndex((g) => g.key === b);
    return (ia === -1 ? known.length : ia) - (ib === -1 ? known.length : ib);
  });
  const expenses = keys.map((key): GroupLine => {
    const inGroup = costs.filter((r) => r.group === key);
    const accounts = byAccount(inGroup);
    const group = known.find((g) => g.key === key);
    return { key, label: group?.label ?? inGroup[0].groupLabel, custom: group?.custom ?? true, amountBrl: total(accounts), accounts };
  });

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
  return { revenues, revenueTotal, expenses, expenseTotal, balance: cents(revenueTotal - expenseTotal), capital };
}
