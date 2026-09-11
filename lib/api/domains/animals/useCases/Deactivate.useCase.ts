import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";


import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { InactiveReason } from "@/lib/types";

/** The baixa of an animal: why it left, when, and what happened. */
export interface DeactivateInput {
  reason: InactiveReason;
  date: string;
  notes?: string;
}

interface DeactivateAnimalUseCaseProps {
  farmId: number;
  animalId: string;
  input: DeactivateInput;
}

type DeactivateAnimalUseCaseResponse = boolean;

type CurrUseCase = _UseCase<DeactivateAnimalUseCaseProps, DeactivateAnimalUseCaseResponse>;

/**
 * Deactivates an animal (morte, perda, outro — a sale goes through a manejo de
 * venda). The date and the note ARE the record of the baixa: without them the
 * herd only knows the animal is gone, never when or why.
 * Returns false when the animal does not exist on this farm.
 */
export class DeactivateAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeactivateAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, input }) => {
    const notes = input.notes?.trim();
    const rows = await this.repository
      .update(animals)
      .set({
        active: false,
        inactiveReason: input.reason,
        inactiveDate: input.date,
        inactiveNotes: notes ? notes : null,
      })
      .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
      .returning({ id: animals.id });
    return rows.length > 0;
  };
}
