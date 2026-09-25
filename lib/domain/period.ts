/**
 * The date window every financial figure follows: two ISO dates, both
 * inclusive. Pure; the Painel, the Financeiro and the Extrato share it.
 */
import type { Period } from "@/lib/domain/finance";
import { addDays, daysBetween, parseISODate, toISO } from "@/lib/domain/dates";

export type { Period } from "@/lib/domain/finance";

/**
 * Sensible default window: the last `months` calendar months ending at `refIso`'s
 * month (start = first day of the earliest month, end = last day of `refIso`'s
 * month), matching the 12-month revenue x cost series derived from the records.
 */
export function defaultPeriod(refIso: string, months = 12): Period {
  const ref = parseISODate(refIso);
  const start = new Date(ref.getFullYear(), ref.getMonth() - (months - 1), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: toISO(start), end: toISO(end) };
}

/** Shifts both ends of a period by `months` (may be negative), keeping the day. */
export function shiftPeriodByMonths(period: Period, months: number): Period {
  const start = parseISODate(period.start);
  const end = parseISODate(period.end);
  return {
    start: toISO(new Date(start.getFullYear(), start.getMonth() + months, start.getDate())),
    end: toISO(new Date(end.getFullYear(), end.getMonth() + months, end.getDate())),
  };
}

/** Days in the window, both ends counted; never less than 1. */
export function periodDays(period: Period): number {
  return Math.max(1, daysBetween(period.start, period.end) + 1);
}

/** "Ano anterior": the same number of days, ending the day before `start`. */
export function priorPeriod(period: Period): Period {
  const end = addDays(period.start, -1);
  return { start: addDays(end, -(periodDays(period) - 1)), end };
}

/** A window's figure scaled to a year: × 365 over the window's days. */
export function annualise(value: number, period: Period): number {
  return (value * 365) / periodDays(period);
}

/** True when the ISO date falls inside the window, both ends included. */
export function inPeriod(iso: string, period: Period): boolean {
  return iso >= period.start && iso <= period.end;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" that names a real day (no 30 February). */
function isRealIsoDate(value: string | null): value is string {
  return value !== null && ISO_DATE.test(value) && toISO(parseISODate(value)) === value;
}

/** The window in `?de=&ate=`, or the last 12 months when it is missing or invalid. */
export function periodFromSearch(
  params: { get(k: string): string | null },
  todayIso: string
): Period {
  const start = params.get("de");
  const end = params.get("ate");
  return isRealIsoDate(start) && isRealIsoDate(end) && start <= end
    ? { start, end }
    : defaultPeriod(todayIso);
}

/** The query string periodFromSearch reads: "de=YYYY-MM-DD&ate=YYYY-MM-DD". */
export function periodSearch(period: Period): string {
  return `de=${period.start}&ate=${period.end}`;
}
