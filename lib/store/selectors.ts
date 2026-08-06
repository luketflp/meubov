/**
 * Pure herd selectors: stateless functions that receive slices of the
 * useHerdStore and derive UI-ready views using the domain rules.
 */
import type {
  Animal,
  Category,
  Invernada,
  StockingRateClass,
  Lot,
  LotPlacement,
  AnimalStatus,
  ManejoSession,
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

/** Logical animal group with its current physical placement, when assigned. */
export interface LotWithSummary {
  lot: Lot;
  headCount: number;
  totalWeightKg: number;
  currentPlacement: LotPlacement | null;
  currentInvernada: Invernada | null;
}

/** Physical pasture with all logical lots currently occupying it. */
export interface InvernadaWithSummary {
  invernada: Invernada;
  lots: Lot[];
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

/**
 * The current placement of a lot. Historical placements have an `endedOn`;
 * in the unlikely event of malformed input with two open rows, the newest one
 * wins deterministically.
 */
export function currentPlacementForLot(
  lotId: string,
  placements: LotPlacement[]
): LotPlacement | null {
  let current: LotPlacement | null = null;
  for (const placement of placements) {
    if (placement.lotId !== lotId || placement.endedOn != null) continue;
    if (current === null || compareDate(current.startedOn, placement.startedOn) < 0) {
      current = placement;
    }
  }
  return current;
}

/**
 * Whether a logical lot can still be hard-deleted (a mistaken/never-used
 * registration). Mirrors the server's removeLot guards so the UI only offers a
 * deletion that can succeed: any animal reference (active or inactive), any
 * manejo reference, or movement history (two or more placements) makes the lot
 * permanent — archive it instead.
 */
export function isLotDeletable(
  lotId: string,
  animals: Animal[],
  manejoSessions: ManejoSession[],
  placements: LotPlacement[]
): boolean {
  if (animals.some((animal) => animal.lotId === lotId)) return false;
  const referenced = manejoSessions.some(
    (session) =>
      session.destinationLotId === lotId ||
      session.animals.some((entry) => entry.previousLotId === lotId)
  );
  if (referenced) return false;
  let placementCount = 0;
  for (const placement of placements) {
    if (placement.lotId === lotId && ++placementCount > 1) return false;
  }
  return true;
}

/** Logical lots with an open placement, eligible for new animal assignments. */
export function currentlyPlacedLots(
  lots: Lot[],
  placements: LotPlacement[]
): Lot[] {
  const placedLotIds = new Set(
    placements
      .filter((placement) => placement.endedOn == null)
      .map((placement) => placement.lotId)
  );
  return lots.filter((lot) => placedLotIds.has(lot.id));
}

/** Summary per logical animal group, considering only active animals. */
export function lotsWithSummary(
  lots: Lot[],
  animals: Animal[],
  invernadas: Invernada[],
  placements: LotPlacement[]
): LotWithSummary[] {
  const invernadaById = new Map(invernadas.map((invernada) => [invernada.id, invernada]));
  const activeByLot = new Map<string, Animal[]>();
  for (const animal of activeAnimals(animals)) {
    const forLot = activeByLot.get(animal.lotId);
    if (forLot) forLot.push(animal);
    else activeByLot.set(animal.lotId, [animal]);
  }

  return lots.map((lot) => {
    const inLot = activeByLot.get(lot.id) ?? [];
    const currentPlacement = currentPlacementForLot(lot.id, placements);
    return {
      lot,
      headCount: inLot.length,
      totalWeightKg: totalWeightKg(inLot),
      currentPlacement,
      currentInvernada:
        currentPlacement === null
          ? null
          : (invernadaById.get(currentPlacement.invernadaId) ?? null),
    };
  });
}

/**
 * Occupancy per physical invernada. Animals arrive through their logical lot's
 * current open placement; historical placements never affect current density.
 */
export function invernadasWithSummary(
  invernadas: Invernada[],
  lots: Lot[],
  placements: LotPlacement[],
  animals: Animal[]
): InvernadaWithSummary[] {
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const invernadaIdByLotId = new Map<string, string>();
  for (const lot of lots) {
    const placement = currentPlacementForLot(lot.id, placements);
    if (placement) invernadaIdByLotId.set(lot.id, placement.invernadaId);
  }

  const lotsByInvernadaId = new Map<string, Lot[]>();
  for (const [lotId, invernadaId] of invernadaIdByLotId) {
    const lot = lotById.get(lotId);
    if (!lot) continue;
    const occupyingLots = lotsByInvernadaId.get(invernadaId);
    if (occupyingLots) occupyingLots.push(lot);
    else lotsByInvernadaId.set(invernadaId, [lot]);
  }

  const animalsByInvernadaId = new Map<string, Animal[]>();
  for (const animal of activeAnimals(animals)) {
    const invernadaId = invernadaIdByLotId.get(animal.lotId);
    if (!invernadaId) continue;
    const occupyingAnimals = animalsByInvernadaId.get(invernadaId);
    if (occupyingAnimals) occupyingAnimals.push(animal);
    else animalsByInvernadaId.set(invernadaId, [animal]);
  }

  return invernadas.map((invernada) => {
    const occupyingAnimals = animalsByInvernadaId.get(invernada.id) ?? [];
    const auPerHa = stockingRateAuPerHa(occupyingAnimals, invernada.hectares);
    return {
      invernada,
      lots: lotsByInvernadaId.get(invernada.id) ?? [],
      headCount: occupyingAnimals.length,
      totalWeightKg: totalWeightKg(occupyingAnimals),
      auPerHa,
      classification: classifyStockingRate(auPerHa),
    };
  });
}

/**
 * Aggregate herd stocking rate in AU/ha: the summed Animal Units of every ACTIVE
 * animal over the total hectares of all invernadas. Returns 0 when there are no hectares.
 * Pure: derives the whole-herd density used by the panel's "Lotação" KPI.
 */
export function herdStockingRateAuPerHa(animals: Animal[], invernadas: Invernada[]): number {
  const totalHectares = invernadas.reduce(
    (sum, invernada) => sum + invernada.hectares,
    0
  );
  if (totalHectares <= 0) return 0;
  return totalAu(activeAnimals(animals)) / totalHectares;
}
