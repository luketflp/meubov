import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { breedings } from "@/lib/db/schema";
import { toBreeding } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { bullEarTagOf, lockBullStock } from "@/lib/api/domains/semen/_shared/stock";

import { findDam, type DamError } from "../_shared/findDam";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Breeding,
  BreedingType,
} from "@/lib/types";

export interface NewBreedingInput {
  date: string;
  type: BreedingType;
  /**
   * Herd bull's ear tag or an external semen code (free text). With
   * `semenBullId` the server replaces it with the registered bull's code or name.
   */
  bullEarTag: string;
  /** Registered semen bull whose dose this IATF takes. */
  semenBullId?: string;
}

interface AddBreedingUseCaseProps {
  farmId: number;
  animalId: string;
  input: NewBreedingInput;
}

type AddBreedingUseCaseResponse =
  | Breeding
  | DamError
  | "bull_not_found"
  | "out_of_stock"
  | "semen_requires_timed_ai";

type CurrUseCase = _UseCase<AddBreedingUseCaseProps, AddBreedingUseCaseResponse>;

/**
 * Records a breeding (timed AI or natural mating) for one female. With a
 * registered semen bull it must be an IATF, and it takes one of the bull's
 * doses: the stock is counted under the bull's row lock, so the last dose goes
 * to one cobertura only.
 */
export class AddBreedingUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBreedingUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, input }) => {
    const { semenBullId } = input;
    if (semenBullId === undefined) {
      const dam = await findDam(this.repository, farmId, animalId);
      if (typeof dam === "string") return dam;

      const [row] = await this.repository
        .insert(breedings)
        .values({
          id: randomUUID(),
          animalId: dam.id,
          date: input.date,
          type: input.type,
          bullEarTag: input.bullEarTag.trim(),
        })
        .returning();
      return toBreeding(row);
    }

    if (input.type !== "timedAI") return "semen_requires_timed_ai";

    return this.repository.transaction(async (tx) => {
      const dam = await findDam(tx, farmId, animalId);
      if (typeof dam === "string") return dam;

      const stock = await lockBullStock(tx, farmId, semenBullId);
      if (!stock) return "bull_not_found";
      if (stock.left < 1) return "out_of_stock";

      const [row] = await tx
        .insert(breedings)
        .values({
          id: randomUUID(),
          animalId: dam.id,
          date: input.date,
          type: input.type,
          bullEarTag: bullEarTagOf(stock.bull),
          semenBullId: stock.bull.id,
        })
        .returning();
      return toBreeding(row);
    });
  };
}
