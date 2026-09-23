/**
 * Defaults and parsing for the parameters cards of the report pages. Pure.
 */
import { addDays } from "@/lib/domain/dates";

/** A blank line on a document, filled in by hand. */
export const BLANK = "__________________";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for an ISO "YYYY-MM-DD" date, what a date input holds when filled. */
export function isIsoDate(text: string): boolean {
  return ISO_DATE.test(text);
}

/** 1 January of the date's year: the default "movimentação desde". */
export function yearStart(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** The 365 days up to today: the relatório técnico's default period. */
export function defaultPeriod(todayIso: string): { from: string; to: string } {
  return { from: addDays(todayIso, -365), to: todayIso };
}

/** Dots as thousands only: "4.800", "1.234.567". */
const THOUSANDS_ONLY = /^\d{1,3}(\.\d{3})+$/;

/**
 * A non-negative number typed the pt-BR way ("1.234,50", "R$ 315"), or with a
 * dot as the decimal mark when there is no comma ("315.5"). Null when empty or
 * unreadable.
 */
export function parseDecimal(text: string): number | null {
  const clean = text.replace(/R\$/g, "").replace(/\s/g, "");
  if (clean === "") return null;
  let normalized: string;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  else if (THOUSANDS_ONLY.test(clean)) normalized = clean.replace(/\./g, "");
  else normalized = clean;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
