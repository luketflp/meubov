/**
 * Orçamento por safra: the safra's months, how a total spreads over them, and
 * per grupo and conta the orçado, the realizado (competência, up to today),
 * the previsto até o fim and the % usado. Pure: `today` always comes in.
 *
 * Every 12-number array is in safra order: index 0 is `startMonth` of the
 * safra. A Budget row is one calendar month; the farm's start month decides
 * which safra, and which index in it, that month falls on.
 */
import type {
  Account,
  Budget,
  BudgetDistribution,
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  Treatment,
} from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { accountsByGroup } from "@/lib/domain/accounts";
import { cents } from "@/lib/domain/bankAccounts";
import { monthYearLabel, parseISODate, toISO } from "@/lib/domain/dates";
import { isCost } from "@/lib/domain/entries";
import { despesaGroups } from "@/lib/domain/groups";

export interface SafraMonth {
  year: number;
  /** Calendar month 1–12. */
  month: number;
  /** "out/25" */
  label: string;
  /** "YYYY-MM" */
  key: string;
}

/** The safra `dateIso` falls in: the calendar year it started. */
export function safraOf(dateIso: string, startMonth: number): number {
  const d = parseISODate(dateIso);
  return d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
}

/** The 12 months from `startMonth` of `safra` on. */
export function safraMonths(safra: number, startMonth: number): SafraMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(safra, startMonth - 1 + i, 1);
    const iso = toISO(d);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: monthYearLabel(iso), key: iso.slice(0, 7) };
  });
}

/** "Safra 2025/26" (start ≠ 1) or "Safra 2026" (start = 1). */
export function safraLabel(safra: number, startMonth: number): string {
  return startMonth === 1 ? `Safra ${safra}` : `Safra ${safra}/${String(safra + 1).slice(-2)}`;
}

/** First and last day. */
export function safraRange(safra: number, startMonth: number): Period {
  return {
    start: toISO(new Date(safra, startMonth - 1, 1)),
    end: toISO(new Date(safra, startMonth + 11, 0)),
  };
}

/**
 * 12 amounts to the centavo that add up to `total`: equal, or proportional to
 * `previousShape`; each month floored, the remainder on the last one.
 * `previous` falls back to equal when the shape is all zero.
 */
export function distribute(
  total: number,
  mode: Exclude<BudgetDistribution, "manual">,
  previousShape?: number[]
): number[] {
  const totalCents = Math.round(total * 100);
  // Weights in whole centavos, so the products below stay integers.
  const shape =
    mode === "previous" && previousShape?.some((v) => v > 0)
      ? previousShape.map((v) => Math.round(v * 100))
      : Array<number>(12).fill(1);
  const weight = shape.reduce((s, v) => s + v, 0);
  const months = shape.map((v) => Math.floor((totalCents * v) / weight));
  months[11] = totalCents - months.slice(0, 11).reduce((s, v) => s + v, 0);
  return months.map((c) => c / 100);
}

/** The sum of twelve typed months equals the total (to the centavo). */
export function monthsAddUp(months: number[], total: number): boolean {
  return (
    months.length === 12 &&
    months.reduce((s, v) => s + Math.round(v * 100), 0) === Math.round(total * 100)
  );
}

/** Key of a line: `${category}` or `${category}:${accountId}`. */
export type LineKey = string;

export function lineKey(category: ExpenseCategory, accountId?: string | null): LineKey {
  return accountId ? `${category}:${accountId}` : category;
}

export type BudgetTone = "brand" | "attention" | "overdue" | "none";

export interface BudgetLine {
  key: LineKey;
  category: ExpenseCategory;
  accountId: string | null;
  /** Grupo label or conta name. */
  label: string;
  /** Own rows, or (grupo without own rows) the sum of its contas; zeros when no budget. */
  budgeted: number[];
  budgetedTotal: number;
  /** Months up to today's month, that one included. */
  budgetedToDate: number;
  /** Own rows exist (a grupo summing its contas counts as having one). */
  hasBudget: boolean;
  /** The line has its own rows. */
  ownRows: boolean;
  distribution: BudgetDistribution | null;
  /** Up to today only. */
  realized: number[];
  realizedToDate: number;
  /** Previsto até o fim. */
  forecast: number;
  /** realizedToDate ÷ budgetedToDate in %; null without orçado to date. */
  usedPct: number | null;
  /** By the rounded %: up to 90 brand, up to 100 attention, above overdue; none without orçado to date. */
  tone: BudgetTone;
}

export interface BudgetGroup extends BudgetLine {
  /** Only contas with a budget or realizado, by name. */
  accounts: BudgetLine[];
  /** Sum of the contas' totals when the grupo has its own rows AND contas have rows and they differ; else null. */
  accountsSum: number | null;
}

type Figures = Pick<
  BudgetLine,
  "budgeted" | "budgetedTotal" | "budgetedToDate" | "realized" | "realizedToDate" | "forecast" | "usedPct" | "tone"
