/**
 * Write path — farm settings: breeds, logical lots, physical invernadas, farm
 * data and health protocols.
 * All functions are farm-scoped; ids are server-generated uuids.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  animals,
  breeds,
  farm,
  healthProtocols,
  invernadas,
  lotPlacements,
  lots,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
} from "@/lib/db/schema";
import type {
  FarmData,
  HealthProtocol,
  Invernada,
  Lot,
  LotPlacement,
  Treatment,
} from "@/lib/types";
import { addDays, todayISO } from "@/lib/domain/dates";
import { isUsableRing, normalizeRing } from "@/lib/domain/geo";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import {
  toInvernada,
  toLot,
  toLotPlacement,
  toProtocol,
  toTreatment,
} from "@/lib/api/services/mappers";

/** Days between today and the scheduled date when generating a protocol schedule. */
const DAYS_UNTIL_SCHEDULE = 14;

/** Registers a breed; idempotent (re-adding an existing name is a no-op). */
export async function addBreed(farmId: number, name: string): Promise<void> {
  await db.insert(breeds).values({ farmId, name }).onConflictDoNothing();
}

/** Removes a breed; false when an active animal still uses it. */
export async function removeBreed(farmId: number, name: string): Promise<boolean> {
  const inUse = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.breed, name), eq(animals.active, true)))
    .limit(1);
  if (inUse.length > 0) return false;
  await db.delete(breeds).where(and(eq(breeds.farmId, farmId), eq(breeds.name, name)));
  return true;
}

/**
 * Canonical outline to store, or `"invalid"` when the ring is not a pasture.
 *
 * TypeBox already enforced shape, vertex count and coordinate ranges; what is
 * left is what JSON Schema cannot express — a ring that crosses itself or has
 * no enclosed area.
 */
function sanitizeBoundary(
  boundary: [number, number][]
): [number, number][] | "invalid" {
  const ring = normalizeRing(boundary);
  if (!isUsableRing(ring)) return "invalid";
  return ring;
}

/** Rejected because the outline is not a usable pasture ring. */
export type InvalidBoundary = "invalid_boundary";

/** Result returned when a logical lot is created in its initial invernada. */
export interface CreateLotResult {
  lot: Lot;
  placement: LotPlacement;
}

export type CreateLotError =
  | "invernada_not_found"
  | "invalid_name"
  | "duplicate_name";

/** Creates a logical lot and its current placement in one transaction. */
export async function addLot(
  farmId: number,
  input: { name: string; invernadaId: string }
): Promise<CreateLotResult | CreateLotError> {
  const name = input.name.trim();
  if (!name) return "invalid_name";

  return db.transaction(async (tx) => {
    // Serializes name-based creation with bulk imports for this farm. Logical
    // lot names are user-facing identifiers in the spreadsheet import.
    await tx
      .select({ id: farm.id })
      .from(farm)
      .where(eq(farm.id, farmId))
      .for("update");

    const [existing] = await tx
      .select({ id: lots.id })
      .from(lots)
      .where(and(eq(lots.farmId, farmId), eq(lots.name, name)))
      .limit(1);
    if (existing) return "duplicate_name";

    const [destination] = await tx
      .select({ id: invernadas.id })
      .from(invernadas)
      .where(
        and(
          eq(invernadas.farmId, farmId),
          eq(invernadas.id, input.invernadaId)
        )
      )
      .for("key share")
      .limit(1);
    if (!destination) return "invernada_not_found";

    const [lotRow] = await tx
      .insert(lots)
      .values({ id: randomUUID(), farmId, name, needsReview: false })
      .returning();
    const [placementRow] = await tx
      .insert(lotPlacements)
      .values({
        id: randomUUID(),
        farmId,
        lotId: lotRow.id,
        invernadaId: destination.id,
        startedOn: todayISO(),
        baseline: false,
      })
      .returning();

    return { lot: toLot(lotRow), placement: toLotPlacement(placementRow) };
  });
}

