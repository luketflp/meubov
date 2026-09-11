/**
 * Pure herd selectors: stateless functions that receive slices of the
 * useHerdStore and derive UI-ready views using the domain rules.
 */
import type {
  Animal,
  Breeding,
  Category,
  HerdData,
  Invernada,
  StockingRateClass,
  Lot,
  LotPlacement,
  AnimalStatus,
  ManejoSession,
  Treatment,
  TreatmentType,
} from "@/lib/types";
import { deriveAnimalStatus, deriveTreatmentStatus, attentionReason } from "@/lib/domain/status";
import { breedingOutcome, type BreedingOutcome } from "@/lib/domain/reproduction";
import { calculateAdg, herdAdgSamples } from "@/lib/domain/adg";
import { ageInMonths, daysBetween } from "@/lib/domain/dates";
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

/** A calving joined to both animals it involves, for the Nascimentos screen. */
export interface Birth {
  /** Stable list key: calvings have no id of their own. */
  key: string;
  /** The calving date, which is also the calf's birth date. */
  date: string;
  dam: Animal;
  calfEarTag: string;
  /** The calf in the herd, or null when its ear tag no longer resolves. */
  calf: Animal | null;
  /** Weight taken on the day of birth, when one was recorded. */
  birthWeightKg: number | null;
}

/** Which outcomes the Coberturas screen shows; "all" keeps every breeding. */
export type BreedingFilter = "all" | "pending" | "pregnant" | "open";

/** A breeding joined to both animals it involves, for the Coberturas screen. */
export interface BreedingRow {
  /** Stable list key: the breeding id. */
  key: string;
  breeding: Breeding;
  dam: Animal;
  /** The bull when its ear tag resolves to a herd animal; null for an external bull or a semen code. */
  bull: Animal | null;
  outcome: BreedingOutcome;
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

/** One placement of a lot as the ficha lists it: where, and for how long. */
export interface LotPlacementRow {
  placement: LotPlacement;
  invernada: Invernada | null;
  /** Days the lot spent there: (endedOn ?? today) − startedOn. */
  days: number;
}

/** The next scheduled treatment of a lot, grouped like a manejo activity. */
export interface LotNextActivity {
  date: string;
  type: TreatmentType;
  name: string;
  /** Animals of the lot booked on that same date/type/name. */
  heads: number;
}

/** Grazing pressure of the invernada a lot stands on. */
export interface LotStocking {
  /** Density of the current invernada with every lot on it (invernadasWithSummary). */
  auPerHa: number;
  classification: StockingRateClass;
  /** The other active lots sharing the invernada right now. */
  otherLots: Lot[];
}

/** Everything the ficha of a lote shows, derived from the snapshot. */
export interface LotSummary {
  lot: Lot;
  /** Active animals of the lot. */
  animals: Animal[];
  heads: number;
  byCategory: Record<Category, number>;
  /** Active animals with at least one weighing. */
  weighedHeads: number;
  totalWeightKg: number;
  totalArrobas: number;
  totalAu: number;
  /** Newest weighing date across the active animals, or null. */
  lastWeighingDate: string | null;
  /** totalWeightKg / weighedHeads, or null when nobody was weighed. */
  avgWeightKg: number | null;
  avgLiveArrobas: number | null;
  /** Mean age in complete months, floored; null with no animals. */
  avgAgeMonths: number | null;
  /** herdAverageAdg over the lot's animals (120-day window). */
  adg: number | null;
  /** How many animals that mean covers (herdAdgSamples length). */
  adgHeads: number;
  currentPlacement: LotPlacement | null;
  currentInvernada: Invernada | null;
  /** Days since the open placement started, or null when closed. */
  daysInInvernada: number | null;
  stocking: LotStocking | null;
  /** Every placement of the lot, newest first (startedOn desc, then id). */
  placements: LotPlacementRow[];
  health: { healthy: number; attention: number; overdue: number };
  /** Earliest scheduled (not overdue, not done) treatment among the lot's animals. */
  nextActivity: LotNextActivity | null;
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

/** Lots the farmer still has: a deleted one only survives to name history. */
export function activeLots(lots: Lot[]): Lot[] {
  return lots.filter((lot) => lot.deletedAt == null);
}

/**
 * Whether a logical lot can be deleted right now. Mirrors the server's
 * removeLot guards so the UI only offers a deletion that can succeed: live
 * animals in the lot, or an open manejo session heading into it, would be
 * stranded on a group the farmer can no longer see. History (past placements,
 * closed manejos, sold animals) never blocks the deletion — the row stays
 * behind for it.
 */
export function canDeleteLot(
  lotId: string,
  animals: Animal[],
  manejoSessions: ManejoSession[]
): boolean {
  if (activeAnimals(animals).some((animal) => animal.lotId === lotId)) {
    return false;
  }
  return !manejoSessions.some(
    (session) => session.status === "open" && session.destinationLotId === lotId
  );
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
  return activeLots(lots).filter((lot) => placedLotIds.has(lot.id));
}

/**
 * Summary per logical animal group, considering only active animals. Deleted
 * lots are left out: the /lots page is the farmer's list of groups they have.
 */
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

