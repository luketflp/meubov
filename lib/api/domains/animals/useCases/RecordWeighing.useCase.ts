import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  weighings,
} from "@/lib/db/schema";
import { toWeighing } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";


import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Weighing } from "@/lib/types";

interface RecordWeighingUseCaseProps {
  farmId: number;
  animalId: string;
  input: Weighing;
}

type RecordWeighingUseCaseResponse = Weighing | null;

type CurrUseCase = _UseCase<RecordWeighingUseCaseProps, RecordWeighingUseCaseResponse>;

/**
 * Appends a weighing to an animal (addressed by ear tag).
 * Returns null when the animal does not exist on this farm.
 */
export class RecordWeighingUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RecordWeighingUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, input }) => {
    const [animal] = await this.repository
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
      .limit(1);
    if (!animal) return null;
    const [row] = await this.repository
      .insert(weighings)
      .values({ animalId: animal.id, date: input.date, weightKg: input.weightKg })
      .returning();
    return toWeighing(row);
  };
}
