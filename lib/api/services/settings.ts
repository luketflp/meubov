/**
 * Write path — farm settings: breeds, lots, farm data and health protocols.
 * All functions are farm-scoped; ids are server-generated uuids.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  animals,
  breeds,
  farm,
  healthProtocols,
  lots,
  treatments,
} from "@/lib/db/schema";
import type { FarmData, HealthProtocol, Lot, Treatment } from "@/lib/types";
import { addDays, todayISO } from "@/lib/domain/dates";
import { isSelfIntersecting, isValidRing, normalizeRing } from "@/lib/domain/geo";
import { toLot, toProtocol, toTreatment } from "@/lib/api/services/mappers";

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
 * left is what JSON Schema cannot express — a ring that crosses itself, which
 * `@turf/area` measures as zero and the map draws as a bowtie.
 */
function sanitizeBoundary(
  boundary: [number, number][]
): [number, number][] | "invalid" {
  const ring = normalizeRing(boundary);
  if (!isValidRing(ring) || isSelfIntersecting(ring)) return "invalid";
  return ring;
}

/** Rejected because the outline is not a usable pasture ring. */
export type InvalidBoundary = "invalid_boundary";

/** Creates a lot (paddock) and returns it with its server-generated id. */
export async function addLot(
  farmId: number,
  input: Omit<Lot, "id">
): Promise<Lot | InvalidBoundary> {
  let boundary: [number, number][] | undefined;
  if (input.boundary !== undefined) {
    const sanitized = sanitizeBoundary(input.boundary);
    if (sanitized === "invalid") return "invalid_boundary";
    boundary = sanitized;
  }

  const [row] = await db
    .insert(lots)
    .values({
      id: randomUUID(),
      farmId,
      name: input.name,
      grass: input.grass,
      hectares: input.hectares,
      boundary,
    })
    .returning();
  return toLot(row);
}

/** Editable fields of a lot; `boundary: null` erases the outline. */
export interface LotPatchInput {
  name?: string;
  grass?: string;
  hectares?: number;
  boundary?: [number, number][] | null;
}

/**
 * Updates a lot's registration fields, farm-scoped.
 *
 * Returns the WHOLE lot, not just the changed fields: `boundary` is optional in
 * {@link Lot}, so a client merging a partial patch could never erase an
 * outline — the key would simply be absent from the payload.
 *
 * `null` when no lot of this farm carries that id (a lot of another farm is
 * indistinguishable from a missing one, on purpose), `"empty_patch"` when the
 * caller sent no field — Drizzle throws on `.set({})` — and
 * `"invalid_boundary"` when the outline is not a usable ring.
 */
export async function updateLot(
  farmId: number,
  id: string,
  patch: LotPatchInput
): Promise<Lot | null | "empty_patch" | InvalidBoundary> {
  const set: Partial<typeof lots.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.grass !== undefined) set.grass = patch.grass;
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
  if (Object.keys(set).length === 0) return "empty_patch";

  const [row] = await db
    .update(lots)
    .set(set)
    .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
    .returning();
  return row ? toLot(row) : null;
}

/** Removes a lot; false when an active animal still occupies it. */
export async function removeLot(farmId: number, id: string): Promise<boolean> {
  const occupied = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.lotId, id), eq(animals.active, true)))
    .limit(1);
  if (occupied.length > 0) return false;
  await db.delete(lots).where(and(eq(lots.farmId, farmId), eq(lots.id, id)));
  return true;
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
