import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, customCategories, weighings } from "@/lib/db/schema";
import { todayISO } from "@/lib/domain/dates";
import { normalizeEarTag } from "@/lib/domain/earTags";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toWeighing } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { NewAnimalInput } from "./Insert.useCase";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "./ValidateLotAssignment.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, Weighing } from "@/lib/types";

/** Brincos that refuse the batch; empty when a concurrent insert took one. */
export interface DuplicateEarTags {
  error: "duplicate_ear_tags";
  earTags: string[];
}

interface AddAnimalsUseCaseProps {
  farmId: number;
  inputs: NewAnimalInput[];
}

type AddAnimalsUseCaseResponse = Animal[] | DuplicateEarTags | LotAssignmentError;

type CurrUseCase = _UseCase<AddAnimalsUseCaseProps, AddAnimalsUseCaseResponse>;

const duplicates = (earTags: string[]): DuplicateEarTags => ({
  error: "duplicate_ear_tags",
  earTags: [...new Set(earTags)],
});

/**
 * Registers a batch of animals ("Cadastrar vários animais") in one
 * transaction, all or nothing. Every refusal happens before the first insert:
 * a brinco repeated in the batch or already on the farm (active or not), and
 * a lot that is missing, cross-farm or unplaced. Each distinct lot is validated
 * once and stays locked until commit. Animals go in one statement and their
 * optional first weighings, dated today, in another.
 */
export class AddAnimalsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddAnimalsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, inputs }) => {
    try {
      return await this.repository.transaction(async (tx) => {
        const earTags = inputs.map((input) => normalizeEarTag(input.earTag));
        const repeated = earTags.filter((earTag, index) => earTags.indexOf(earTag) !== index);
        if (repeated.length > 0) return duplicates(repeated);

        const taken = await tx
          .select({ earTag: animals.earTag })
          .from(animals)
          .where(and(eq(animals.farmId, farmId), inArray(animals.earTag, earTags)));
        if (taken.length > 0) return duplicates(taken.map((row) => row.earTag));

        for (const lotId of new Set(inputs.map((input) => input.lotId))) {
          const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId });
          if (lotError) return lotError;
        }

        const customIds = [
          ...new Set(inputs.flatMap((input) => (input.customCategoryId ? [input.customCategoryId] : []))),
        ];
        const customs =
          customIds.length === 0
            ? []
            : await tx
                .select()
                .from(customCategories)
                .where(and(eq(customCategories.farmId, farmId), inArray(customCategories.id, customIds)));
        const baseById = new Map(customs.map((custom) => [custom.id, custom.baseCategory]));

        const rows = inputs.map((input, index) => {
          const base = input.customCategoryId ? baseById.get(input.customCategoryId) : undefined;
          return {
            id: randomUUID(),
            farmId,
            earTag: earTags[index],
            category: base ?? input.category,
            customCategoryId: base ? (input.customCategoryId ?? null) : null,
            breed: input.breed,
            sex: input.sex,
            birthDate: input.birthDate,
            lotId: input.lotId,
            active: true,
          };
        });
        const inserted = await tx.insert(animals).values(rows).returning();

        const today = todayISO();
        const firstWeighings = inputs.flatMap((input, index) =>
          input.initialWeightKg === undefined
            ? []
            : [{ animalId: rows[index].id, date: today, weightKg: input.initialWeightKg }]
        );
        const insertedWeighings =
          firstWeighings.length === 0
            ? []
            : await tx.insert(weighings).values(firstWeighings).returning();
        const weighingByAnimal = new Map<string, Weighing>(
          insertedWeighings.map((row) => [row.animalId, toWeighing(row)])
        );

        return inserted.map((row) => {
          const weighing = weighingByAnimal.get(row.id);
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
            weighings: weighing ? [weighing] : [],
          };
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return duplicates([]);
      throw error;
    }
  };
}
