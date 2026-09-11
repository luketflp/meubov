/**
 * TypeBox primitives shared by more than one domain's request schemas.
 *
 * Mirrors the domain contracts in `lib/types.ts` (and the store input types in
 * `lib/store/useHerdStore.ts`). Dates always travel as ISO "YYYY-MM-DD"
 * strings, matching the Postgres `date` columns.
 *
 * Importing `DateString` also registers the ISO calendar-date format, so every
 * schema built on it gets leap-year validation with no extra wiring. A model
 * used by a single domain belongs in that domain's schemas/ folder, not here.
 */
import { t } from "elysia";
import { FormatRegistry } from "elysia/type-system";

const ISO_CALENDAR_DATE_FORMAT = "meubov-iso-calendar-date";
const ISO_CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_BY_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** True only for a real proleptic-Gregorian date accepted by Postgres. */
function isISOCalendarDate(value: string): boolean {
  const match = ISO_CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 && leapYear ? 29 : DAYS_BY_MONTH[month - 1];
  return day <= daysInMonth;
}

// Elysia/TypeBox formats are global; the guard keeps dev hot reload idempotent.
if (!FormatRegistry.Has(ISO_CALENDAR_DATE_FORMAT)) {
  FormatRegistry.Set(ISO_CALENDAR_DATE_FORMAT, isISOCalendarDate);
}

/** Strict ISO calendar date "YYYY-MM-DD" (including leap-year validation). */
export const DateString = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  format: ISO_CALENDAR_DATE_FORMAT,
});

/** A string containing at least one non-whitespace character. */
export const NonBlankString = t.String({ minLength: 1, pattern: "\\S" });

export const CategoryModel = t.Union([
  t.Literal("calf"),
  t.Literal("heifer"),
  t.Literal("steer"),
  t.Literal("cow"),
  t.Literal("bull"),
]);

export const SexModel = t.Union([t.Literal("male"), t.Literal("female")]);

export const TreatmentTypeModel = t.Union([
  t.Literal("vaccine"),
  t.Literal("deworming"),
  t.Literal("medication"),
  t.Literal("exam"),
]);
