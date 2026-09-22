import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { breedings, pregnancyDiagnoses } from "@/lib/db/schema";
import { toDiagnosis } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { findDam, type DamError } from "../_shared/findDam";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  DiagnosisResult,
  PregnancyDiagnosis,
} from "@/lib/types";

export interface NewDiagnosisInput {
  breedingId: string;
  result: DiagnosisResult;
  date: string;
  /** The vet's observação; blank stores none. */
  notes?: string;
}

interface SetDiagnosisUseCaseProps {
  farmId: number;
  animalId: string;
  input: NewDiagnosisInput;
}

type SetDiagnosisUseCaseResponse = PregnancyDiagnosis | DamError | "breeding_not_found";

type CurrUseCase = _UseCase<SetDiagnosisUseCaseProps, SetDiagnosisUseCaseResponse>;

/**
 * Records the pregnancy diagnosis of one breeding. The table keeps a single
 * diagnosis per breeding, so re-examining the same breeding (30 then 60 days)
 * overwrites the previous result instead of piling up rows — the observação
 * too, since it belongs to the exam that wrote it.
 */
export class SetDiagnosisUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetDiagnosisUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, input }) => {
    const dam = await findDam(this.repository, farmId, animalId);
    if (typeof dam === "string") return dam;

    // The breeding must belong to THIS female — which also scopes it to the farm.
    const [breeding] = await this.repository
      .select({ id: breedings.id })
      .from(breedings)
      .where(and(eq(breedings.id, input.breedingId), eq(breedings.animalId, dam.id)))
      .limit(1);
    if (!breeding) return "breeding_not_found";

    const notes = input.notes?.trim() || null;
    const [row] = await this.repository
      .insert(pregnancyDiagnoses)
      .values({ breedingId: breeding.id, result: input.result, date: input.date, notes })
      .onConflictDoUpdate({
        target: pregnancyDiagnoses.breedingId,
        set: { result: input.result, date: input.date, notes },
      })
      .returning();
    return toDiagnosis(row);
  };
}
