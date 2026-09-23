import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals, weighings } from "@/lib/db/schema";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { conflict, lockEntry, type ManejoConflict } from "../_shared/session";

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
}

type SetAsideAnimalUseCaseResponse = SetAsideResult | { conflict: ManejoConflict } | null;

type CurrUseCase = _UseCase<SetAsideAnimalUseCaseProps, SetAsideAnimalUseCaseResponse>;

/**
 * Sets a venda's animal apart at the brete: it passed the scale but is not
 * sold. The weight read is kept as a pesagem; the animal stays in the herd.
 */
export class SetAsideAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetAsideAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, input }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (session.kind !== "sale" || entry.outcome !== "pending") {
        return conflict("entry_not_actionable");
      }
      if (!animal.active) return conflict("animal_inactive");

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
    });
  };
}
