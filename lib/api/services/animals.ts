/**
 * Write path — animals and weighings. Farm-scoped; clients address animals by
 * ear tag, the surrogate id stays server-side.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { animals, customCategories, weighings } from "@/lib/db/schema";
import type {
  Category,
  InactiveReason,
  Sex,
  Weighing,
  Animal,
} from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { toWeighing } from "@/lib/api/services/mappers";

export interface NewAnimalInput {
  earTag: string;
  category: Category;
  /** Optional custom category; when valid, `category` is forced to its base. */
  customCategoryId?: string;
  breed: string;
  sex: Sex;
  birthDate: string;
  lotId: string;
  initialWeightKg?: number;
  /** Date of the initial weighing; defaults to today (a calf uses its birth). */
  initialWeightDate?: string;
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** True for a duplicate-key error, raw or wrapped by the driver in `cause`. */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  ((error as { code?: string }).code === UNIQUE_VIOLATION ||
    isUniqueViolation((error as { cause?: unknown }).cause));

/** Transaction handle of the app's Drizzle client. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inserts an animal (plus its optional first weighing) inside a transaction the
 * CALLER owns — so a flow that creates an animal together with something else
 * (a calving and its calf) stays atomic. The caller also maps the
 * unique-violation to its own outcome; see `addAnimal` and the calving flow.
 */
export async function insertAnimal(
  tx: Tx,
  farmId: number,
  input: NewAnimalInput
): Promise<Animal> {
  const earTag = input.earTag.trim();

  // Resolve the custom category first: when valid it forces the base category.
  let customCategoryId: string | null = null;
  let category = input.category;
  if (input.customCategoryId) {
    const [custom] = await tx
      .select()
      .from(customCategories)
      .where(
        and(
          eq(customCategories.farmId, farmId),
          eq(customCategories.id, input.customCategoryId)
        )
      )
      .limit(1);
    if (custom) {
      customCategoryId = custom.id;
      category = custom.baseCategory;
    }
  }

  const [row] = await tx
    .insert(animals)
    .values({
      id: randomUUID(),
      farmId,
      earTag,
      category,
      customCategoryId,
      breed: input.breed,
      sex: input.sex,
      birthDate: input.birthDate,
      lotId: input.lotId,
      active: true,
    })
    .returning();

  const animalWeighings: Weighing[] = [];
  if (input.initialWeightKg !== undefined) {
    const [w] = await tx
      .insert(weighings)
      .values({
        animalId: row.id,
        date: input.initialWeightDate ?? todayISO(),
        weightKg: input.initialWeightKg,
      })
      .returning();
    animalWeighings.push(toWeighing(w));
  }

  return {
    earTag: row.earTag,
    category: row.category,
    customCategoryId: row.customCategoryId ?? undefined,
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birthDate,
    lotId: row.lotId,
    active: row.active,
    weighings: animalWeighings,
  };
}

/**
 * Registers an animal (optionally with an initial weighing dated today).
 * Returns null when the ear tag is already in use on this farm.
 */
export async function addAnimal(
  farmId: number,
  input: NewAnimalInput
): Promise<Animal | null> {
  try {
    return await db.transaction((tx) => insertAnimal(tx, farmId, input));
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Appends a weighing to an animal (addressed by ear tag).
 * Returns null when the animal does not exist on this farm.
 */
export async function recordWeighing(
  farmId: number,
  earTag: string,
  input: Weighing
): Promise<Weighing | null> {
  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.earTag, earTag)))
    .limit(1);
  if (!animal) return null;
  const [row] = await db
    .insert(weighings)
    .values({ animalId: animal.id, date: input.date, weightKg: input.weightKg })
    .returning();
  return toWeighing(row);
}

/** Editable fields of an animal (all optional; only sent ones change). */
export interface AnimalPatchInput {
  /** Canonical category; clears the custom category unless one is also sent. */
  category?: Category;
  /** Custom category id (null clears it). Overrides `category` with its base. */
  customCategoryId?: string | null;
  breed?: string;
  birthDate?: string;
  lotId?: string;
}

/** Outcome of updateAnimal signalling why nothing was updated. */
export type AnimalUpdateError = "animal_not_found" | "category_not_found";

/**
 * Updates an animal's registration fields. When customCategoryId is set, the
 * canonical `category` column is forced to the custom category's base so the
 * domain rules stay consistent.
 */
export async function updateAnimal(
  farmId: number,
  earTag: string,
  patch: AnimalPatchInput
): Promise<{ earTag: string; changes: Partial<Animal> } | AnimalUpdateError> {
  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.earTag, earTag)))
    .limit(1);
  if (!animal) return "animal_not_found";

  const set: Record<string, unknown> = {};
  if (patch.breed !== undefined) set.breed = patch.breed;
  if (patch.birthDate !== undefined) set.birthDate = patch.birthDate;
  if (patch.lotId !== undefined) set.lotId = patch.lotId;

  if (patch.customCategoryId !== undefined && patch.customCategoryId !== null) {
    const [custom] = await db
      .select()
      .from(customCategories)
      .where(
        and(
          eq(customCategories.farmId, farmId),
          eq(customCategories.id, patch.customCategoryId)
        )
      )
      .limit(1);
    if (!custom) return "category_not_found";
    set.customCategoryId = custom.id;
    set.category = custom.baseCategory;
  } else if (patch.customCategoryId === null || patch.category !== undefined) {
    if (patch.category !== undefined) set.category = patch.category;
    set.customCategoryId = null;
  }

  const [updated] = await db
    .update(animals)
    .set(set)
    .where(eq(animals.id, animal.id))
    .returning();
  return {
    earTag,
    changes: {
      category: updated.category,
      customCategoryId: updated.customCategoryId ?? undefined,
      breed: updated.breed,
      birthDate: updated.birthDate,
      lotId: updated.lotId,
    },
  };
}

/**
 * Deactivates an animal with a reason (death, loss, other — sales go through
 * movements). Returns false when the animal does not exist on this farm.
 */
export async function deactivateAnimal(
  farmId: number,
  earTag: string,
  reason: InactiveReason
): Promise<boolean> {
  const rows = await db
    .update(animals)
    .set({ active: false, inactiveReason: reason })
    .where(and(eq(animals.farmId, farmId), eq(animals.earTag, earTag)))
    .returning({ id: animals.id });
  return rows.length > 0;
}

/** All weighings of one animal, sorted asc by date (for response payloads). */
export async function listWeighings(animalId: string): Promise<Weighing[]> {
  const rows = await db
    .select()
    .from(weighings)
    .where(eq(weighings.animalId, animalId))
    .orderBy(asc(weighings.date), asc(weighings.id));
  return rows.map(toWeighing);
}
