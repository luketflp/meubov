import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals } from "@/lib/db/schema";
import { baixaPassNote } from "@/lib/domain/manejo";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { DeactivateAnimalUseCase } from "@/lib/api/domains/animals/useCases/Deactivate.useCase";

import { conflict, lockEntry, type ManejoConflict } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, ManejoSessionAnimal } from "@/lib/types";
import type { NewBaixa } from "@/lib/store/useHerdStore";

/** Result of a baixa at the brete (for the client-side merge). */
export interface BaixaResult {
  entry: ManejoSessionAnimal;
  animal: Pick<
    Animal,
    "earTag" | "active" | "inactiveReason" | "inactiveDate" | "inactiveNotes"
  >;
}

interface BaixaAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  input: NewBaixa;
}

type BaixaAnimalUseCaseResponse = BaixaResult | { conflict: ManejoConflict } | null;

type CurrUseCase = _UseCase<BaixaAnimalUseCaseProps, BaixaAnimalUseCaseResponse>;

/**
 * A baixa given at the brete: the animal leaves the herd (morte, perda, outro)
 * and its pass is skipped, with a note naming the baixa, in one transaction —
 * the queue never holds an animal that is gone, and a failed write leaves both
 * as they were.
 */
export class BaixaAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BaixaAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, input }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (entry.outcome !== "pending") return conflict("entry_not_actionable");
      if (!animal.active) return conflict("animal_inactive");

      await new DeactivateAnimalUseCase(tx).run({ farmId, animalId, input });
      const [updated] = await tx
        .update(manejoSessionAnimals)
        .set({ outcome: "skipped", notes: baixaPassNote(input.reason, input.notes) })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animal.id)
          )
        )
        .returning();

      const notes = input.notes?.trim();
      return {
        entry: toManejoSessionAnimal(updated, animal.earTag),
        animal: {
          earTag: animal.earTag,
          active: false,
          inactiveReason: input.reason,
          inactiveDate: input.date,
          inactiveNotes: notes ? notes : undefined,
        },
      };
    });
  };
}
