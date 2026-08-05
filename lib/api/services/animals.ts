/**
 * Write path — animals and weighings. Farm-scoped; clients address animals by
 * ear tag, the surrogate id stays server-side.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { animals, breeds, customCategories, lots, weighings } from "@/lib/db/schema";
import type {
  Category,
  InactiveReason,
  Sex,
  Weighing,
  Animal,
} from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { normalizeEarTag } from "@/lib/domain/earTags";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAnimal, toWeighing } from "@/lib/api/services/mappers";

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
  const earTag = normalizeEarTag(input.earTag);

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

/** One row of a herd import: like NewAnimalInput but the lot is a NAME. */
export interface ImportAnimalInput {
  earTag: string;
  category: Category;
  customCategoryId?: string;
  breed: string;
  sex: Sex;
  birthDate: string;
  /** Lot name; resolved to a lot id, creating the lot when it is new. */
  lot: string;
  weightKg?: number;
}

/** Summary of a bulk herd import (what was added, skipped and auto-created). */
export interface ImportResult {
  imported: Animal[];
  skipped: { earTag: string; reason: "duplicate" }[];
  createdBreeds: string[];
  createdLots: { id: string; name: string }[];
}

/** Placeholder pasture data for auto-created lots (editable in Settings). */
const IMPORT_LOT_GRASS = "A definir";
const IMPORT_LOT_HECTARES = 1;

/**
 * Bulk-imports animals in one transaction. Add-only and idempotent: rows whose
 * ear tag already exists on the farm (or repeats earlier in the batch) are
 * skipped, not updated. Missing breeds and lots are auto-created (the lot
 * with placeholder area/grass to edit later). An optional weight becomes the
 * animal's first weighing dated today.
 */
export async function importAnimals(
  farmId: number,
  rows: ImportAnimalInput[]
): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    // 1. Current farm state used to resolve refs and detect duplicates.
    const [existingTagRows, breedRows, lotRows, customRows] = await Promise.all([
      tx.select({ earTag: animals.earTag }).from(animals).where(eq(animals.farmId, farmId)),
      tx.select({ name: breeds.name }).from(breeds).where(eq(breeds.farmId, farmId)),
      tx.select({ id: lots.id, name: lots.name }).from(lots).where(eq(lots.farmId, farmId)),
      tx
        .select({ id: customCategories.id, baseCategory: customCategories.baseCategory })
        .from(customCategories)
        .where(eq(customCategories.farmId, farmId)),
    ]);
    const existingTags = new Set(existingTagRows.map((r) => r.earTag));
    const breedSet = new Set(breedRows.map((r) => r.name));
    const lotByName = new Map(lotRows.map((r) => [r.name, r.id]));
    const baseByCustomId = new Map(customRows.map((r) => [r.id, r.baseCategory]));

    // 2. Keep the first occurrence of each new ear tag; skip the rest.
    // `skippedTags` de-dupes the report so a tag repeated in the payload (e.g.
    // an already-in-herd tag sent twice) is counted once, not per occurrence.
    const skipped: { earTag: string; reason: "duplicate" }[] = [];
    const skippedTags = new Set<string>();
    const markSkipped = (earTag: string) => {
      if (skippedTags.has(earTag)) return;
      skippedTags.add(earTag);
      skipped.push({ earTag, reason: "duplicate" });
    };
    const seen = new Set<string>();
    const toImport: ImportAnimalInput[] = [];
    for (const row of rows) {
      const earTag = normalizeEarTag(row.earTag);
      if (earTag === "") continue; // guarded client + schema side; ignore defensively
      if (existingTags.has(earTag) || seen.has(earTag)) {
        markSkipped(earTag);
        continue;
      }
      seen.add(earTag);
      toImport.push({ ...row, earTag });
    }
    if (toImport.length === 0) {
      return { imported: [], skipped, createdBreeds: [], createdLots: [] };
    }

    // 3. Auto-create the breeds this batch introduces.
    const createdBreeds = [...new Set(toImport.map((r) => r.breed))].filter(
      (name) => !breedSet.has(name)
    );
    if (createdBreeds.length > 0) {
      await tx
        .insert(breeds)
        .values(createdBreeds.map((name) => ({ farmId, name })))
        .onConflictDoNothing();
    }

    // 4. Auto-create the lots this batch introduces (placeholder area/grass).
    const newLotNames = [...new Set(toImport.map((r) => r.lot))].filter(
      (name) => !lotByName.has(name)
    );
    const createdLots: { id: string; name: string }[] = [];
    if (newLotNames.length > 0) {
      const inserted = await tx
        .insert(lots)
        .values(
          newLotNames.map((name) => ({
            id: randomUUID(),
            farmId,
            name,
            grass: IMPORT_LOT_GRASS,
            hectares: IMPORT_LOT_HECTARES,
          }))
        )
        .returning({ id: lots.id, name: lots.name });
      for (const lot of inserted) {
        lotByName.set(lot.name, lot.id);
        createdLots.push({ id: lot.id, name: lot.name });
      }
    }

    // 5. Insert the animals in one batch (onConflict guards a concurrent race).
    const animalValues = toImport.map((r) => {
      let category = r.category;
      let customCategoryId: string | null = null;
      if (r.customCategoryId && baseByCustomId.has(r.customCategoryId)) {
        customCategoryId = r.customCategoryId;
        category = baseByCustomId.get(r.customCategoryId)!;
      }
      return {
        id: randomUUID(),
        farmId,
        earTag: r.earTag,
        category,
        customCategoryId,
        breed: r.breed,
        sex: r.sex,
        birthDate: r.birthDate,
        lotId: lotByName.get(r.lot)!,
        active: true,
      };
    });
    const insertedAnimals = await tx
      .insert(animals)
      .values(animalValues)
      .onConflictDoNothing({ target: [animals.farmId, animals.earTag] })
      .returning();
    const rowByTag = new Map(insertedAnimals.map((a) => [a.earTag, a]));

    // Rows dropped by the race guard did not insert — report them as skipped.
    for (const r of toImport) {
      if (!rowByTag.has(r.earTag)) markSkipped(r.earTag);
    }

    // 6. First weighing (today) for the imported rows that carried a weight.
    const weighingValues = toImport
      .filter((r) => r.weightKg !== undefined && rowByTag.has(r.earTag))
      .map((r) => ({
        animalId: rowByTag.get(r.earTag)!.id,
        date: todayISO(),
        weightKg: r.weightKg!,
      }));
    const weighingsByAnimal = new Map<string, Weighing[]>();
    if (weighingValues.length > 0) {
      const insertedWeighings = await tx.insert(weighings).values(weighingValues).returning();
      for (const w of insertedWeighings) {
        weighingsByAnimal.set(w.animalId, [toWeighing(w)]);
      }
    }

    const imported = insertedAnimals.map((row) =>
      toAnimal(row, weighingsByAnimal.get(row.id) ?? [], undefined)
    );
    return { imported, skipped, createdBreeds, createdLots };
  });
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
  /** New ear tag; must stay unique within the farm. */
  earTag?: string;
  /** Canonical category; clears the custom category unless one is also sent. */
  category?: Category;
  /** Custom category id (null clears it). Overrides `category` with its base. */
  customCategoryId?: string | null;
  breed?: string;
  birthDate?: string;
  lotId?: string;
}

