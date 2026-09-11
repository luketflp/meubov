import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  treatments,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteTreatmentsUseCaseProps {
  farmId: number;
  id: string;
  /** Defaults to "batch": deleting one scheduled dose drops the whole batch. */
  scope?: "one" | "batch";
}

type DeleteTreatmentsUseCaseResponse = { ids: string[] } | "treatment_not_found";

type CurrUseCase = _UseCase<DeleteTreatmentsUseCaseProps, DeleteTreatmentsUseCaseResponse>;

/**
 * Soft-deletes a treatment. "batch" takes everything booked with it — one
 * calendar action schedules the same treatment for many animals and the farmer
 * undoes it as one; agendas made before batches existed, and treatments born in
 * a manejo, carry no batch, so what groups them is the day, the treatment and
 * the state they stand in. "one" takes the single animal's row. Nothing is
 * erased: the rows stay in the table for audit.
 */
export class DeleteTreatmentsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteTreatmentsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, scope = "batch" }) => {
    return this.repository.transaction(async (tx) => {
      const [target] = await tx
        .select({
          id: treatments.id,
          batchId: treatments.batchId,
          date: treatments.date,
          name: treatments.name,
          type: treatments.type,
          status: treatments.status,
        })
        .from(treatments)
        .innerJoin(animals, eq(treatments.animalId, animals.id))
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(treatments.id, id),
            isNull(treatments.deletedAt)
          )
        )
        .limit(1);

      if (!target) return "treatment_not_found";

      const sameBatch =
        target.batchId === null
          ? and(
              isNull(treatments.batchId),
              eq(treatments.date, target.date),
              eq(treatments.name, target.name),
              eq(treatments.type, target.type),
              eq(treatments.status, target.status)
            )
          : eq(treatments.batchId, target.batchId);

      const ids =
        scope === "one"
          ? [target.id]
          : (
              await tx
                .select({ id: treatments.id })
                .from(treatments)
                .innerJoin(animals, eq(treatments.animalId, animals.id))
                .where(and(eq(animals.farmId, farmId), sameBatch, isNull(treatments.deletedAt)))
            ).map((row) => row.id);

      await tx
        .update(treatments)
        .set({ deletedAt: new Date() })
        .where(inArray(treatments.id, ids));

      return { ids };
    });
  };
}
