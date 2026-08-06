/**
 * Write path — animals and weighings. Farm-scoped; existing animals are
 * addressed by stable id while ear tags remain editable identifiers.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  animals,
  breeds,
  customCategories,
  farm,
  invernadas,
  lotPlacements,
  lots,
  weighings,
} from "@/lib/db/schema";
import type {
  Category,
  InactiveReason,
  Sex,
  Weighing,
  Animal,
} from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { normalizeEarTag } from "@/lib/domain/earTags";
import {
  resolveImportLocations,
  type ImportLocationError,
} from "@/lib/domain/importLocations";
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

/** A supplied logical lot is missing, cross-farm, or archived/unplaced. */
export type LotAssignmentError = "lot_not_found";

/**
 * Verifies an active logical-lot assignment inside the caller's transaction.
 * The lot lock serializes this check with archive, movement and deletion; the
 * placement lock keeps the open assignment valid until the animal write
 * commits. Archived/unplaced and cross-farm lots are intentionally exposed as
 * the same `lot_not_found` result.
 */
export async function validateLotAssignment(
  tx: Tx,
  farmId: number,
  lotId: string
): Promise<LotAssignmentError | null> {
  const [lot] = await tx
    .select({ id: lots.id })
    .from(lots)
    .where(and(eq(lots.farmId, farmId), eq(lots.id, lotId)))
    .for("key share");
  if (!lot) return "lot_not_found";

  const [placement] = await tx
    .select({ id: lotPlacements.id })
    .from(lotPlacements)
    .where(
      and(
        eq(lotPlacements.farmId, farmId),
        eq(lotPlacements.lotId, lot.id),
        isNull(lotPlacements.endedOn)
      )
    )
    .for("share");
  return placement ? null : "lot_not_found";
}

/**
 * Inserts an animal (plus its optional first weighing) inside a transaction the
 * CALLER owns — so a flow that creates an animal together with something else
 * (a calving and its calf) stays atomic. The caller also maps the
 * unique-violation to its own outcome; see `addAnimal` and the calving flow.
 * A missing/cross-farm logical lot is returned as `lot_not_found` before any
 * row is written.
 */
