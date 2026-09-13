import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
  weighings,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface RemoveWeighingUseCaseProps {
  farmId: number;
  animalId: string;
  weighingId: number;
}

type RemoveWeighingUseCaseResponse = { id: number } | "weighing_from_manejo" | null;

type CurrUseCase = _UseCase<RemoveWeighingUseCaseProps, RemoveWeighingUseCaseResponse>;

/**
 * Soft-deletes one weighing of an animal that no manejo wrote. A pass's
 * weighing is `weighing_from_manejo`: reopening the animal in that manejo takes
 * it back together with the session entry. Farm-scoped through the animal;
 * null when the weighing is not found or already removed.
 */
export class RemoveWeighingUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveWeighingUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, weighingId }) => {
    return this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: weighings.id })
        .from(weighings)
        .innerJoin(animals, eq(weighings.animalId, animals.id))
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(animals.id, animalId),
            eq(weighings.id, weighingId),
            isNull(weighings.deletedAt)
          )
        )
        .limit(1);
      if (!current) return null;

      const [entry] = await tx
        .select({ sessionId: manejoSessionAnimals.sessionId })
        .from(manejoSessionAnimals)
        .innerJoin(manejoSessions, eq(manejoSessionAnimals.sessionId, manejoSessions.id))
        .where(
          and(eq(manejoSessionAnimals.weighingId, current.id), isNull(manejoSessions.deletedAt))
        )
        .limit(1);
      if (entry) return "weighing_from_manejo";

      await tx
        .update(weighings)
        .set({ deletedAt: new Date() })
        .where(eq(weighings.id, current.id));
      return { id: current.id };
    });
  };
}
