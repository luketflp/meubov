/**
 * Herd reproduction rules.
 */
import type { Breeding, ReproductionRecord, DiagnosisResult } from "@/lib/types";
import { addDays, daysBetween } from "@/lib/domain/dates";

/** Average bovine gestation duration, in days. */
export const GESTATION_DAYS = 283;

/** Expected calving date: breeding date + 283 days. */
export function expectedCalvingDate(breedingIso: string): string {
  return addDays(breedingIso, GESTATION_DAYS);
}

/**
 * Current reproductive situation: the latest breeding by date and the result of its
 * diagnosis (a breeding without a diagnosis counts as "pending").
 * Returns null if the record has no breedings.
 */
export function currentDiagnosis(
  record: ReproductionRecord
): { breeding: Breeding; result: DiagnosisResult } | null {
  if (record.breedings.length === 0) return null;
  const latest = record.breedings.reduce((mostRecent, b) =>
    b.date > mostRecent.date ? b : mostRecent
  );
  const diagnosis = record.diagnoses.find((d) => d.breedingId === latest.id);
  return { breeding: latest, result: diagnosis?.result ?? "pending" };
}

/** Days remaining until the expected calving (negative if the date has already passed). */
export function daysToCalving(expectedIso: string, todayIso: string): number {
  return daysBetween(todayIso, expectedIso);
}

/**
 * Breedings that still have no diagnosis, most recent first — the ones waiting
 * for the vet. The diagnosis form defaults to the first of this list.
 */
export function breedingsAwaitingDiagnosis(record: ReproductionRecord): Breeding[] {
  const diagnosed = new Set(record.diagnoses.map((d) => d.breedingId));
  return record.breedings
    .filter((b) => !diagnosed.has(b.id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * True when a calving was already recorded on or after the breeding date — the
 * pregnancy ended. Without this a "pregnant" diagnosis would keep forecasting a
 * calving that already happened.
 */
export function hasCalvedSince(record: ReproductionRecord, breedingIso: string): boolean {
  return record.calvings.some((c) => c.date >= breedingIso);
}