export async function insertAnimal(
  tx: Tx,
  farmId: number,
  input: NewAnimalInput
): Promise<Animal | LotAssignmentError> {
  const earTag = normalizeEarTag(input.earTag);

  const lotError = await validateLotAssignment(tx, farmId, input.lotId);
  if (lotError) return lotError;

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
    id: row.id,
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
 * Returns null when the ear tag is already in use on this farm and
 * `lot_not_found` when the supplied logical lot does not belong to it.
 */
export async function addAnimal(
  farmId: number,
  input: NewAnimalInput
): Promise<Animal | LotAssignmentError | null> {
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
  /** Fixed invernada code where the logical lot is currently placed. */
  invernada: string;
  weightKg?: number;
}

/** Summary of a bulk herd import (what was added, skipped and auto-created). */
export interface ImportResult {
  imported: Animal[];
  skipped: { earTag: string; reason: "duplicate" }[];
  createdBreeds: string[];
  createdLots: { id: string; name: string }[];
}

/** A batch cannot be committed until every physical destination is unambiguous. */
export type ImportError = ImportLocationError;

/**
 * Bulk-imports animals in one transaction. Add-only and idempotent: rows whose
 * ear tag already exists on the farm (or repeats earlier in the batch) are
 * skipped, not updated. Missing breeds and logical lots are auto-created; a
 * new lot gets one current placement in an already-registered invernada. An
 * existing lot must agree with the invernada supplied by the spreadsheet.
 * An optional weight becomes the animal's first weighing dated today.
 */
export async function importAnimals(
  farmId: number,
  rows: ImportAnimalInput[]
): Promise<ImportResult | ImportError> {
  return db.transaction(async (tx) => {
    // Lot resolution is name-based, so serialize it with other lot creation
    // for this farm. The row locks below also make current placement checks
    // agree with any concurrent whole-lot movement at commit time.
    await tx
      .select({ id: farm.id })
      .from(farm)
      .where(eq(farm.id, farmId))
      .for("update");

    // 1. Current farm state used to resolve refs and detect duplicates.
    const [
      existingTagRows,
      breedRows,
      lotRows,
      customRows,
      invernadaRows,
      currentPlacementRows,
    ] = await Promise.all([
      tx.select({ earTag: animals.earTag }).from(animals).where(eq(animals.farmId, farmId)),
      tx.select({ name: breeds.name }).from(breeds).where(eq(breeds.farmId, farmId)),
      tx
        .select({ id: lots.id, name: lots.name })
        .from(lots)
        .where(eq(lots.farmId, farmId))
        .for("update"),
      tx
        .select({ id: customCategories.id, baseCategory: customCategories.baseCategory })
        .from(customCategories)
        .where(eq(customCategories.farmId, farmId)),
      tx
        .select({ id: invernadas.id, code: invernadas.code })
        .from(invernadas)
        .where(eq(invernadas.farmId, farmId))
        .for("key share"),
      tx
        .select({ lotId: lotPlacements.lotId, invernadaId: lotPlacements.invernadaId })
        .from(lotPlacements)
        .where(
          and(eq(lotPlacements.farmId, farmId), isNull(lotPlacements.endedOn))
        ),
    ]);
    const existingTags = new Set(existingTagRows.map((r) => r.earTag));
    const breedSet = new Set(breedRows.map((r) => r.name));
    const lotByName = new Map(lotRows.map((r) => [r.name, r.id]));
    const baseByCustomId = new Map(customRows.map((r) => [r.id, r.baseCategory]));
    const currentInvernadaByLotId = new Map(
      currentPlacementRows.map((r) => [r.lotId, r.invernadaId])
    );

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
      toImport.push({
        ...row,
        earTag,
        breed: row.breed.trim(),
        lot: row.lot.trim(),
        invernada: row.invernada.trim(),
      });
    }
    if (toImport.length === 0) {
      return { imported: [], skipped, createdBreeds: [], createdLots: [] };
    }

    // 3. Resolve each lot to one registered physical destination. A single lot
    // cannot be declared in two invernadas in the same batch, and an existing
    // lot cannot be silently teleported by an animal import.
    const locationResolution = resolveImportLocations(
      toImport,
      lotRows.map((lot) => ({
        name: lot.name,
        currentInvernadaId: currentInvernadaByLotId.get(lot.id),
      })),
      invernadaRows
    );
    if (!locationResolution.ok) {
      return locationResolution.error === "invernada_not_found"
        ? { error: locationResolution.error, codes: locationResolution.codes }
        : { error: locationResolution.error, lots: locationResolution.lots };
    }
    const { destinationByLotName } = locationResolution;

    // 4. Auto-create the breeds this batch introduces.
    const createdBreeds = [...new Set(toImport.map((r) => r.breed))].filter(
      (name) => !breedSet.has(name)
    );
    if (createdBreeds.length > 0) {
      await tx
        .insert(breeds)
        .values(createdBreeds.map((name) => ({ farmId, name })))
        .onConflictDoNothing();
    }

    // 5. Auto-create logical lots and their initial current placements.
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
            needsReview: false,
          }))
        )
        .returning({ id: lots.id, name: lots.name });
      for (const lot of inserted) {
        lotByName.set(lot.name, lot.id);
        createdLots.push({ id: lot.id, name: lot.name });
      }
      await tx.insert(lotPlacements).values(
        inserted.map((lot) => ({
          id: randomUUID(),
          farmId,
          lotId: lot.id,
          invernadaId: destinationByLotName.get(lot.name)!,
          startedOn: todayISO(),
          baseline: false,
        }))
      );
    }

    // 6. Insert the animals in one batch (onConflict guards a concurrent race).
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

    // A concurrent single-animal registration can win an ear-tag race after
    // this import resolved its references. Do not leave a brand-new empty lot
    // behind when none of its intended animals actually inserted.
    const usedLotIds = new Set(insertedAnimals.map((animal) => animal.lotId));
    const unusedCreatedLotIds = createdLots
      .filter((lot) => !usedLotIds.has(lot.id))
      .map((lot) => lot.id);
    if (unusedCreatedLotIds.length > 0) {
      await tx
        .delete(lotPlacements)
        .where(
          and(
            eq(lotPlacements.farmId, farmId),
            inArray(lotPlacements.lotId, unusedCreatedLotIds)
          )
        );
      await tx
        .delete(lots)
        .where(and(eq(lots.farmId, farmId), inArray(lots.id, unusedCreatedLotIds)));
    }
    const committedCreatedLots = createdLots.filter((lot) => usedLotIds.has(lot.id));

    // Rows dropped by the race guard did not insert — report them as skipped.
    for (const r of toImport) {
      if (!rowByTag.has(r.earTag)) markSkipped(r.earTag);
    }

    // 7. First weighing (today) for the imported rows that carried a weight.
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
    return { imported, skipped, createdBreeds, createdLots: committedCreatedLots };
  });
}

