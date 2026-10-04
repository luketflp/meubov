/**
 * The fields of the orçamento dialog, one set per line (the grupo's own and
 * each conta's): the total, the distribution and the twelve months as typed.
 * A total typed under Igual or Como a safra anterior spreads over the months
 * again; typing a month keeps it and makes the line Manual; `checkLine` says
 * whether the line can be saved. Pure.
 */
import type { BudgetDistribution } from "@/lib/types";
import { distribute, monthsAddUp, type BudgetLine } from "@/lib/domain/budget";
import { cents } from "@/lib/domain/bankAccounts";
import { formatNumber } from "@/lib/domain/format";
import { parseAmount } from "@/components/finance/parseAmount";

export interface LineFields {
  /** "Total (R$)" as typed. */
  total: string;
  distribution: BudgetDistribution;
  /** The twelve months as typed, in safra order. */
  months: string[];
}

/** Whether the line can be saved: blank (no budget), its months when they add up to the total, or what is wrong. */
export type LineCheck =
  | { state: "blank" }
  | { state: "invalid"; message: string }
  | { state: "off"; total: number; sum: number }
  | { state: "ok"; total: number; months: number[] };

const typed = (value: number) => formatNumber(value, 2);
const emptyMonths = () => Array<string>(12).fill("");

/** The fields of a line: its own rows when it has them, else blank under Igual. */
export function lineFields(
  line?: Pick<BudgetLine, "ownRows" | "budgeted" | "budgetedTotal" | "distribution">
): LineFields {
  if (!line?.ownRows) return { total: "", distribution: "equal", months: emptyMonths() };
  return { total: typed(line.budgetedTotal), distribution: line.distribution ?? "manual", months: line.budgeted.map(typed) };
}

/** The months `total` spreads into; blank while it is not a number ≥ 0. */
function spread(total: string, distribution: "equal" | "previous", shape: number[]): string[] {
  const value = parseAmount(total);
  return Number.isFinite(value) && value >= 0 ? distribute(value, distribution, shape).map(typed) : emptyMonths();
}

/** Typing the total: Igual and Como a safra anterior spread it again; Manual keeps the months. */
export function withTotal(fields: LineFields, total: string, shape: number[]): LineFields {
  return fields.distribution === "manual"
    ? { ...fields, total }
    : { ...fields, total, months: spread(total, fields.distribution, shape) };
}

/** Picking a distribution: Igual and Como a safra anterior spread the total; Manual keeps the months. */
export function withDistribution(fields: LineFields, distribution: BudgetDistribution, shape: number[]): LineFields {
  return distribution === "manual"
    ? { ...fields, distribution }
    : { ...fields, distribution, months: spread(fields.total, distribution, shape) };
}

/** Typing a month: it stays as typed and the line becomes Manual. */
export function withMonth(fields: LineFields, index: number, text: string): LineFields {
  return { ...fields, distribution: "manual", months: fields.months.map((month, i) => (i === index ? text : month)) };
}

/** An empty month is zero; `labels` name the month that is not a number ("out/25"). */
export function checkLine(fields: LineFields, labels: readonly string[]): LineCheck {
  if (fields.total.trim() === "" && fields.months.every((month) => month.trim() === "")) return { state: "blank" };
  const total = parseAmount(fields.total);
  if (!Number.isFinite(total)) return { state: "invalid", message: "Informe o total em reais." };
  const months: number[] = [];
  for (const [i, text] of fields.months.entries()) {
    const value = text.trim() === "" ? 0 : parseAmount(text);
    if (!Number.isFinite(value)) return { state: "invalid", message: `Valor inválido em ${labels[i]}.` };
    months.push(cents(value));
  }
  if (total < 0 || months.some((month) => month < 0)) {
    return { state: "invalid", message: "Os valores não podem ser negativos." };
  }
  if (!monthsAddUp(months, total)) {
    return { state: "off", total: cents(total), sum: cents(months.reduce((sum, month) => sum + month, 0)) };
  }
  return { state: "ok", total: cents(total), months };
}
