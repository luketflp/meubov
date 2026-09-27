import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals, weighings } from "@/lib/db/schema";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { answerRefusal, forceReopen, Refused } from "../_shared/revert";
import { conflict, lockEntry, type PassConflict } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ManejoSessionAnimal, Weighing } from "@/lib/types";

/** Refugo (stays on the farm) or dúvida (decided before the venda closes). */
export type SetAsideList = "rejected" | "held";

export interface SetAsideResult {
  entry: ManejoSessionAnimal;
  /** The scale reading the pass kept, when the venda weighs. */
  weighing?: Weighing;
}

interface SetAsideAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  input: { list: SetAsideList; weightKg?: number; notes?: string };
  /** The phone's pass wins over one another device already wrote. */
  force?: boolean;
}

type SetAsideAnimalUseCaseResponse =
  | SetAsideResult
  | PassConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<SetAsideAnimalUseCaseProps, SetAsideAnimalUseCaseResponse>;

/**
 * Sets a venda's animal apart at the brete: it passed the scale but is not
 * sold. The weight read is kept as a pesagem; the animal stays in the herd.
 *
 * With `force`, a pass another device already wrote is undone first, as in
 * CompleteAnimalUseCase; a refusal after the undo takes it back.
 */
export class SetAsideAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetAsideAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, sessionId, animalId, input, force }) =>
    answerRefusal<SetAsideAnimalUseCaseResponse>(() =>
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
        if (session.kind !== "sale") return conflict("entry_not_actionable");
        if (entry.outcome !== "pending") {
          if (!force) return conflict("entry_not_actionable", toManejoSessionAnimal(entry, animal.earTag));
          const undone = await forceReopen(tx, { farmId, session, entry, animal });
          if (typeof undone === "string" || "conflict" in undone) return undone;
          if (undone.animal) animal = { ...animal, ...undone.animal };
        }
        if (!animal.active) throw new Refused(conflict("animal_inactive"));

        let weighing: Weighing | undefined;
        let weighingId: number | null = null;
        if (session.weighing && input.weightKg !== undefined) {
          weighing = { date: session.date, weightKg: input.weightKg };
          const [row] = await tx
            .insert(weighings)
            .values({ animalId, ...weighing })
            .returning();
          weighingId = row.id;
        }

        const notes = input.notes?.trim();
        const [updated] = await tx
          .update(manejoSessionAnimals)
          .set({
            outcome: input.list,
            weightKg: weighing?.weightKg ?? null,
            weighingId,
            notes: notes ? notes : null,
          })
          .where(
            and(
              eq(manejoSessionAnimals.sessionId, session.id),
              eq(manejoSessionAnimals.animalId, animalId)
            )
          )
          .returning();
        return { entry: toManejoSessionAnimal(updated, animal.earTag), weighing };
      })
    );
}
