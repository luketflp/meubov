import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
  weighings,
} from "@/lib/db/schema";
import { toWeighing } from "@/lib/api/mappers";
import { saleAmount } from "@/lib/domain/movements";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Weighing } from "@/lib/types";

interface EditWeighingUseCaseProps {
  farmId: number;
  animalId: string;
  weighingId: number;
  input: Weighing;
}

/** What the session entry of a manejo weighing holds after the edit. */
export interface EditedManejoWeighing {
  sessionId: string;
  weightKg: number;
  /** Present only when the session is a venda priced by the arroba. */
  amountBrl?: number;
}

type EditWeighingUseCaseResponse =
  | { weighing: Weighing; manejo: EditedManejoWeighing | null }
  | "weighing_from_manejo"
  | null;

type CurrUseCase = _UseCase<EditWeighingUseCaseProps, EditWeighingUseCaseResponse>;

/**
 * Corrects one past weighing of an animal. A weighing no manejo wrote takes any
 * date and weight. One a pass wrote keeps the session's day (otherwise
 * `weighing_from_manejo`), and its kg is written on the session entry as well,
 * with the value of a venda priced by the arroba recalculated. Farm-scoped
 * through the animal; null when the weighing is not found or already removed.
 */
export class EditWeighingUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("EditWeighingUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, animalId, weighingId, input }) => {
    return this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: weighings.id, date: weighings.date })
        .from(weighings)
        .innerJoin(animals, eq(weighings.animalId, animals.id))
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(animals.id, animalId),
            eq(weighings.id, weighingId),
            isNull(weighings.deletedAt)
          )
        )
        .limit(1);
      if (!current) return null;

      const [entry] = await tx
        .select({
          sessionId: manejoSessionAnimals.sessionId,
          kind: manejoSessions.kind,
          pricePerArroba: manejoSessions.pricePerArroba,
          carcassYieldPct: manejoSessions.carcassYieldPct,
          outcome: manejoSessionAnimals.outcome,
          entryYieldPct: manejoSessionAnimals.carcassYieldPct,
        })
        .from(manejoSessionAnimals)
        .innerJoin(manejoSessions, eq(manejoSessionAnimals.sessionId, manejoSessions.id))
        .where(
          and(eq(manejoSessionAnimals.weighingId, current.id), isNull(manejoSessions.deletedAt))
        )
        .limit(1);
      if (entry && input.date !== current.date) return "weighing_from_manejo";

      const [row] = await tx
        .update(weighings)
        .set({ date: input.date, weightKg: input.weightKg })
        .where(eq(weighings.id, current.id))
        .returning();
      if (!entry) return { weighing: toWeighing(row), manejo: null };

      const priced = entry.kind === "sale" && entry.pricePerArroba !== null && entry.outcome === "done";
      const manejo: EditedManejoWeighing = {
        sessionId: entry.sessionId,
        weightKg: input.weightKg,
        ...(priced
          ? {
              amountBrl: saleAmount(
                input.weightKg,
                entry.pricePerArroba as number,
                entry.entryYieldPct ?? entry.carcassYieldPct ?? undefined
              ),
            }
          : {}),
      };
      await tx
        .update(manejoSessionAnimals)
        .set({
          weightKg: manejo.weightKg,
          ...(manejo.amountBrl !== undefined ? { amountBrl: manejo.amountBrl } : {}),
        })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, entry.sessionId),
            eq(manejoSessionAnimals.weighingId, current.id)
          )
        );
      return { weighing: toWeighing(row), manejo };
    });
  };
}