/** Editable registration fields of a logical lot. */
export interface LotPatchInput {
  name?: string;
  needsReview?: boolean;
}

/**
 * Updates a logical lot's registration fields, farm-scoped.
 * `null` when no lot of this farm carries that id (a lot of another farm is
 * indistinguishable from a missing one, on purpose), `"empty_patch"` when the
 * caller sent no field, and `"invalid_name"` for whitespace-only names.
 */
export async function updateLot(
  farmId: number,
  id: string,
  patch: LotPatchInput
): Promise<Lot | null | "empty_patch" | "invalid_name" | "duplicate_name"> {
  const set: Partial<typeof lots.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return "invalid_name";
    set.name = name;
  }
  if (patch.needsReview !== undefined) set.needsReview = patch.needsReview;
  if (Object.keys(set).length === 0) return "empty_patch";

  return db.transaction(async (tx) => {
    if (set.name !== undefined) {
      await tx
        .select({ id: farm.id })
        .from(farm)
        .where(eq(farm.id, farmId))
        .for("update");
      const [duplicate] = await tx
        .select({ id: lots.id })
        .from(lots)
        .where(
          and(
            eq(lots.farmId, farmId),
            eq(lots.name, set.name),
            ne(lots.id, id)
          )
        )
        .limit(1);
      if (duplicate) return "duplicate_name";
    }

    const [row] = await tx
      .update(lots)
      .set(set)
      .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
      .returning();
    return row ? toLot(row) : null;
  });
}

/**
 * Removes a mistaken/never-used lot atomically. One initial placement is
 * recoverable setup data and is deleted with it; two or more placements are
 * movement history and make the lot permanent. Any animal reference, active or
 * inactive, also preserves the lot.
 */
export async function removeLot(farmId: number, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lot] = await tx
      .select({ id: lots.id })
      .from(lots)
      .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
      .for("update");
    // Preserve the endpoint's idempotent success contract for an already-gone
    // farm-scoped id; another farm's row remains indistinguishable from it.
    if (!lot) return true;

    const [animalRef] = await tx
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.lotId, id)))
      .limit(1);
    if (animalRef) return false;

    const [destinationSessionRef] = await tx
      .select({ id: manejoSessions.id })
      .from(manejoSessions)
      .where(
        and(
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessions.destinationLotId, id)
        )
      )
      .limit(1);
    if (destinationSessionRef) return false;

    const [previousLotRef] = await tx
      .select({ sessionId: manejoSessionAnimals.sessionId })
      .from(manejoSessionAnimals)
      .innerJoin(
        manejoSessions,
        eq(manejoSessionAnimals.sessionId, manejoSessions.id)
      )
      .where(
        and(
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessionAnimals.previousLotId, id)
        )
      )
      .limit(1);
    if (previousLotRef) return false;

    const placementRows = await tx
      .select({ id: lotPlacements.id })
      .from(lotPlacements)
      .where(and(eq(lotPlacements.farmId, farmId), eq(lotPlacements.lotId, id)))
      .limit(2)
      .for("update");
    if (placementRows.length > 1) return false;

    if (placementRows.length === 1) {
      await tx
        .delete(lotPlacements)
        .where(eq(lotPlacements.id, placementRows[0].id));
    }
    await tx.delete(lots).where(and(eq(lots.farmId, farmId), eq(lots.id, id)));
    return true;
  });
}

/** New physical pasture fields (the id is generated by the server). */
export interface NewInvernadaInput {
  code: string;
  name?: string;
  grass: string;
  hectares: number;
  boundary?: [number, number][];
}

export type InvernadaWriteError =
  | InvalidBoundary
  | "duplicate_code"
  | "invalid_code"
  | "invalid_grass"
  | "invalid_name";

