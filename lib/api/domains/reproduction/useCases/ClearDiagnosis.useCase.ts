import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { breedings, pregnancyDiagnoses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { findDam, type DamError } from "../_shared/findDam";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface ClearDiagnosisUseCaseProps {
  farmId: number;
  animalId: string;
  breedingId: string;
}

type ClearDiagnosisUseCaseResponse = { breedingId: string } | DamError | "breeding_not_found";

type CurrUseCase = _UseCase<ClearDiagnosisUseCaseProps, ClearDiagnosisUseCaseResponse>;

/**
 * Removes the pregnancy diagnosis of one breeding of a female — the undo of a
 * tap on the Ultrassom list. The breeding goes back to awaiting diagnosis.
 * Idempotent: a breeding with no diagnosis answers the same.
 */
export class ClearDiagnosisUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ClearDiagnosisUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, breedingId }) => {
    const dam = await findDam(this.repository, farmId, animalId);
    if (typeof dam === "string") return dam;

    // The breeding must belong to THIS female — which also scopes it to the farm.
    const [breeding] = await this.repository
      .select({ id: breedings.id })
      .from(breedings)
      .where(and(eq(breedings.id, breedingId), eq(breedings.animalId, dam.id)))
      .limit(1);
    if (!breeding) return "breeding_not_found";

    await this.repository
      .delete(pregnancyDiagnoses)
      .where(eq(pregnancyDiagnoses.breedingId, breeding.id));
    return { breedingId: breeding.id };
  };
}
