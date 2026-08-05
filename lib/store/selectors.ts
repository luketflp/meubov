/**
 * Pure herd selectors: stateless functions that receive slices of the
 * useHerdStore and derive UI-ready views using the domain rules.
 */
import type {
  Animal,
  Category,
  StockingRateClass,
  Lot,
  AnimalStatus,
  Treatment,
} from "@/lib/types";
import { deriveAnimalStatus, deriveTreatmentStatus, attentionReason } from "@/lib/domain/status";
import { calculateAdg } from "@/lib/domain/adg";
import { kgToArroba, currentWeight, totalWeightKg } from "@/lib/domain/weights";
import { classifyStockingRate, stockingRateAuPerHa, totalAu } from "@/lib/domain/stocking";

/** Animal with the derived indicators shown in lists and records. */
export interface AnimalWithDerived {
  animal: Animal;
  status: AnimalStatus;
  reason: string | null;
  currentWeightKg: number | null;
  arrobas: number | null;
  adg: number | null;
}

/** Lot with the occupancy summary used on the paddock screen. */
export interface LotWithSummary {
  lot: Lot;
  headCount: number;
  totalWeightKg: number;
  auPerHa: number;
  classification: StockingRateClass;
}

const STATUS_ORDER: Record<AnimalStatus, number> = { overdue: 0, attention: 1, healthy: 2 };

const compareDate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Only the active animals (excludes sold/removed). */
export function activeAnimals(animals: Animal[]): Animal[] {
  return animals.filter((a) => a.active);
}

/** Finds an animal by ear tag, or undefined if it does not exist. */
export function animalByEarTag(animals: Animal[], earTag: string): Animal | undefined {
  return animals.find((a) => a.earTag === earTag);
}

/** Finds an animal by its stable internal identifier. */
export function animalById(animals: Animal[], id: string): Animal | undefined {
  return animals.find((animal) => animal.id === id);
}

/** Treatments linked to the given ear tag. */
export function animalTreatments(treatments: Treatment[], earTag: string): Treatment[] {
  return treatments.filter((t) => t.animalEarTag === earTag);
}

/** Derives status, reason, current weight, arrobas and ADG for each received animal. */
export function withStatus(
  animals: Animal[],
  treatments: Treatment[],
  todayIso: string
): AnimalWithDerived[] {
  return animals.map((animal) => {
    const forAnimal = animalTreatments(treatments, animal.earTag);
    const currentWeightKg = currentWeight(animal);
    return {
      animal,
      status: deriveAnimalStatus(animal, forAnimal, todayIso),
      reason: attentionReason(animal, forAnimal, todayIso),
      currentWeightKg,
      arrobas: currentWeightKg === null ? null : kgToArroba(currentWeightKg),
      adg: calculateAdg(animal.weighings),
    };
  });
}

/** Count by category of the received animals (pass the desired slice, e.g.: active). */
export function countByCategory(animals: Animal[]): Record<Category, number> {
  const count: Record<Category, number> = { calf: 0, heifer: 0, steer: 0, cow: 0, bull: 0 };
  for (const a of animals) count[a.category] += 1;
  return count;
}

/** Animals that require action (not healthy), with the overdue ones first. */
export function animalsNeedingAttention(
  animals: Animal[],
  treatments: Treatment[],
  todayIso: string
): AnimalWithDerived[] {
  return withStatus(animals, treatments, todayIso)
    .filter((d) => d.status !== "healthy")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/** Treatments with a derived status other than "done", sorted by date. */
export function pendingTreatments(treatments: Treatment[], todayIso: string): Treatment[] {
  return treatments
    .filter((t) => deriveTreatmentStatus(t, todayIso) !== "done")
    .sort((a, b) => compareDate(a.date, b.date));
}

/** Treatments of the given month (month 1-12), sorted by date. */
export function treatmentsInMonth(treatments: Treatment[], year: number, month: number): Treatment[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return treatments
    .filter((t) => t.date.startsWith(prefix))
    .sort((a, b) => compareDate(a.date, b.date));
}

/** Occupancy summary per lot, considering only the active animals. */
export function lotsWithSummary(lots: Lot[], animals: Animal[]): LotWithSummary[] {
  return lots.map((lot) => {
    const inLot = activeAnimals(animals).filter((a) => a.lotId === lot.id);
    const auPerHa = stockingRateAuPerHa(inLot, lot.hectares);
    return {
      lot,
      headCount: inLot.length,
      totalWeightKg: totalWeightKg(inLot),
      auPerHa,
      classification: classifyStockingRate(auPerHa),
    };
  });
}

/**
 * Aggregate herd stocking rate in AU/ha: the summed Animal Units of every ACTIVE
 * animal over the total hectares of all lots. Returns 0 when there are no hectares.
 * Pure: derives the whole-herd density used by the panel's "Lotação" KPI.
 */
export function herdStockingRateAuPerHa(animals: Animal[], lots: Lot[]): number {
  const totalHectares = lots.reduce((sum, lot) => sum + lot.hectares, 0);
  if (totalHectares <= 0) return 0;
  return totalAu(activeAnimals(animals)) / totalHectares;
}
