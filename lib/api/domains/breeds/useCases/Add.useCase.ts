import { db } from "@/lib/db";
import { breeds } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface AddBreedUseCaseProps {
  farmId: number;
  name: string;
}

type AddBreedUseCaseResponse = void;

type CurrUseCase = _UseCase<AddBreedUseCaseProps, AddBreedUseCaseResponse>;

/** Registers a breed; idempotent (re-adding an existing name is a no-op). */
export class AddBreedUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBreedUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, name }) => {
    await this.repository.insert(breeds).values({ farmId, name }).onConflictDoNothing();
  };
}
