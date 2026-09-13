/**
 * Herd reproduction rules.
 */
import type {
  Breeding,
  ReproductionRecord,
  DiagnosisResult,
  PregnancyDiagnosis,
} from "@/lib/types";
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
 * The calving forecast in words, from the days {@link daysToCalving} returns:
 * "hoje", "em 1 dia", "em N dias" — or "há N dias" once the date has passed
 * with no parto recorded. Shared by the ficha's forecast card and the
 * Reprodução rows, so the same distance reads the same on both screens.
 */
export function daysToCalvingText(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "em 1 dia";
  if (days === -1) return "há 1 dia";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
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

/** What became of one breeding: its diagnosis and the calving it still forecasts. */
export interface BreedingOutcome {
  /** "pending" when the breeding has no diagnosis. */
  result: DiagnosisResult;
  diagnosis: PregnancyDiagnosis | null;
  /** Expected calving when pregnant and the dam has not calved since the breeding. */
  expectedCalvingDate: string | null;
}

/**
 * The outcome of one breeding, whichever its position in the record: the
 * diagnosis linked to it (none counts as "pending") and, when pregnant, the
 * calving it forecasts. A calving recorded since the breeding ends the
 * forecast — the pregnancy is over, there is nothing left to expect.
 */
export function breedingOutcome(record: ReproductionRecord, breeding: Breeding): BreedingOutcome {
  const diagnosis = record.diagnoses.find((d) => d.breedingId === breeding.id) ?? null;
  const result = diagnosis?.result ?? "pending";
  const forecasts = result === "pregnant" && !hasCalvedSince(record, breeding.date);
  return {
    result,
    diagnosis,
    expectedCalvingDate: forecasts ? expectedCalvingDate(breeding.date) : null,
  };
}
