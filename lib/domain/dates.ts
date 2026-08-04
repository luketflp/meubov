/**
 * Domain date utilities.
 * Dates travel as ISO strings "YYYY-MM-DD" and are parsed as LOCAL dates
 * (never via new Date(iso), which interprets UTC and causes off-by-one in Brazil).
 */

/**
 * Formatter for the app's "today": the calendar date in the farm's timezone
 * (America/Sao_Paulo). Pinning the zone keeps server and browser agreeing on
 * the date regardless of where each one runs; en-CA formats as "YYYY-MM-DD".
 */
const TODAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current date as ISO "YYYY-MM-DD" in the farm's timezone. */
export function todayISO(): string {
  return TODAY_FORMATTER.format(new Date());
}

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

/** Returns today (farm timezone) as a local Date at midnight. */
export function today(): Date {
  return parseISODate(todayISO());
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
 * Age in complete months between birth and the reference date (default today).
 */
export function ageInMonths(birthIso: string, refIso: string = todayISO()): number {
  const birth = parseISODate(birthIso);
  const ref = parseISODate(refIso);
  let months =
    (ref.getFullYear() - birth.getFullYear()) * 12 + (ref.getMonth() - birth.getMonth());
  if (ref.getDate() < birth.getDate()) months -= 1;
  return months;
}

/**
 * Formats the animal age as "2a 4m", "8m" or "3a" from the birth date
 * (against refIso, default today).
 */
export function formatAge(birthIso: string, refIso: string = todayISO()): string {
  const months = ageInMonths(birthIso, refIso);
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