/** Creates one farm-scoped physical invernada. */
export async function addInvernada(
  farmId: number,
  input: NewInvernadaInput
): Promise<Invernada | InvernadaWriteError> {
  const code = input.code.trim();
  const name = input.name?.trim();
  const grass = input.grass.trim();
  if (!code || code.toUpperCase().startsWith("LEGACY-")) return "invalid_code";
  if (!grass) return "invalid_grass";
  if (input.name !== undefined && !name) return "invalid_name";

  let boundary: [number, number][] | undefined;
  if (input.boundary !== undefined) {
    const sanitized = sanitizeBoundary(input.boundary);
    if (sanitized === "invalid") return "invalid_boundary";
    boundary = sanitized;
  }

  try {
    const [row] = await db
      .insert(invernadas)
      .values({
        id: randomUUID(),
        farmId,
        code,
        name,
        grass,
        hectares: input.hectares,
        boundary,
      })
      .returning();
    return toInvernada(row);
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate_code";
    throw error;
  }
}

/** Editable physical-pasture fields; null clears optional values. */
export interface InvernadaPatchInput {
  /** One-time correction of a LEGACY-* code synthesized at cutover. */
  code?: string;
  name?: string | null;
  grass?: string;
  hectares?: number;
  boundary?: [number, number][] | null;
}

export type InvernadaUpdateError =
  | InvalidBoundary
  | "duplicate_code"
  | "immutable_code"
  | "invalid_code"
  | "invalid_grass"
  | "invalid_name"
  | "empty_patch"
  | "not_found";

/** Updates one physical invernada and returns its complete domain shape. */
export async function updateInvernada(
  farmId: number,
  id: string,
  patch: InvernadaPatchInput
): Promise<Invernada | InvernadaUpdateError> {
  const set: Partial<typeof invernadas.$inferInsert> = {};
  const code = patch.code?.trim();
  if (
    patch.code !== undefined &&
    (!code || code.toUpperCase().startsWith("LEGACY-"))
  ) {
    return "invalid_code";
  }
  if (patch.name !== undefined) {
    if (patch.name === null) {
      set.name = null;
    } else {
      const name = patch.name.trim();
      if (!name) return "invalid_name";
      set.name = name;
    }
  }
  if (patch.grass !== undefined) {
    const grass = patch.grass.trim();
    if (!grass) return "invalid_grass";
    set.grass = grass;
  }
  if (patch.hectares !== undefined) set.hectares = patch.hectares;
  if (patch.boundary !== undefined) {
    if (patch.boundary === null) {
      set.boundary = null;
    } else {
      const sanitized = sanitizeBoundary(patch.boundary);
      if (sanitized === "invalid") return "invalid_boundary";
      set.boundary = sanitized;
    }
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(invernadas)
      .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)))
      .for("update");
    if (!current) return "not_found";

    if (code !== undefined && code !== current.code) {
      if (!current.code.startsWith("LEGACY-")) return "immutable_code";
      set.code = code;
    }
    if (Object.keys(set).length === 0) return "empty_patch";

    try {
      const [row] = await tx
        .update(invernadas)
        .set(set)
        .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)))
        .returning();
      return toInvernada(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate_code";
      throw error;
    }
  });
}

export type RemoveInvernadaResult = Invernada | "not_found" | "in_use";

/** Deletes only an invernada with no placement history. */
export async function removeInvernada(
  farmId: number,
  id: string
): Promise<RemoveInvernadaResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(invernadas)
      .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)))
      .for("update");
    if (!row) return "not_found";

    const [placement] = await tx
      .select({ id: lotPlacements.id })
      .from(lotPlacements)
      .where(
        and(
          eq(lotPlacements.farmId, farmId),
          eq(lotPlacements.invernadaId, id)
        )
      )
      .limit(1);
    if (placement) return "in_use";

    await tx
      .delete(invernadas)
      .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)));
    return toInvernada(row);
  });
}

/** Request fields for a whole-lot rotation. */
export interface MoveLotInput {
  invernadaId: string;
  startedOn: string;
  notes?: string;
}