  return activeLots(lots).map((lot) => {
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
  const present = activeLots(lots);
  const lotById = new Map(present.map((lot) => [lot.id, lot]));
  const invernadaIdByLotId = new Map<string, string>();
  for (const lot of present) {
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
 * Everything the ficha of a lote shows, derived from the snapshot: only the
 * ACTIVE animals count, the stocking is the whole invernada's (every lot on
 * it), and the health calendar is read the way the ficha of an animal reads
 * it. Null for a lot that does not exist or was deleted — the page shows
 * "não encontrado" instead of a ghost group.
 */
export function lotSummary(
  lotId: string,
  state: Pick<HerdData, "lots" | "animals" | "treatments" | "invernadas" | "lotPlacements">,
  todayIso: string
): LotSummary | null {
  const lot = state.lots.find((item) => item.id === lotId);
  if (!lot || lot.deletedAt != null) return null;

  const animals = activeAnimals(state.animals).filter((animal) => animal.lotId === lotId);
  const heads = animals.length;
  const weighedHeads = animals.filter((animal) => currentWeight(animal) !== null).length;
  const totalKg = totalWeightKg(animals);
  let lastWeighingDate: string | null = null;
  for (const animal of animals) {
    for (const weighing of animal.weighings) {
      if (lastWeighingDate === null || compareDate(lastWeighingDate, weighing.date) < 0) {
        lastWeighingDate = weighing.date;
      }
    }
  }
  const avgWeightKg = weighedHeads > 0 ? totalKg / weighedHeads : null;
  const avgAgeMonths =
    heads === 0
      ? null
      : Math.floor(
          animals.reduce((sum, animal) => sum + ageInMonths(animal.birthDate, todayIso), 0) /
            heads
        );
  const adgSamples = herdAdgSamples(animals, todayIso);
  const adg =
    adgSamples.length === 0
      ? null
      : adgSamples.reduce((sum, value) => sum + value, 0) / adgSamples.length;

  const invernadaById = new Map(state.invernadas.map((invernada) => [invernada.id, invernada]));
  const currentPlacement = currentPlacementForLot(lotId, state.lotPlacements);
  const currentInvernada = currentPlacement
    ? (invernadaById.get(currentPlacement.invernadaId) ?? null)
    : null;

  let stocking: LotStocking | null = null;
  if (currentInvernada) {
    const occupancy = invernadasWithSummary(
      state.invernadas,
      state.lots,
      state.lotPlacements,
      state.animals
    ).find((item) => item.invernada.id === currentInvernada.id);
    if (occupancy) {
      stocking = {
        auPerHa: occupancy.auPerHa,
        classification: occupancy.classification,
        otherLots: occupancy.lots.filter((item) => item.id !== lotId),
      };
    }
  }

  const placements: LotPlacementRow[] = state.lotPlacements
    .filter((placement) => placement.lotId === lotId)
    .sort((a, b) => compareDate(b.startedOn, a.startedOn) || a.id.localeCompare(b.id))
    .map((placement) => ({
      placement,
      invernada: invernadaById.get(placement.invernadaId) ?? null,
      days: daysBetween(placement.startedOn, placement.endedOn ?? todayIso),
    }));

  const health = { healthy: 0, attention: 0, overdue: 0 };
  for (const item of withStatus(animals, state.treatments, todayIso)) {
    health[item.status] += 1;
  }

  const earTags = new Set(animals.map((animal) => animal.earTag));
  const scheduled = state.treatments
    .filter(
      (treatment) =>
        earTags.has(treatment.animalEarTag) &&
        deriveTreatmentStatus(treatment, todayIso) === "scheduled"
    )
    .sort(
      (a, b) =>
        compareDate(a.date, b.date) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    );
  const first = scheduled[0];
  const nextActivity: LotNextActivity | null = first
    ? {
        date: first.date,
        type: first.type,
        name: first.name,
        heads: scheduled.filter(
          (treatment) =>
            treatment.date === first.date &&
            treatment.type === first.type &&
            treatment.name === first.name
        ).length,
      }
    : null;

  return {
    lot,
    animals,
    heads,
    byCategory: countByCategory(animals),
    weighedHeads,
    totalWeightKg: totalKg,
    totalArrobas: kgToArroba(totalKg),
    totalAu: totalAu(animals),
    lastWeighingDate,
    avgWeightKg,
    avgLiveArrobas: avgWeightKg === null ? null : kgToArroba(avgWeightKg),
    avgAgeMonths,
    adg,
    adgHeads: adgSamples.length,
    currentPlacement,
    currentInvernada,
    daysInInvernada: currentPlacement ? daysBetween(currentPlacement.startedOn, todayIso) : null,
    stocking,
    placements,
    health,
    nextActivity,
  };
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

/**
 * One calving as the Nascimentos screen shows it: the dam's record, the calf's
 * when the ear tag still resolves, and the weight taken on the day of birth.
 */
export function recentBirths(animals: Animal[]): Birth[] {
  const byEarTag = new Map(animals.map((animal) => [animal.earTag, animal]));
  return animals
    .flatMap((dam) =>
      (dam.reproduction?.calvings ?? []).map((calving) => {
        const calf = byEarTag.get(calving.calfEarTag) ?? null;
        // The birth weight is the weighing dated the calving itself — a later
        // weighing of the same calf is growth, not how it was born.
        const birthWeighing = calf?.weighings.find((w) => w.date === calving.date);
        return {
          key: `${dam.id}-${calving.date}-${calving.calfEarTag}`,
          date: calving.date,
          dam,
          calfEarTag: calving.calfEarTag,
          calf,
          birthWeightKg: birthWeighing?.weightKg ?? null,
        };
      })
    )
    .sort(
      (a, b) =>
        compareDate(b.date, a.date) || a.calfEarTag.localeCompare(b.calfEarTag)
    );
}

/**
 * Every breeding on the farm as the Coberturas screen shows it: the dam's
 * record, the bull's when the ear tag resolves, and the outcome of the
 * breeding. Newest first, then by dam ear tag so a batch of IATF on the same
 * day reads in a stable order.
 */
export function recentBreedings(animals: Animal[]): BreedingRow[] {
  const byEarTag = new Map(animals.map((animal) => [animal.earTag, animal]));
  return animals
    .flatMap((dam) => {
      const record = dam.reproduction;
      if (!record) return [];
      return record.breedings.map((breeding) => ({
        key: breeding.id,
        breeding,
        dam,
        bull: byEarTag.get(breeding.bullEarTag) ?? null,
        outcome: breedingOutcome(record, breeding),
      }));
    })
    .sort(
      (a, b) =>
        compareDate(b.breeding.date, a.breeding.date) ||
        a.dam.earTag.localeCompare(b.dam.earTag)
    );
}

/** Rows whose outcome matches the filter; "all" keeps everything. */
export function filterBreedings(rows: BreedingRow[], filter: BreedingFilter): BreedingRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) => row.outcome.result === filter);
}
