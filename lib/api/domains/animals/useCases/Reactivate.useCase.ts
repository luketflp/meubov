import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, lots } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface ReactivateAnimalUseCaseProps {
  farmId: number;
  animalId: string;
}

type ReactivateAnimalUseCaseResponse =
  | true
  | "animal_not_found"
  | "animal_active"
  | "animal_sold"
  | "lot_deleted";

type CurrUseCase = _UseCase<ReactivateAnimalUseCaseProps, ReactivateAnimalUseCaseResponse>;

/**
 * Takes back a baixa entered by mistake (morte, perda, outro): the animal
 * returns to the active herd in the lot it left from, and the reason, date and
 * note of the baixa are cleared. A venda is refused, since deleting its manejo
 * is what undoes it (and takes its value out of the financeiro). So is an
 * animal whose lot was deleted meanwhile: it would come back to a group the
 * farmer can no longer see.
 */
export class ReactivateAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ReactivateAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId }) => {
    return this.repository.transaction(async (tx) => {
      const [row] = await tx
        .select({
          active: animals.active,
          inactiveReason: animals.inactiveReason,
          lotDeletedAt: lots.deletedAt,
        })
        .from(animals)
        .innerJoin(lots, eq(lots.id, animals.lotId))
        .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
        .for("update", { of: animals })
        .limit(1);
      if (!row) return "animal_not_found";
      if (row.active) return "animal_active";
      if (row.inactiveReason === "sale") return "animal_sold";
      if (row.lotDeletedAt) return "lot_deleted";

      await tx
        .update(animals)
        .set({ active: true, inactiveReason: null, inactiveDate: null, inactiveNotes: null })
        .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)));
      return true;
    });
  };
}
