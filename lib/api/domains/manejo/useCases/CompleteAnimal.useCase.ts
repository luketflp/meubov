import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  treatments,
  weighings,
} from "@/lib/db/schema";
import { buildPassEffects } from "@/lib/domain/manejo";
import {
  toManejoPlan,
  toManejoSessionAnimal,
  toTreatment,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import {
  ANIMAL_PATCH_COLUMNS,
  conflict,
  lockEntry,
  type AnimalPatch,
  type ManejoConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  ManejoSessionAnimal,
  Treatment,
  Weighing,
} from "@/lib/types";
import type { ManejoPassData } from "@/lib/store/useHerdStore";

/** Result of one completed pass (for the client-side merge). */
export interface CompleteResult {
  entry: ManejoSessionAnimal;
  treatments: Treatment[];
  weighing?: Weighing;
  /** Present when the pass moved or sold the animal. */
  animal?: AnimalPatch;
}

interface CompleteAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  data: ManejoPassData;
}

type CompleteAnimalUseCaseResponse = CompleteResult | { conflict: ManejoConflict } | LotAssignmentError | null;

type CurrUseCase = _UseCase<CompleteAnimalUseCaseProps, CompleteAnimalUseCaseResponse>;

/** Applies the session's effects to one animal and marks it done. */
export class CompleteAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CompleteAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, data }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (entry.outcome !== "pending") return conflict("entry_not_actionable");
      const earTag = animal.earTag;

      const effects = buildPassEffects(
        {
          date: session.date,
          kind: session.kind,
          weighing: session.weighing,
          treatment: toManejoPlan(session),
          destinationLotId: session.destinationLotId ?? undefined,
          pricePerArroba: session.pricePerArroba ?? undefined,
          carcassYieldPct: session.carcassYieldPct ?? undefined,
        },
        data
      );

      if (effects.lotId !== undefined) {
        const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId: effects.lotId });
        if (lotError) return lotError;
      }

      const createdTreatments: Treatment[] = [];
      let treatmentId: string | undefined;
      let boosterId: string | undefined;
      if (effects.treatment) {
        const [row] = await tx
          .insert(treatments)
          .values({ id: randomUUID(), animalId, ...effects.treatment })
          .returning();
        treatmentId = row.id;
        createdTreatments.push(toTreatment(row, earTag));
      }
      if (effects.booster) {
        const [row] = await tx
          .insert(treatments)
          .values({ id: randomUUID(), animalId, ...effects.booster })
          .returning();
        boosterId = row.id;
        createdTreatments.push(toTreatment(row, earTag));
      }

      let weighingId: number | undefined;
      if (effects.weighing) {
        const [row] = await tx
          .insert(weighings)
          .values({ animalId, ...effects.weighing })
          .returning();
        weighingId = row.id;
      }

      // A transferência lands the animal in the destination lot and a venda takes
      // it out of the herd; the lot it came from is kept on the entry so undoing
      // the pass can put it back exactly where it was.
      let patch: AnimalPatch | undefined;
      const moves = effects.lotId !== undefined || effects.sold === true;
      if (moves) {
        const [row] = await tx
          .update(animals)
          .set({
            ...(effects.lotId !== undefined ? { lotId: effects.lotId } : {}),
            ...(effects.sold === true
              ? {
                  active: false,
                  inactiveReason: "sale" as const,
                  inactiveDate: session.date,
                }
              : {}),
          })
          .where(eq(animals.id, animalId))
          .returning(ANIMAL_PATCH_COLUMNS);
        patch = row;
      }

      const notes = data.notes?.trim();
      const [updated] = await tx
        .update(manejoSessionAnimals)
        .set({
          outcome: "done",
          weightKg: effects.weighing?.weightKg ?? null,
          notes: notes ? notes : null,
          amountBrl: effects.amountBrl ?? null,
          previousLotId: moves ? animal.lotId : null,
          treatmentId: treatmentId ?? null,
          boosterId: boosterId ?? null,
          weighingId: weighingId ?? null,
        })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animalId)
          )
        )
        .returning();

      return {
        entry: toManejoSessionAnimal(updated, earTag),
        treatments: createdTreatments,
        weighing: effects.weighing,
        animal: patch,
      };
    });
  };
}
