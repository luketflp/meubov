import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, customCategories, weighings } from "@/lib/db/schema";
import { todayISO } from "@/lib/domain/dates";
import { normalizeEarTag } from "@/lib/domain/earTags";
import { toWeighing } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "./ValidateLotAssignment.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, Category, Sex, Weighing } from "@/lib/types";

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

interface InsertAnimalUseCaseProps {
  farmId: number;
  input: NewAnimalInput;
}

type InsertAnimalUseCaseResponse = Animal | LotAssignmentError;

type CurrUseCase = _UseCase<InsertAnimalUseCaseProps, InsertAnimalUseCaseResponse>;

/**
 * Inserts an animal (plus its optional first weighing) inside a transaction the
 * CALLER owns — pass it as the repository — so a flow that creates an animal
 * together with something else (a calving and its calf) stays atomic. The
 * caller also maps the unique-violation to its own outcome; see the Add and
 * calving flows. A missing/cross-farm logical lot is returned as
 * `lot_not_found` before any row is written.
 */
export class InsertAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("InsertAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    const earTag = normalizeEarTag(input.earTag);

    const lotError = await new ValidateLotAssignmentUseCase(this.repository).run({
      farmId,
      lotId: input.lotId,
    });
    if (lotError) return lotError;

    // Resolve the custom category first: when valid it forces the base category.
    let customCategoryId: string | null = null;
    let category = input.category;
    if (input.customCategoryId) {
      const [custom] = await this.repository
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

    const [row] = await this.repository
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
      const [w] = await this.repository
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
  };
}
