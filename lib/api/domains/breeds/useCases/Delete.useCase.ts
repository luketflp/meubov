import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, breeds } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteBreedUseCaseProps {
  farmId: number;
  name: string;
}

/** False when an active animal still uses the breed, which blocks the delete. */
type DeleteBreedUseCaseResponse = boolean;

type CurrUseCase = _UseCase<DeleteBreedUseCaseProps, DeleteBreedUseCaseResponse>;

/** Removes a breed; false when an active animal still uses it. */
export class DeleteBreedUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBreedUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, name }) => {
    const inUse = await this.repository
      .select({ id: animals.id })
      .from(animals)
      .where(
        and(eq(animals.farmId, farmId), eq(animals.breed, name), eq(animals.active, true))
      )
      .limit(1);
    if (inUse.length > 0) return false;
    await this.repository
      .delete(breeds)
      .where(and(eq(breeds.farmId, farmId), eq(breeds.name, name)));
    return true;
  };
}
