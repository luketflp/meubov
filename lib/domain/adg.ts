/**
 * ADG (average daily gain) calculation for the herd.
 */
import type { Animal, Weighing } from "@/lib/types";
import {
  TODAY_ISO,
  addDays,
  daysBetween,
  parseISODate,
  monthYearLabel,
  toISO,
  lastDayOfMonth,
} from "@/lib/domain/dates";

/** Default lookback window (days) of the herd average ADG. */
export const ADG_WINDOW_DAYS = 120;

/** Point of the monthly ADG series. */
export interface MonthlyAdgPoint {
  /** Month label, e.g.: "mai/26". */
  month: string;
  /** Average ADG (kg/day) of the animals with computable ADG in the month, or null. */
  averageAdg: number | null;
}

/**
 * ADG in kg/day: (last weight - first weight) / days between the first and last weighing.
 * Returns null with fewer than 2 weighings or a 0-day interval.
 */
export function calculateAdg(weighings: Weighing[]): number | null {
  if (weighings.length < 2) return null;
  const first = weighings[0];
  const last = weighings[weighings.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days === 0) return null;
  return (last.weightKg - first.weightKg) / days;
}

/**
 * Monthly series of the herd average ADG for the last N calendar months up to refIso.
 *
 * Approach: for each month, the end of the calendar month is taken as the "cutoff".
 * Per ACTIVE animal, the weighings with a date within the 120-day lookback window
 * that ends at the cutoff (cutoff - 120 days up to the cutoff, inclusive) are taken.
 * With 2 or more weighings in the window, the animal ADG is computed between the first
 * and the last weighing of the window. The month value is the arithmetic mean of the
 * ADGs of the animals with computable ADG; if no animal has a computable ADG, the month is null.
 */
export function monthlyAdg(
  animals: Animal[],
  months = 6,
  refIso: string = TODAY_ISO
): MonthlyAdgPoint[] {
  const ref = parseISODate(refIso);
  const active = animals.filter((a) => a.active);
  const series: MonthlyAdgPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthRef = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const monthRefIso = toISO(monthRef);
    const monthEnd = lastDayOfMonth(monthRefIso);
    const windowStart = addDays(monthEnd, -120);

    const adgs: number[] = [];
    for (const animal of active) {
      const inWindow = animal.weighings.filter(
        (w) => w.date >= windowStart && w.date <= monthEnd
      );
      const adg = calculateAdg(inWindow);
      if (adg !== null) adgs.push(adg);
    }

    series.push({
      month: monthYearLabel(monthRefIso),
      averageAdg:
        adgs.length === 0
          ? null
          : adgs.reduce((sum, g) => sum + g, 0) / adgs.length,
    });
  }

  return series;
}

/**
 * Herd average ADG (kg/day) in the lookback window ending today:
 * mean of the ADGs of the ACTIVE animals with 2+ weighings within the window of `days`
 * (120 by default) up to todayIso, or null if no animal has a computable ADG.
 */
export function herdAverageAdg(
  animals: Animal[],
  todayIso: string,
  days: number = ADG_WINDOW_DAYS
): number | null {
  const adgs: number[] = [];
  for (const animal of animals) {
    if (!animal.active) continue;
    const inWindow = animal.weighings.filter(
      (w) => w.date <= todayIso && daysBetween(w.date, todayIso) <= days
    );
    const adg = calculateAdg(inWindow);
    if (adg !== null) adgs.push(adg);
  }
  if (adgs.length === 0) return null;
  return adgs.reduce((sum, g) => sum + g, 0) / adgs.length;
}
