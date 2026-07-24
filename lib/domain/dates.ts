/**
 * Domain date utilities.
 * Dates travel as ISO strings "YYYY-MM-DD" and are parsed as LOCAL dates
 * (never via new Date(iso), which interprets UTC and causes off-by-one in Brazil).
 */

/** App-anchored "today" date (fixed for deterministic data). */
export const TODAY_ISO = "2026-07-24";

const MONTH_ABBREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Converts "YYYY-MM-DD" into a LOCAL Date (local midnight), without timezone shift.
 */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Returns the anchored "today" date as a local Date. */
export function today(): Date {
  return parseISODate(TODAY_ISO);
}

/** Difference in whole days between two ISO dates (b - a). */
export function daysBetween(aIso: string, bIso: string): number {
  const diffMs = parseISODate(bIso).getTime() - parseISODate(aIso).getTime();
  return Math.round(diffMs / MS_PER_DAY);
}

/** Adds n days (may be negative) to an ISO date and returns ISO. */
export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Converts a local Date into an ISO string "YYYY-MM-DD". */
export function toISO(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Age in complete months between birth and the reference date (default TODAY_ISO).
 */
export function ageInMonths(birthIso: string, refIso: string = TODAY_ISO): number {
  const birth = parseISODate(birthIso);
  const ref = parseISODate(refIso);
  let months =
    (ref.getFullYear() - birth.getFullYear()) * 12 + (ref.getMonth() - birth.getMonth());
  if (ref.getDate() < birth.getDate()) months -= 1;
  return months;
}

/**
 * Formats the animal age as "2a 4m", "8m" or "3a" from the birth date.
 */
export function formatAge(birthIso: string): string {
  const months = ageInMonths(birthIso);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}m`;
  if (rest === 0) return `${years}a`;
  return `${years}a ${rest}m`;
}

/** Formats an ISO date as "dd/mm/aaaa". */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Short month/year label, e.g.: "jul/26". */
export function monthYearLabel(iso: string): string {
  const d = parseISODate(iso);
  const shortYear = String(d.getFullYear()).slice(-2);
  return `${MONTH_ABBREV[d.getMonth()]}/${shortYear}`;
}

/** First day of the month of the ISO date, as ISO. */
export function firstDayOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Last day of the month of the ISO date, as ISO. */
export function lastDayOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
