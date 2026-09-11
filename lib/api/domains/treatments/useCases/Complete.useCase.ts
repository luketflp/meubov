import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  treatments,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CompleteTreatmentsUseCaseProps {
  farmId: number;
  ids: string[];
}

type CompleteTreatmentsUseCaseResponse = string[];

type CurrUseCase = _UseCase<CompleteTreatmentsUseCaseProps, CompleteTreatmentsUseCaseResponse>;

/** Marks farm-scoped treatments as done; returns the ids actually updated. */
export class CompleteTreatmentsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CompleteTreatmentsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, ids }) => {
    const farmAnimals = this.repository
      .select({ id: animals.id })
      .from(animals)
      .where(eq(animals.farmId, farmId));
    const rows = await this.repository
      .update(treatments)
      .set({ status: "done" })
      .where(and(inArray(treatments.id, ids), inArray(treatments.animalId, farmAnimals)))
      .returning({ id: treatments.id });
    return rows.map((r) => r.id);
  };
}
