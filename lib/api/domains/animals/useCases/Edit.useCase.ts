import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  customCategories,
} from "@/lib/db/schema";
import { normalizeEarTag } from "@/lib/domain/earTags";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "./ValidateLotAssignment.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, Category } from "@/lib/types";

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

interface UpdateAnimalUseCaseProps {
  farmId: number;
  animalId: string;
  patch: AnimalPatchInput;
}

type UpdateAnimalUseCaseResponse = { earTag: string; changes: Partial<Animal> } | AnimalUpdateError;

type CurrUseCase = _UseCase<UpdateAnimalUseCaseProps, UpdateAnimalUseCaseResponse>;

/**
 * Updates an animal's registration fields. When customCategoryId is set, the
 * canonical `category` column is forced to the custom category's base so the
 * domain rules stay consistent.
 */
export class UpdateAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, patch }) => {
    try {
      return await this.repository.transaction(async (tx) => {
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
          const lotError = await new ValidateLotAssignmentUseCase(tx).run({
            farmId,
            lotId: patch.lotId,
          });
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
  };
}
