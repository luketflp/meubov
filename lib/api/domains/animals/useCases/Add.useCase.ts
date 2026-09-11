
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { InsertAnimalUseCase, type NewAnimalInput } from "./Insert.useCase";
import {
  type LotAssignmentError,
} from "./ValidateLotAssignment.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal } from "@/lib/types";

interface AddAnimalUseCaseProps {
  farmId: number;
  input: NewAnimalInput;
}

type AddAnimalUseCaseResponse = Animal | LotAssignmentError | null;

type CurrUseCase = _UseCase<AddAnimalUseCaseProps, AddAnimalUseCaseResponse>;

/**
 * Registers an animal (optionally with an initial weighing dated today).
 * Returns null when the ear tag is already in use on this farm and
 * `lot_not_found` when the supplied logical lot does not belong to it.
 */
export class AddAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    try {
      return await this.repository.transaction((tx) =>
        new InsertAnimalUseCase(tx).run({ farmId, input })
      );
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  };
}
