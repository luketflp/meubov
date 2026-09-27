import { db } from "@/lib/db";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { revertEntry, type ReopenResult, type RevertRefusal } from "../_shared/revert";
import { conflict, lockEntry } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export type { DiagnosedBreedingConflict, ReopenResult } from "../_shared/revert";

interface ReopenAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
}

type ReopenAnimalUseCaseResponse = ReopenResult | RevertRefusal | null;

type CurrUseCase = _UseCase<ReopenAnimalUseCaseProps, ReopenAnimalUseCaseResponse>;

/** Undo: reverts one animal to pending, deleting the effects its pass created. */
export class ReopenAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ReopenAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (entry.outcome === "pending") return conflict("entry_not_actionable");
      return revertEntry(tx, { farmId, session, entry, animal });
    });
  };
}
