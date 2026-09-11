import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

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
import { todayISO } from "@/lib/domain/dates";
import { normalizeEarTag } from "@/lib/domain/earTags";
import {
  resolveImportLocations,
  type ImportLocationError,
} from "@/lib/domain/importLocations";
import { toAnimal, toWeighing } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";


import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, Category, Sex, Weighing } from "@/lib/types";

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

interface ImportAnimalsUseCaseProps {
  farmId: number;
  rows: ImportAnimalInput[];
}

type ImportAnimalsUseCaseResponse = ImportResult | ImportError;

type CurrUseCase = _UseCase<ImportAnimalsUseCaseProps, ImportAnimalsUseCaseResponse>;

/**
 * Bulk-imports animals in one transaction. Add-only and idempotent: rows whose
 * ear tag already exists on the farm (or repeats earlier in the batch) are
 * skipped, not updated. Missing breeds and logical lots are auto-created; a
 * new lot gets one current placement in an already-registered invernada. An
 * existing lot must agree with the invernada supplied by the spreadsheet.
 * An optional weight becomes the animal's first weighing dated today.
 */
export class ImportAnimalsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ImportAnimalsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, rows }) => {
    return this.repository.transaction(async (tx) => {
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
        // Deleted lots are invisible to the import: a spreadsheet naming one
        // creates a fresh group instead of reviving what the farmer removed.
        tx
          .select({ id: lots.id, name: lots.name })
          .from(lots)
          .where(and(eq(lots.farmId, farmId), isNull(lots.deletedAt)))
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
  };
}
