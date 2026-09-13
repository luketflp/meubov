import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  breedings,
  manejoSessionAnimals,
  treatments,
  weighings,
} from "@/lib/db/schema";
import {
  toManejoSessionAnimal,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import {
  ANIMAL_PATCH_COLUMNS,
  conflict,
  lockDiagnosedBreedings,
  lockEntry,
  type AnimalPatch,
  type ManejoConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  ManejoSessionAnimal,
  Weighing,
} from "@/lib/types";

/** Result of undoing one pass. */
export interface ReopenResult {
  entry: ManejoSessionAnimal;
  removedTreatmentIds: string[];
  removedWeighing?: Weighing;
  /** Present when the undo put the animal back in its lot or in the herd. */
  animal?: AnimalPatch;
  /** Ear tag of the animal deleted by undoing an entry pass. */
  removedEarTag?: string;
  /** Cobertura deleted by undoing an inseminação pass; its dose is back in stock. */
  removedBreedingId?: string;
}

interface ReopenAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
}

/**
 * The pass's cobertura was already diagnosed; `breedingId` names it so the
 * client can offer to clear that diagnosis first.
 */
export interface DiagnosedBreedingConflict {
  conflict: "has_diagnosis";
  breedingId: string;
}

type ReopenAnimalUseCaseResponse =
  | ReopenResult
  | { conflict: ManejoConflict }
  | DiagnosedBreedingConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<ReopenAnimalUseCaseProps, ReopenAnimalUseCaseResponse>;

/** Undo: reverts one animal to pending, deleting the effects its pass created. */
export class ReopenAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ReopenAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (entry.outcome === "pending") return conflict("entry_not_actionable");
      const earTag = animal.earTag;

      if (entry.previousLotId !== null) {
        const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId: entry.previousLotId });
        if (lotError) return lotError;
      }

      // An inseminação pass whose cobertura was already diagnosed stays: undoing
      // it would take the ultrassom result down with it.
      if (entry.breedingId !== null) {
        const diagnosed = await lockDiagnosedBreedings(tx, [entry.breedingId]);
        if (diagnosed.has(entry.breedingId)) {
          return { conflict: "has_diagnosis", breedingId: entry.breedingId };
        }
      }

      // An entry pass CREATED the animal, so undoing it removes the registration
      // altogether (weighings and the chute entry cascade with it).
      if (entry.createdAnimal) {
        await tx.delete(manejoSessionAnimals).where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animalId)
          )
        );
        await tx.delete(animals).where(eq(animals.id, animalId));
        return {
          entry: toManejoSessionAnimal(entry, earTag),
          removedTreatmentIds: [],
          removedEarTag: earTag,
        };
      }

      let removedWeighing: Weighing | undefined;
      if (entry.weighingId !== null) {
        // Soft delete: the reading leaves the herd but stays on record, the same
        // trail a whole-session delete leaves (lib/domain/manejoRevert.ts).
        const [removed] = await tx
          .update(weighings)
          .set({ deletedAt: new Date() })
          .where(eq(weighings.id, entry.weighingId))
          .returning();
        if (removed) {
          removedWeighing = { date: removed.date, weightKg: removed.weightKg };
        }
      }

      // Clear the refs BEFORE deleting the treatments and the cobertura (the FKs
      // are set-null and would race the update otherwise), then delete them.
      const removedTreatmentIds = [entry.treatmentId, entry.boosterId].filter(
        (id): id is string => id !== null
      );
      // Put the animal back where the pass found it: in its old lot after a
      // transferência, and back in the active herd after a venda.
      let patch: AnimalPatch | undefined;
      if (entry.previousLotId !== null || session.kind === "sale") {
        const [row] = await tx
          .update(animals)
          .set({
            ...(entry.previousLotId !== null ? { lotId: entry.previousLotId } : {}),
            ...(session.kind === "sale"
              ? { active: true, inactiveReason: null, inactiveDate: null }
              : {}),
          })
          .where(eq(animals.id, animalId))
          .returning(ANIMAL_PATCH_COLUMNS);
        patch = row;
      }

      const [updated] = await tx
        .update(manejoSessionAnimals)
        .set({
          outcome: "pending",
          weightKg: null,
          notes: null,
          amountBrl: null,
          previousLotId: null,
          treatmentId: null,
          boosterId: null,
          weighingId: null,
          breedingId: null,
        })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animalId)
          )
        )
        .returning();
      if (removedTreatmentIds.length > 0) {
        await tx.delete(treatments).where(inArray(treatments.id, removedTreatmentIds));
      }
      if (entry.breedingId !== null) {
        await tx.delete(breedings).where(eq(breedings.id, entry.breedingId));
      }

      return {
        entry: toManejoSessionAnimal(updated, earTag),
        removedTreatmentIds,
        removedWeighing,
        animal: patch,
        removedBreedingId: entry.breedingId ?? undefined,
      };
    });
  };
}
