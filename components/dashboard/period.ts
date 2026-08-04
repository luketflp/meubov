/**
 * LOCAL pure helpers for the panel's period filter. Presentation/composition
 * only — no business rule.
 */
import type { Period } from "@/lib/domain/finance";
import { parseISODate, toISO } from "@/lib/domain/dates";

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
