/**
 * Derivation of treatment and animal status.
 */
import type { Animal, AnimalStatus, TreatmentStatus, Treatment } from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { currentDiagnosis } from "@/lib/domain/reproduction";

/** Window (in days, inclusive) in which a scheduled treatment triggers "attention". */
const ATTENTION_WINDOW_DAYS = 30;

/**
 * Identifies a foot-and-mouth campaign item by name (contains "aftosa",
 * case-insensitive). Accepts any record with `name` (treatment or health protocol).
 */
export function isFootAndMouth(item: Pick<Treatment, "name">): boolean {
  return item.name.toLocaleLowerCase("pt-BR").includes("aftosa");
}

/**
 * Treatments with derived status "scheduled" and a date within the window
 * [today, today + days] (inclusive), sorted by ascending date.
 */
export function scheduledTreatmentsInWindow(
  treatments: Treatment[],
  todayIso: string,
  days: number = ATTENTION_WINDOW_DAYS
): Treatment[] {
  return treatments
    .filter(
      (t) =>
        deriveTreatmentStatus(t, todayIso) === "scheduled" &&
        daysBetween(todayIso, t.date) <= days
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Derives the real treatment status at the reference date:
 * "done" stays done; otherwise, a date before today becomes "overdue"; otherwise "scheduled".
 */
export function deriveTreatmentStatus(t: Treatment, todayIso: string): TreatmentStatus {
  if (t.status === "done") return "done";
  if (t.date < todayIso) return "overdue";
  return "scheduled";
}

function overdueTreatments(treatments: Treatment[], todayIso: string): Treatment[] {
  return treatments.filter((t) => deriveTreatmentStatus(t, todayIso) === "overdue");
}

function upcomingTreatments(treatments: Treatment[], todayIso: string): Treatment[] {
  return treatments.filter(
    (t) =>
      deriveTreatmentStatus(t, todayIso) === "scheduled" &&
      daysBetween(todayIso, t.date) <= ATTENTION_WINDOW_DAYS
  );
}

function pendingDiagnosis(animal: Animal): boolean {
  if (animal.sex !== "female" || !animal.reproduction) return false;
  return currentDiagnosis(animal.reproduction)?.result === "pending";
}

/**
 * Derives the animal status:
 * - any treatment derived as "overdue" -> "overdue";
 * - otherwise, a scheduled treatment with a date within 30 days (inclusive) OR a female with
 *   a pending pregnancy diagnosis -> "attention";
 * - otherwise "healthy".
 */
export function deriveAnimalStatus(
  animal: Animal,
  animalTreatments: Treatment[],
  todayIso: string
): AnimalStatus {
  if (overdueTreatments(animalTreatments, todayIso).length > 0) return "overdue";
  if (
    upcomingTreatments(animalTreatments, todayIso).length > 0 ||
    pendingDiagnosis(animal)
  ) {
    return "attention";
  }
  return "healthy";
}

/** Gender suffix to agree with the treatment type. */
function overdueSuffix(t: Treatment): "atrasado" | "atrasada" {
  return t.type === "exam" ? "atrasado" : "atrasada";
}

function plural(days: number): string {
  return days === 1 ? "1 dia" : `${days} dias`;
}

/**
 * Reason (pt-BR) why the animal is not "healthy", or null if it is.
 * Priority: overdue treatment (the most overdue) > upcoming treatment
 * (the one with the nearest date) > pending pregnancy diagnosis.
 * Examples: "Vacina aftosa atrasada há 12 dias", "Vermifugação em 8 dias".
 */
export function attentionReason(
  animal: Animal,
  treatments: Treatment[],
  todayIso: string
): string | null {
  const overdue = overdueTreatments(treatments, todayIso);
  if (overdue.length > 0) {
    const mostOverdue = overdue.reduce((max, t) => (t.date < max.date ? t : max));
    const days = daysBetween(mostOverdue.date, todayIso);
    return `${mostOverdue.name} ${overdueSuffix(mostOverdue)} há ${plural(days)}`;
  }

  const upcoming = upcomingTreatments(treatments, todayIso);
  if (upcoming.length > 0) {
    const nearest = upcoming.reduce((min, t) => (t.date < min.date ? t : min));
    const days = daysBetween(todayIso, nearest.date);
    if (days === 0) return `${nearest.name} hoje`;
    return `${nearest.name} em ${plural(days)}`;
  }

  if (pendingDiagnosis(animal)) return "Diagnóstico de gestação pendente";

  return null;
}
