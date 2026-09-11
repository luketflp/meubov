
import { db } from "@/lib/db";
import { calvings } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toCalving } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  InsertAnimalUseCase,
} from "@/lib/api/domains/animals/useCases/Insert.useCase";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { findDam, type DamError } from "../_shared/findDam";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Animal,
  Calving,
  Sex,
} from "@/lib/types";

export interface NewCalvingInput {
  date: string;
  calfEarTag: string;
  calfSex: Sex;
  /** Falls back to the dam's breed / lot when omitted. */
  calfBreed?: string;
  calfLotId?: string;
  calfWeightKg?: number;
}

interface AddCalvingUseCaseProps {
  farmId: number;
  animalId: string;
  input: NewCalvingInput;
}

type AddCalvingUseCaseResponse = | { calving: Calving; calf: Animal }
  | DamError
  | "duplicate_ear_tag"
  | LotAssignmentError;

type CurrUseCase = _UseCase<AddCalvingUseCaseProps, AddCalvingUseCaseResponse>;

/**
 * Records a calving and registers the calf in the herd atomically: born on the
 * calving date, in the dam's lot and breed unless the caller overrides them.
 * Returns "duplicate_ear_tag" when the calf's ear tag is already in use — the
 * whole transaction rolls back, so no calving is left without its calf. A lot
 * override is accepted only when it belongs to this farm.
 */
export class AddCalvingUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddCalvingUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, input }) => {
    const dam = await findDam(this.repository, farmId, animalId);
    if (typeof dam === "string") return dam;

    try {
      return await this.repository.transaction(async (tx) => {
        const calf = await new InsertAnimalUseCase(tx).run({
          farmId,
          input: {
            earTag: input.calfEarTag,
            category: "calf",
            breed: input.calfBreed ?? dam.breed,
            sex: input.calfSex,
            birthDate: input.date,
            lotId: input.calfLotId ?? dam.lotId,
            initialWeightKg: input.calfWeightKg,
            initialWeightDate: input.date,
          },
        });
        if (calf === "lot_not_found") return calf;
        const [row] = await tx
          .insert(calvings)
          .values({ animalId: dam.id, date: input.date, calfEarTag: calf.earTag })
          .returning();
        return { calving: toCalving(row), calf };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate_ear_tag";
      throw error;
    }
  };
}
