import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  manejoSessionAnimals,
} from "@/lib/db/schema";
import {
  toManejoSessionAnimal,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { forceReopen } from "../_shared/revert";
import {
  conflict,
  lockEntry,
  type PassConflict,
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
  /** The phone's skip wins over a pass another device already wrote. */
  force?: boolean;
}

type SkipAnimalUseCaseResponse =
  | ManejoSessionAnimal
  | PassConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<SkipAnimalUseCaseProps, SkipAnimalUseCaseResponse>;

/**
 * Marks one animal as skipped (did not pass the chute). With `force`, a pass
 * another device already wrote is undone first, in the same transaction.
 */
export class SkipAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SkipAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, notes, force }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") {
        return conflict(
          force ? "session_closed" : "session_not_open",
          toManejoSessionAnimal(entry, animal.earTag)
        );
      }
      if (entry.outcome !== "pending") {
        if (!force) return conflict("entry_not_actionable", toManejoSessionAnimal(entry, animal.earTag));
        const undone = await forceReopen(tx, { farmId, session, entry, animal });
        if (typeof undone === "string" || "conflict" in undone) return undone;
      }

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
