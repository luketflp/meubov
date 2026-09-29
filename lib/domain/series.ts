/**
 * Parcelamentos and recorrências: the dates and values a série generates and
 * which of its rows an edit or a removal reaches. Pure: `today` always comes in.
 *
 * Position i (1-based) of a série falls on `occurrenceDate(rule, i)`: weekly,
 * `startsOn` + 7·(i−1) days; monthly, the month of `startsOn` + (i−1) on
 * `dayOfMonth`, or on the month's last day when it is shorter (31 → 28/29 Feb).
 */
import type { Expense, SeriesFrequency, SeriesScope } from "@/lib/types";
import { addDays, MONTH_ABBREV, parseISODate, toISO } from "@/lib/domain/dates";

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 48;
/** How far ahead a recorrência keeps its ocorrências written. */
export const HORIZON_MONTHS = 12;
/** Guard against a runaway loop (weekly over a long window is ~53 a year). */
const MAX_OCCURRENCES = 600;

export interface SeriesRule {
  frequency: SeriesFrequency;
  /** Monthly only; absent = the day of `startsOn`. */
  dayOfMonth?: number | null;
  startsOn: string;
  /** Last day an ocorrência may fall on; absent = sem fim. */
  endsOn?: string | null;
}

/** Vencimento of position `index` (1-based; 0 and below walk back before `startsOn`). */
export function occurrenceDate(rule: SeriesRule, index: number): string {
  if (rule.frequency === "weekly") return addDays(rule.startsOn, 7 * (index - 1));
  const start = parseISODate(rule.startsOn);
  const day = rule.dayOfMonth ?? start.getDate();
  const month = start.getMonth() + index - 1;
  const lastDay = new Date(start.getFullYear(), month + 1, 0).getDate();
  return toISO(new Date(start.getFullYear(), month, Math.min(day, lastDay)));
}

/** `iso` plus `months` calendar months, on the same day or the month's last. */
export function addMonths(iso: string, months: number): string {
  return occurrenceDate({ frequency: "monthly", startsOn: iso }, months + 1);
}

/** The last day a recorrência is written up to: today + 12 months. */
export function seriesHorizon(todayIso: string): string {
  return addMonths(todayIso, HORIZON_MONTHS);
}

export interface InstallmentLine {
  index: number;
  dueDate: string;
  amountBrl: number;
}

/**
 * The parcelas of `total`: each floor(total ÷ count) to the centavo, the last
 * one takes the remainder, so they always add up to the total.
 */
export function installmentPlan(
  total: number,
  count: number,
  startsOn: string,
  frequency: SeriesFrequency
): InstallmentLine[] {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / count);
  const rule: SeriesRule = { frequency, startsOn };
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    dueDate: occurrenceDate(rule, i + 1),
    amountBrl: (i === count - 1 ? cents - each * (count - 1) : each) / 100,
  }));
}

/**
 * Positions from `fromIndex` whose vencimento falls on or before both `untilIso`
 * and the rule's `endsOn`.
 */
export function recurringDates(
  rule: SeriesRule,
  fromIndex: number,
  untilIso: string
): { index: number; date: string }[] {
  const last = rule.endsOn && rule.endsOn < untilIso ? rule.endsOn : untilIso;
  const out: { index: number; date: string }[] = [];
  for (let index = fromIndex; out.length < MAX_OCCURRENCES; index += 1) {
    const date = occurrenceDate(rule, index);
    if (date > last) break;
    out.push({ index, date });
  }
  return out;
}

/** The first `n` vencimentos of a rule (fewer when `endsOn` comes first): the dialog's "próximas". */
export function nextDueDates(rule: SeriesRule, n: number): string[] {
  const out: string[] = [];
  for (let index = 1; out.length < n; index += 1) {
    const date = occurrenceDate(rule, index);
    if (rule.endsOn && date > rule.endsOn) break;
    out.push(date);
  }
  return out;
}

/** First day on or after `fromIso` that falls on `day` (or on a shorter month's last day). */
export function firstMonthlyOnOrAfter(fromIso: string, day: number): string {
  const here = occurrenceDate({ frequency: "monthly", dayOfMonth: day, startsOn: fromIso }, 1);
  return here >= fromIso
    ? here
    : occurrenceDate({ frequency: "monthly", dayOfMonth: day, startsOn: fromIso }, 2);
}

/**
 * The rule that puts position `index` on `dueDate`, keeping the frequency: the
 * day of `dueDate` becomes the day of the month and `startsOn` walks back
 * (index − 1) intervals. Used when "Esta e as próximas" moves a vencimento.
 */
export function ruleFromOccurrence(
  frequency: SeriesFrequency,
  index: number,
  dueDate: string
): { startsOn: string; dayOfMonth: number | null } {
  if (frequency === "weekly") return { startsOn: addDays(dueDate, -7 * (index - 1)), dayOfMonth: null };
  const dayOfMonth = parseISODate(dueDate).getDate();
  return {
    startsOn: occurrenceDate({ frequency, dayOfMonth, startsOn: dueDate }, 2 - index),
    dayOfMonth,
  };
}

interface SeriesPosition {
  seriesIndex?: number | null;
  paidAt?: string | null;
}

/**
 * Rows of one série an edit or removal reaches. "one": the row at `index`.
 * "following": unpaid rows from `index` on. "all": every unpaid row. Paid rows
 * never enter a wider scope.
 */
export function scopeRows<T extends SeriesPosition>(rows: T[], index: number, scope: SeriesScope): T[] {
  if (scope === "one") return rows.filter((row) => row.seriesIndex === index);
  return rows.filter(
    (row) => !row.paidAt && (scope === "all" || (row.seriesIndex ?? 0) >= index)
  );
}

/** "2/3" on a parcela; null otherwise. */
export function installmentLabel(expense: Expense): string | null {
  return expense.seriesIndex !== undefined && expense.seriesCount !== undefined
    ? `${expense.seriesIndex}/${expense.seriesCount}`
    : null;
}

/** "todo dia 20" or "toda semana" on an ocorrência; null otherwise. */
export function recurrenceLabel(expense: Expense): string | null {
  if (expense.seriesFrequency === "weekly") return "toda semana";
  if (expense.seriesFrequency === "monthly" && expense.seriesDay !== undefined) {
    return `todo dia ${expense.seriesDay}`;
  }
  return null;
}

/** "dez/2026". */
export function monthYear(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTH_ABBREV[d.getMonth()]}/${d.getFullYear()}`;
}
