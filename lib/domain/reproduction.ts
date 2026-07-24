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
