/**
 * LOCAL pure helpers for the panel's period filter. Presentation/composition
 * only — no business rule. They rebuild the ISO first-day of each month in the
 * illustrative revenue x cost series (which stores only short labels) so the
 * period picker can filter that series deterministically, and shift the window
 * month by month for the ‹ › controls.
 */
import type { MonthlyRevenueCost } from "@/lib/data/market";
import type { Period } from "@/lib/domain/finance";
import { parseISODate, toISO } from "@/lib/domain/dates";

/** A revenue x cost month tagged with the ISO first-day it corresponds to. */
export interface DatedRevenueCost extends MonthlyRevenueCost {
  /** First day of the month, ISO "YYYY-MM-DD". */
  date: string;
}

/**
 * Rebuilds the ISO first-day for each entry of the revenue x cost series. The
 * series is the last N calendar months ending at `refIso`'s month, matching the
 * generation rule in `lib/data/market.ts` (index N-1 is `refIso`'s month).
 */
export function withSeriesDates(
  series: readonly MonthlyRevenueCost[],
  refIso: string
): DatedRevenueCost[] {
  const ref = parseISODate(refIso);
  const count = series.length;
  return series.map((entry, index) => ({
    ...entry,
    date: toISO(new Date(ref.getFullYear(), ref.getMonth() - (count - 1 - index), 1)),
  }));
}

/**
 * Sensible default window: the last `months` calendar months ending at `refIso`'s
 * month (start = first day of the earliest month, end = last day of `refIso`'s
 * month). This covers the whole illustrative revenue x cost series, which ends at
 * `refIso`'s month, so the panel shows data out of the box.
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