>;

export interface BudgetView {
  safra: number;
  startMonth: number;
  months: SafraMonth[];
  /** Index of today's month in `months`; -1 before the safra, 12 after it. */
  todayIndex: number;
  /** despesaGroups order, archived farm grupos too; grupos with neither orçado nor despesas in the safra left out. */
  groups: BudgetGroup[];
  /** The grupos with a budget only: what grupos without one spend is in their own rows. */
  totals: Figures;
  /** Up to three grupos above 100 % (overdue), worst first: for the Painel band. */
  over: { label: string; usedPct: number }[];
}

export interface BudgetInputs {
  budgets: Budget[];
  expenses: Expense[];
  treatments: Treatment[];
  accounts: Account[];
  /** The farm's grupos de despesa, archived ones included. */
  expenseGroups: readonly ExpenseGroup[];
}

const zeros = (): number[] => Array<number>(12).fill(0);
const sum = (values: number[]): number => cents(values.reduce((s, v) => s + v, 0));
/** Month by month sum of several 12-month rows. */
const addUp = (rows: number[][]): number[] => zeros().map((_, i) => sum(rows.map((r) => r[i])));

/**
 * Despesas (`isCost`, paid or not, by `date`) per line and safra month (`index`
 * by "YYYY-MM") up to `untilIso`: under their grupo and, with a conta, under
 * the conta too. Done treatments' costs go under Sanidade, as in the COE.
 */
function spentByLine(inputs: BudgetInputs, index: Map<string, number>, untilIso: string): Map<LineKey, number[]> {
  const byLine = new Map<LineKey, number[]>();
  const add = (key: LineKey, date: string, amount: number): void => {
    const i = index.get(date.slice(0, 7));
    if (i === undefined || date > untilIso) return;
    const row = byLine.get(key) ?? zeros();
    row[i] = cents(row[i] + amount);
    byLine.set(key, row);
  };
  for (const e of inputs.expenses) {
    if (!isCost(e)) continue;
    add(lineKey(e.category), e.date, e.amountBrl);
    if (e.accountId) add(lineKey(e.category, e.accountId), e.date, e.amountBrl);
  }
  for (const t of inputs.treatments) {
    if (t.status === "done" && t.costBrl !== undefined) add(lineKey("health"), t.date, t.costBrl);
  }
  return byLine;
}

/**
 * Previsto até o fim: past months as realizado; today's month and each later
 * one the larger of its orçado and its despesas already generated (parcelas,
 * recorrências, pendentes), so a small recorrência never hides a month's orçado.
 */
function forecastOf(budgeted: number[], realized: number[], incurred: number[], todayIndex: number): number {
  return sum(budgeted.map((b, i) => (i < todayIndex ? realized[i] : Math.max(b, incurred[i]))));
}

/** From the % as the page shows it, rounded to the integer: 100,4 % reads "100 %" and is attention. */
function toneOf(usedPct: number | null): BudgetTone {
  if (usedPct === null) return "none";
  const shown = Math.round(usedPct);
  if (shown <= 90) return "brand";
  return shown <= 100 ? "attention" : "overdue";
}

function figures(budgeted: number[], realized: number[], forecast: number, todayIndex: number): Figures {
  const budgetedToDate = sum(budgeted.slice(0, todayIndex + 1));
  const realizedToDate = sum(realized);
  // In whole centavos: 2,70 of 3,00 must read 90, not 90.00000000000001.
  const usedPct =
    budgetedToDate > 0
      ? (Math.round(realizedToDate * 100) * 100) / Math.round(budgetedToDate * 100)
      : null;
  return {
    budgeted,
    budgetedTotal: sum(budgeted),
    budgetedToDate,
    realized,
    realizedToDate,
    forecast,
    usedPct,
    tone: toneOf(usedPct),
  };
}

