/**
 * Write path — reproduction of the females: breeding, pregnancy diagnosis and
 * calving. Farm-scoped and addressed by the animal's stable id.
 *
 * A calving also puts the calf in the herd, in the SAME transaction — a birth
 * that leaves no animal behind would silently shrink the herd count.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { animals, breedings, calvings, pregnancyDiagnoses } from "@/lib/db/schema";
import type {
  Animal,
  Breeding,
  BreedingType,
  Calving,
  DiagnosisResult,
  PregnancyDiagnosis,
  Sex,
} from "@/lib/types";
import { toBreeding, toCalving, toDiagnosis } from "@/lib/api/services/mappers";
import { insertAnimal } from "@/lib/api/services/animals";
import { isUniqueViolation } from "@/lib/api/dbErrors";

/** Why the dam could not be used; every write starts by resolving her. */
export type DamError = "animal_not_found" | "not_female";

/** Why a reproduction write did nothing; the route maps each to a status. */
export type ReproductionError = DamError | "breeding_not_found" | "duplicate_ear_tag";

export interface NewBreedingInput {
  date: string;
  type: BreedingType;
  /** Herd bull's ear tag or an external semen code (free text). */
  bullEarTag: string;
}

export interface NewDiagnosisInput {
  breedingId: string;
  result: DiagnosisResult;
  date: string;
}

export interface NewCalvingInput {
  date: string;
  calfEarTag: string;
  calfSex: Sex;
  /** Falls back to the dam's breed / lot when omitted. */
  calfBreed?: string;
  calfLotId?: string;
  calfWeightKg?: number;
}

/** The dam's server-side data needed to write her records and her calf's. */
interface Dam {
  id: string;
  breed: string;
  lotId: string;
}

/**
 * Resolves the dam by stable id inside the farm. Reproduction belongs to
 * females only, so a male is rejected instead of silently accepted.
 */
async function findDam(farmId: number, animalId: string): Promise<Dam | DamError> {
  const [row] = await db
    .select({
      id: animals.id,
      sex: animals.sex,
      breed: animals.breed,
      lotId: animals.lotId,
    })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
    .limit(1);
  if (!row) return "animal_not_found";
  if (row.sex !== "female") return "not_female";
  return { id: row.id, breed: row.breed, lotId: row.lotId };
}

/** Records a breeding (timed AI or natural mating) for one female. */
export async function addBreeding(
  farmId: number,
  animalId: string,
  input: NewBreedingInput
): Promise<Breeding | DamError> {
  const dam = await findDam(farmId, animalId);
  if (typeof dam === "string") return dam;

  const [row] = await db
    .insert(breedings)
    .values({
      id: randomUUID(),
      animalId: dam.id,
      date: input.date,
      type: input.type,
      bullEarTag: input.bullEarTag.trim(),
    })
    .returning();
  return toBreeding(row);
}

/**
 * Records the pregnancy diagnosis of one breeding. The table keeps a single
 * diagnosis per breeding, so re-examining the same breeding (30 then 60 days)
 * overwrites the previous result instead of piling up rows.
 */
export async function setDiagnosis(
  farmId: number,
  animalId: string,
  input: NewDiagnosisInput
): Promise<PregnancyDiagnosis | DamError | "breeding_not_found"> {
  const dam = await findDam(farmId, animalId);
  if (typeof dam === "string") return dam;

  // The breeding must belong to THIS female — which also scopes it to the farm.
  const [breeding] = await db
    .select({ id: breedings.id })
    .from(breedings)
    .where(and(eq(breedings.id, input.breedingId), eq(breedings.animalId, dam.id)))
    .limit(1);
  if (!breeding) return "breeding_not_found";

  const [row] = await db
    .insert(pregnancyDiagnoses)
    .values({ breedingId: breeding.id, result: input.result, date: input.date })
    .onConflictDoUpdate({
      target: pregnancyDiagnoses.breedingId,
      set: { result: input.result, date: input.date },
    })
    .returning();
  return toDiagnosis(row);
}

/**
 * Records a calving and registers the calf in the herd atomically: born on the
 * calving date, in the dam's lot and breed unless the caller overrides them.
 * Returns "duplicate_ear_tag" when the calf's ear tag is already in use — the
 * whole transaction rolls back, so no calving is left without its calf.
 */
export async function addCalving(
  farmId: number,
  animalId: string,
  input: NewCalvingInput
): Promise<{ calving: Calving; calf: Animal } | DamError | "duplicate_ear_tag"> {
  const dam = await findDam(farmId, animalId);
  if (typeof dam === "string") return dam;

  try {
    return await db.transaction(async (tx) => {
      const calf = await insertAnimal(tx, farmId, {
        earTag: input.calfEarTag,
        category: "calf",
        breed: input.calfBreed ?? dam.breed,
        sex: input.calfSex,
        birthDate: input.date,
        lotId: input.calfLotId ?? dam.lotId,
        initialWeightKg: input.calfWeightKg,
        initialWeightDate: input.date,
      });
      const [row] = await tx
        .insert(calvings)
        .values({ animalId: dam.id, date: input.date, calfEarTag: calf.earTag })
        .returning();
      return { calving: toCalving(row), calf };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate_ear_tag";
    throw error;
  }
}