/** Response the store can merge without reloading the whole herd. */
export interface MoveLotResult {
  lot: Lot;
  placement: LotPlacement;
  previousPlacement: LotPlacement;
}

export type MoveLotError =
  | "lot_not_found"
  | "invernada_not_found"
  | "placement_not_found"
  | "same_destination"
  | "future_date"
  | "nonmonotonic_date";

/** Result returned after closing a logical lot's current placement. */
export interface ArchiveLotResult {
  lot: Lot;
  previousPlacement: LotPlacement;
}

export type ArchiveLotError =
  | "lot_not_found"
  | "lot_occupied"
  | "placement_not_found"
  | "future_date"
  | "nonmonotonic_date";

/**
 * Archives a logical lot by closing its only open placement. A lot is active
 * exactly while that placement exists; no independent lifecycle flag can drift
 * out of sync. The lot and placement locks serialize archives with rotations
 * and deletion.
 */
export async function archiveLot(
  farmId: number,
  id: string,
  endedOn: string
): Promise<ArchiveLotResult | ArchiveLotError> {
  if (endedOn > todayISO()) return "future_date";

  return db.transaction(async (tx) => {
    const [lotRow] = await tx
      .select()
      .from(lots)
      .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
      .for("update");
    if (!lotRow) return "lot_not_found";

    const [occupied] = await tx
      .select({ id: animals.id })
      .from(animals)
      .where(
        and(
          eq(animals.farmId, farmId),
          eq(animals.lotId, lotRow.id),
          eq(animals.active, true)
        )
      )
      .limit(1);
    if (occupied) return "lot_occupied";

    // An open entry/transfer session may not have produced an animal yet, but
    // it has already reserved this logical lot as its destination. Closing the
    // lot now would strand that in-progress manejo.
    const [openDestinationSession] = await tx
      .select({ id: manejoSessions.id })
      .from(manejoSessions)
      .where(
        and(
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessions.destinationLotId, lotRow.id),
          eq(manejoSessions.status, "open")
        )
      )
      .limit(1);
    if (openDestinationSession) return "lot_occupied";

    const [current] = await tx
      .select()
      .from(lotPlacements)
      .where(
        and(
          eq(lotPlacements.farmId, farmId),
          eq(lotPlacements.lotId, lotRow.id),
          isNull(lotPlacements.endedOn)
        )
      )
      .for("update");
    if (!current) return "placement_not_found";
    if (endedOn <= current.startedOn) return "nonmonotonic_date";

    const [closedRow] = await tx
      .update(lotPlacements)
      .set({ endedOn })
      .where(eq(lotPlacements.id, current.id))
      .returning();
    return {
      lot: toLot(lotRow),
      previousPlacement: toLotPlacement(closedRow),
    };
  });
}

/**
 * Moves a whole logical lot atomically. Locking the lot serializes competing
 * devices even before the current placement row is read; the partial unique
 * index remains the database-level invariant for one open placement per lot.
 */
export async function moveLot(
  farmId: number,
  id: string,
  input: MoveLotInput
): Promise<MoveLotResult | MoveLotError> {
  if (input.startedOn > todayISO()) return "future_date";

  return db.transaction(async (tx) => {
    const [lotRow] = await tx
      .select()
      .from(lots)
      .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
      .for("update");
    if (!lotRow) return "lot_not_found";

    const [destination] = await tx
      .select({ id: invernadas.id })
      .from(invernadas)
      .where(
        and(
          eq(invernadas.farmId, farmId),
          eq(invernadas.id, input.invernadaId)
        )
      )
      .for("key share")
      .limit(1);
    if (!destination) return "invernada_not_found";

    const [current] = await tx
      .select()
      .from(lotPlacements)
      .where(
        and(
          eq(lotPlacements.farmId, farmId),
          eq(lotPlacements.lotId, lotRow.id),
          isNull(lotPlacements.endedOn)
        )
      )
      .for("update");
    if (!current) return "placement_not_found";
    if (current.invernadaId === destination.id) return "same_destination";
    if (input.startedOn <= current.startedOn) return "nonmonotonic_date";

    const [closedRow] = await tx
      .update(lotPlacements)
      .set({ endedOn: input.startedOn })
      .where(eq(lotPlacements.id, current.id))
      .returning();
    const notes = input.notes?.trim();
    const [placementRow] = await tx
      .insert(lotPlacements)
      .values({
        id: randomUUID(),
        farmId,
        lotId: lotRow.id,
        invernadaId: destination.id,
        startedOn: input.startedOn,
        notes: notes || null,
        baseline: false,
      })
      .returning();

    return {
      lot: toLot(lotRow),
      placement: toLotPlacement(placementRow),
      previousPlacement: toLotPlacement(closedRow),
    };
  });
}

