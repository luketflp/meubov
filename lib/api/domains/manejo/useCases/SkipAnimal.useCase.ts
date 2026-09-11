import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  manejoSessionAnimals,
} from "@/lib/db/schema";
import {
  toManejoSessionAnimal,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import {
  conflict,
  lockEntry,
  type ManejoConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  ManejoSessionAnimal,
} from "@/lib/types";

interface SkipAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  notes: string | undefined;
}

type SkipAnimalUseCaseResponse = ManejoSessionAnimal | { conflict: ManejoConflict } | null;

type CurrUseCase = _UseCase<SkipAnimalUseCaseProps, SkipAnimalUseCaseResponse>;

/** Marks one animal as skipped (did not pass the chute). */
export class SkipAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SkipAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, notes }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (entry.outcome !== "pending") return conflict("entry_not_actionable");

      const trimmed = notes?.trim();
      const [updated] = await tx
        .update(manejoSessionAnimals)
        .set({ outcome: "skipped", notes: trimmed ? trimmed : null })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animal.id)
          )
        )
        .returning();
      return toManejoSessionAnimal(updated, animal.earTag);
    });
  };
}
