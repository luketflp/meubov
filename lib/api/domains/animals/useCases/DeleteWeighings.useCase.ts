import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  weighings,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";


import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteWeighingsUseCaseProps {
  farmId: number;
  date: string;
  earTags: string[];
}

type DeleteWeighingsUseCaseResponse = { count: number };

type CurrUseCase = _UseCase<DeleteWeighingsUseCaseProps, DeleteWeighingsUseCaseResponse>;

/**
 * Soft-deletes the weight readings of one day for the animals given — the
 * "Pesagem" row of the manejo history that no session ever wrote (a ficha, an
 * import). Farm-scoped through the animal, so an ear tag of another farm is
 * simply not found and nothing is written.
 */
export class DeleteWeighingsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteWeighingsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, date, earTags }) => {
    return this.repository.transaction(async (tx) => {
      const rows = await tx
        .select({ id: weighings.id })
        .from(weighings)
        .innerJoin(animals, eq(weighings.animalId, animals.id))
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(weighings.date, date),
            inArray(animals.earTag, earTags),
            isNull(weighings.deletedAt)
          )
        );
      if (rows.length === 0) return { count: 0 };
      await tx
        .update(weighings)
        .set({ deletedAt: new Date() })
        .where(
          inArray(
            weighings.id,
            rows.map((r) => r.id)
          )
        );
      return { count: rows.length };
    });
  };
}