/**
 * Appends a weighing to an animal (addressed by ear tag).
 * Returns null when the animal does not exist on this farm.
 */
export async function recordWeighing(
  farmId: number,
  animalId: string,
  input: Weighing
): Promise<Weighing | null> {
  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
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
  | "invalid_ear_tag"
  | LotAssignmentError;

/**
 * Updates an animal's registration fields. When customCategoryId is set, the
 * canonical `category` column is forced to the custom category's base so the
 * domain rules stay consistent.
 */
export async function updateAnimal(
  farmId: number,
  animalId: string,
  patch: AnimalPatchInput
): Promise<{ earTag: string; changes: Partial<Animal> } | AnimalUpdateError> {
  try {
    return await db.transaction(async (tx) => {
      const [animal] = await tx
        .select({ id: animals.id, earTag: animals.earTag, lotId: animals.lotId })
        .from(animals)
        .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
        .for("update");
      if (!animal) return "animal_not_found";

      const set: Record<string, unknown> = {};
      const newEarTag =
        patch.earTag === undefined ? undefined : normalizeEarTag(patch.earTag);
      if (newEarTag !== undefined && newEarTag.length === 0) {
        return "invalid_ear_tag";
      }
      if (newEarTag !== undefined && newEarTag !== animal.earTag) {
        const [taken] = await tx
          .select({ id: animals.id })
          .from(animals)
          .where(and(eq(animals.farmId, farmId), eq(animals.earTag, newEarTag)))
          .limit(1);
        if (taken) return "duplicate_ear_tag";
        set.earTag = newEarTag;
      }
      if (patch.breed !== undefined) set.breed = patch.breed;
      if (patch.birthDate !== undefined) set.birthDate = patch.birthDate;
      // Re-saving the same lot is not a new assignment. This matters for an
      // inactive animal whose former lot has since been archived: its other
      // registration fields remain editable without reopening that lot.
      if (patch.lotId !== undefined && patch.lotId !== animal.lotId) {
        const lotError = await validateLotAssignment(tx, farmId, patch.lotId);
        if (lotError) return lotError;
        set.lotId = patch.lotId;
      }

      if (patch.customCategoryId !== undefined && patch.customCategoryId !== null) {
        const [custom] = await tx
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

      const [updated] = await tx
        .update(animals)
        .set(set)
        .where(eq(animals.id, animal.id))
        .returning();
      return {
        earTag: animal.earTag,
        changes: {
          earTag: updated.earTag,
          category: updated.category,
          customCategoryId: updated.customCategoryId ?? undefined,
          breed: updated.breed,
          birthDate: updated.birthDate,
          lotId: updated.lotId,
        },
      };
    });
  } catch (error) {
    // The lookup above gives a useful early response, while the constraint is
    // the final authority if two requests claim the same tag concurrently.
    if (isUniqueViolation(error)) return "duplicate_ear_tag";
    throw error;
  }
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
  animalId: string,
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
    .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
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
