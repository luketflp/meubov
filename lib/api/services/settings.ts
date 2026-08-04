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

/** Creates a lot (paddock) and returns it with its server-generated id. */
export async function addLot(
  farmId: number,
  input: Omit<Lot, "id">
): Promise<Lot> {
  const [row] = await db
    .insert(lots)
    .values({
      id: randomUUID(),
      farmId,
      name: input.name,
      grass: input.grass,
      hectares: input.hectares,
      boundary: input.boundary,
    })
    .returning();
  return toLot(row);
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
