import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { breedings } from "@/lib/db/schema";
import { toBreeding } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { findDam, type DamError } from "../_shared/findDam";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Breeding,
  BreedingType,
} from "@/lib/types";

export interface NewBreedingInput {
  date: string;
  type: BreedingType;
  /** Herd bull's ear tag or an external semen code (free text). */
  bullEarTag: string;
}

interface AddBreedingUseCaseProps {
  farmId: number;
  animalId: string;
  input: NewBreedingInput;
}

type AddBreedingUseCaseResponse = Breeding | DamError;

type CurrUseCase = _UseCase<AddBreedingUseCaseProps, AddBreedingUseCaseResponse>;

/** Records a breeding (timed AI or natural mating) for one female. */
export class AddBreedingUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBreedingUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, input }) => {
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
  };
}
