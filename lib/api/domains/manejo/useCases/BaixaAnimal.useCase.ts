import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals } from "@/lib/db/schema";
import { baixaPassNote } from "@/lib/domain/manejo";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { DeactivateAnimalUseCase } from "@/lib/api/domains/animals/useCases/Deactivate.useCase";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { answerRefusal, forceReopen, Refused } from "../_shared/revert";
import { conflict, lockEntry, type PassConflict } from "../_shared/session";

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
  /** The phone's baixa wins over a pass another device already wrote. */
  force?: boolean;
}

type BaixaAnimalUseCaseResponse =
  | BaixaResult
  | PassConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<BaixaAnimalUseCaseProps, BaixaAnimalUseCaseResponse>;

/**
 * A baixa given at the brete: the animal leaves the herd (morte, perda, outro)
 * and its pass is skipped, with a note naming the baixa, in one transaction —
 * the queue never holds an animal that is gone, and a failed write leaves both
 * as they were.
 *
 * With `force`, a pass another device already wrote is undone first, as in
 * CompleteAnimalUseCase; a refusal after the undo takes it back.
 */
export class BaixaAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BaixaAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, sessionId, animalId, input, force }) =>
    answerRefusal<BaixaAnimalUseCaseResponse>(() =>
      this.repository.transaction(async (tx) => {
        const locked = await lockEntry(tx, farmId, sessionId, animalId);
        const { session, entry } = locked;
        let { animal } = locked;
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
          if (undone.animal) animal = { ...animal, ...undone.animal };
        }
        if (!animal.active) throw new Refused(conflict("animal_inactive"));

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
      })
    );
}
