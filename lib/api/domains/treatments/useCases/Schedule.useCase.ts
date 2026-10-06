import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, treatments } from "@/lib/db/schema";
import {
  toTreatment,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ScheduleTreatmentsInput, Treatment } from "@/lib/types";

interface ScheduleTreatmentsUseCaseProps {
  farmId: number;
  input: ScheduleTreatmentsInput;
}

type ScheduleTreatmentsUseCaseResponse = { treatments: Treatment[] } | "animals_not_found";

type CurrUseCase = _UseCase<ScheduleTreatmentsUseCaseProps, ScheduleTreatmentsUseCaseResponse>;

/** Creates one scheduled calendar entry per selected active animal. */
export class ScheduleTreatmentsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ScheduleTreatmentsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    const animalIds = [...new Set(input.animalIds)];

    return this.repository.transaction(async (tx) => {
      const selectedAnimals = await tx
        .select({ id: animals.id, earTag: animals.earTag })
        .from(animals)
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(animals.active, true),
            inArray(animals.id, animalIds)
          )
        );

      if (selectedAnimals.length !== animalIds.length) return "animals_not_found";

      const details = {
        name: input.source.name.trim(),
        type: input.source.type,
        withdrawalDays: input.source.withdrawalDays,
      };

      // One id for the whole action: deleting any of these removes them all.
      const batchId = randomUUID();
      const rows = await tx
        .insert(treatments)
        .values(
          selectedAnimals.map((animal) => ({
            id: randomUUID(),
            animalId: animal.id,
            type: details.type,
            name: details.name,
            date: input.date,
            status: "scheduled" as const,
            withdrawalDays: details.withdrawalDays,
            batchId,
          }))
        )
        .returning();
      const earTagByAnimalId = new Map(
        selectedAnimals.map((animal) => [animal.id, animal.earTag])
      );

      return {
        treatments: rows.map((row) => toTreatment(row, earTagByAnimalId.get(row.animalId)!)),
      };
    });
  };
}
