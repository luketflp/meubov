import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  healthProtocols,
  treatments,
} from "@/lib/db/schema";
import {
  toTreatment,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  HealthProtocol,
  ScheduleTreatmentsInput,
  Treatment,
} from "@/lib/types";

interface ScheduleTreatmentsUseCaseProps {
  farmId: number;
  input: ScheduleTreatmentsInput;
}

type ScheduleTreatmentsUseCaseResponse = { treatments: Treatment[] } | "protocol_not_found" | "animals_not_found";

type CurrUseCase = _UseCase<ScheduleTreatmentsUseCaseProps, ScheduleTreatmentsUseCaseResponse>;

/**
 * Creates one scheduled calendar entry per selected active animal. Protocol
 * details are resolved on the server so another farm's protocol cannot be
 * used and stale client-side template values are never persisted.
 */
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

      let details: Pick<HealthProtocol, "name" | "type" | "withdrawalDays">;
      if (input.source.kind === "protocol") {
        const [protocol] = await tx
          .select()
          .from(healthProtocols)
          .where(
            and(
              eq(healthProtocols.farmId, farmId),
              eq(healthProtocols.id, input.source.protocolId)
            )
          )
          .limit(1);
        if (!protocol) return "protocol_not_found";
        details = protocol;
      } else {
        details = {
          name: input.source.name.trim(),
          type: input.source.type,
          withdrawalDays: input.source.withdrawalDays,
        };
      }

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