/** Updates the farm registration data. */
export async function saveFarm(farmId: number, data: FarmData): Promise<FarmData> {
  await db
    .update(farm)
    .set({
      name: data.name,
      municipality: data.municipality,
      stateRegistration: data.stateRegistration,
      manager: data.manager,
      headquartersLat: data.headquarters?.lat ?? null,
      headquartersLng: data.headquarters?.lng ?? null,
    })
    .where(eq(farm.id, farmId));
  return data;
}

/**
 * Registers a health protocol; when generateSchedule is set, also creates one
 * scheduled treatment per active animal, DAYS_UNTIL_SCHEDULE days from today
 * (farm timezone).
 */
export async function addProtocol(
  farmId: number,
  input: Omit<HealthProtocol, "id">,
  generateSchedule: boolean
): Promise<{ protocol: HealthProtocol; treatments: Treatment[] }> {
  return db.transaction(async (tx) => {
    const [protocolRow] = await tx
      .insert(healthProtocols)
      .values({
        id: randomUUID(),
        farmId,
        name: input.name,
        type: input.type,
        intervalMonths: input.intervalMonths,
        withdrawalDays: input.withdrawalDays,
        mandatory: input.mandatory,
      })
      .returning();

    if (!generateSchedule) {
      return { protocol: toProtocol(protocolRow), treatments: [] };
    }

    const active = await tx
      .select({ id: animals.id, earTag: animals.earTag })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.active, true)));
    if (active.length === 0) {
      return { protocol: toProtocol(protocolRow), treatments: [] };
    }

    const date = addDays(todayISO(), DAYS_UNTIL_SCHEDULE);
    const rows = await tx
      .insert(treatments)
      .values(
        active.map((a) => ({
          id: randomUUID(),
          animalId: a.id,
          type: input.type,
          name: input.name,
          date,
          status: "scheduled" as const,
          withdrawalDays: input.withdrawalDays,
        }))
      )
      .returning();

    const earTagByAnimal = new Map(active.map((a) => [a.id, a.earTag]));
    return {
      protocol: toProtocol(protocolRow),
      treatments: rows.map((row) => toTreatment(row, earTagByAnimal.get(row.animalId)!)),
    };
  });
}

/** Removes a health protocol (scheduled treatments it generated remain). */
export async function removeProtocol(farmId: number, id: string): Promise<void> {
  await db
    .delete(healthProtocols)
    .where(and(eq(healthProtocols.farmId, farmId), eq(healthProtocols.id, id)));
}

/** Marks farm-scoped treatments as done; returns the ids actually updated. */
export async function completeTreatments(
  farmId: number,
  ids: string[]
): Promise<string[]> {
  const farmAnimals = db
    .select({ id: animals.id })
    .from(animals)
    .where(eq(animals.farmId, farmId));
  const rows = await db
    .update(treatments)
    .set({ status: "done" })
    .where(and(inArray(treatments.id, ids), inArray(treatments.animalId, farmAnimals)))
    .returning({ id: treatments.id });
  return rows.map((r) => r.id);
}