/** Outcome of updateAnimal signalling why nothing was updated. */
export type AnimalUpdateError =
  | "animal_not_found"
  | "category_not_found"
  | "duplicate_ear_tag"
  | "invalid_ear_tag";

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
  const newEarTag =
    patch.earTag === undefined ? undefined : normalizeEarTag(patch.earTag);
  if (newEarTag !== undefined && newEarTag.length === 0) {
    return "invalid_ear_tag";
  }
  if (newEarTag !== undefined && newEarTag !== earTag) {
    const [taken] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.earTag, newEarTag)))
      .limit(1);
    if (taken) return "duplicate_ear_tag";
    set.earTag = newEarTag;
  }
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

  let updated: typeof animals.$inferSelect;
  try {
    [updated] = await db
      .update(animals)
      .set(set)
      .where(eq(animals.id, animal.id))
      .returning();
  } catch (error) {
    // The lookup above gives a useful early response, while the constraint is
    // the final authority if two requests claim the same tag concurrently.
    if (isUniqueViolation(error)) return "duplicate_ear_tag";
    throw error;
  }
  return {
    earTag,
    changes: {
      earTag: updated.earTag,
      category: updated.category,
      customCategoryId: updated.customCategoryId ?? undefined,
      breed: updated.breed,
      birthDate: updated.birthDate,
      lotId: updated.lotId,
    },
  };
}

/** The baixa of an animal: why it left, when, and what happened. */
export interface DeactivateInput {
  reason: InactiveReason;
  date: string;
  notes?: string;
}

/**
 * Deactivates an animal (morte, perda, outro — a sale goes through a manejo de
 * venda). The date and the note ARE the record of the baixa: without them the
 * herd only knows the animal is gone, never when or why.
 * Returns false when the animal does not exist on this farm.
 */
export async function deactivateAnimal(
  farmId: number,
  earTag: string,
  input: DeactivateInput
): Promise<boolean> {
  const notes = input.notes?.trim();
  const rows = await db
    .update(animals)
    .set({
      active: false,
      inactiveReason: input.reason,
      inactiveDate: input.date,
      inactiveNotes: notes ? notes : null,
    })
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