/** The Orçamento of one safra as of `todayIso`. */
export function budgetView(inputs: BudgetInputs, safra: number, startMonth: number, todayIso: string): BudgetView {
  const months = safraMonths(safra, startMonth);
  const range = safraRange(safra, startMonth);
  const current = months.findIndex((m) => m.key === todayIso.slice(0, 7));
  const todayIndex = current >= 0 ? current : todayIso < range.start ? -1 : 12;
  const index = new Map(months.map((m, i) => [m.key, i]));
  const realized = spentByLine(inputs, index, todayIso);
  const incurred = spentByLine(inputs, index, range.end);

  // Each line's rows of this safra on their months; rows of other months are not read.
  const own = new Map<LineKey, { budgeted: number[]; distribution: BudgetDistribution }>();
  for (const b of inputs.budgets) {
    const i = index.get(b.month.slice(0, 7));
    if (i === undefined) continue;
    const key = lineKey(b.category, b.accountId);
    const rows = own.get(key) ?? { budgeted: zeros(), distribution: b.distribution };
    rows.budgeted[i] = b.amountBrl;
    own.set(key, rows);
  }

  const line = (category: ExpenseCategory, accountId: string | null, label: string, contas: BudgetLine[] = []): BudgetLine => {
    const key = lineKey(category, accountId);
    const rows = own.get(key);
    const budgetedContas = contas.filter((c) => c.ownRows);
    const budgeted =
      rows?.budgeted ?? (budgetedContas.length > 0 ? addUp(budgetedContas.map((c) => c.budgeted)) : zeros());
    const real = realized.get(key) ?? zeros();
    return {
      key,
      category,
      accountId,
      label,
      hasBudget: rows !== undefined || budgetedContas.length > 0,
      ownRows: rows !== undefined,
      distribution: rows?.distribution ?? null,
      ...figures(budgeted, real, forecastOf(budgeted, real, incurred.get(key) ?? zeros(), todayIndex), todayIndex),
    };
  };

  // Despesas anywhere in the safra, today's or still ahead: they reach the previsto.
  const spent = (key: LineKey): boolean => incurred.get(key)?.some((v) => v > 0) ?? false;
  const contasByGroup = accountsByGroup(inputs.accounts, true);
  const groups: BudgetGroup[] = [];
  for (const { key: category, label } of despesaGroups(inputs.expenseGroups, { archived: true })) {
    const accounts = (contasByGroup[category] ?? [])
      .map((a) => line(category, a.id, a.name))
      .filter((c) => c.ownRows || spent(c.key));
    const group = line(category, null, label, accounts);
    if (!group.hasBudget && !spent(group.key)) continue;
    const withRows = accounts.filter((c) => c.ownRows);
    const contasTotal = sum(withRows.map((c) => c.budgetedTotal));
    const differs = group.ownRows && withRows.length > 0 && contasTotal !== group.budgetedTotal;
    groups.push({ ...group, accounts, accountsSum: differs ? contasTotal : null });
  }

  const budgeted = groups.filter((g) => g.hasBudget);
  return {
    safra,
    startMonth,
    months,
    todayIndex,
    groups,
    totals: figures(
      addUp(budgeted.map((g) => g.budgeted)),
      addUp(budgeted.map((g) => g.realized)),
      sum(budgeted.map((g) => g.forecast)),
      todayIndex
    ),
    over: groups
      .flatMap((g) => (g.usedPct !== null && g.tone === "overdue" ? [{ label: g.label, usedPct: g.usedPct }] : []))
      .sort((a, b) => b.usedPct - a.usedPct)
      .slice(0, 3),
  };
}

/** The safra before `safra`: its realizado per month for one line (the "previous" shape). */
export function previousShape(
  inputs: BudgetInputs,
  key: LineKey,
  safra: number,
  startMonth: number,
  todayIso: string
): number[] {
  const { groups } = budgetView(inputs, safra - 1, startMonth, todayIso);
  return groups.flatMap((g) => [g, ...g.accounts]).find((l) => l.key === key)?.realized ?? zeros();
}

/** What "Copiar" would write: one line per source line without budget in `to`. Months in safra order. */
export interface CopyLine {
  category: ExpenseCategory;
  accountId: string | null;
  months: number[];
}

/**
 * Lines of safra `from` to write into `to`: its own orçado lines (grupos and
 * contas), or its realizado per grupo; each month × (1 + adjustPct %) to the
 * centavo. A line that already has rows in `to` is skipped, and so is a
 * grupo whose contas have rows there: it is budgeted through them. An archived
 * farm grupo is not carried into `to` at all, nor are its contas' lines. Both
 * safras are read from the same `inputs.budgets`.
 */
export function copyPlan(
  inputs: BudgetInputs,
  from: number,
  to: number,
  source: "budgeted" | "realized",
  adjustPct: number,
  startMonth: number,
  todayIso: string
): { lines: CopyLine[]; skipped: number } {
  // ISO dates compare as strings.
  const target = safraRange(to, startMonth);
  const taken = new Set(
    inputs.budgets
      .filter((b) => b.month >= target.start && b.month <= target.end)
      .flatMap((b) => [lineKey(b.category, b.accountId), lineKey(b.category)])
  );
  const { groups } = budgetView(inputs, from, startMonth, todayIso);
  const archived = new Set(inputs.expenseGroups.filter((g) => g.archivedAt !== undefined).map((g) => g.id));
  const live = groups.filter((g) => !archived.has(g.category));
  const sources =
    source === "budgeted"
      ? live.flatMap((g) => [g, ...g.accounts]).filter((l) => l.ownRows)
      : live.filter((g) => g.realizedToDate > 0);
  const lines = sources
    .filter((l) => !taken.has(l.key))
    .map((l) => ({
      category: l.category,
      accountId: l.accountId,
      months: (source === "budgeted" ? l.budgeted : l.realized).map((v) => cents((v * (100 + adjustPct)) / 100)),
    }));
  return { lines, skipped: sources.length - lines.length };
}
