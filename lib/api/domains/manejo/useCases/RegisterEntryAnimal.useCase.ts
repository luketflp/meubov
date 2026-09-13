import { and, count, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
} from "@/lib/db/schema";
import {
  toManejoSessionAnimal,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  InsertAnimalUseCase,
  type NewAnimalInput,
} from "@/lib/api/domains/animals/useCases/Insert.useCase";
import {
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import {
  conflict,
  type ManejoConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Animal,
  ManejoSessionAnimal,
} from "@/lib/types";

/** Result of registering one animal that arrived in an entry session. */
export interface EntryResult {
  entry: ManejoSessionAnimal;
  animal: Animal;
}

interface RegisterEntryAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  input: Omit<NewAnimalInput, "lotId"> & { notes?: string };
}

type RegisterEntryAnimalUseCaseResponse = | EntryResult
  | "duplicate"
  | { conflict: ManejoConflict }
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<RegisterEntryAnimalUseCaseProps, RegisterEntryAnimalUseCaseResponse>;

/**
 * Registers one animal arriving in an entry session (compra). The animal joins
 * the herd in the session's destination lot and its chute entry is already
 * done — it passed as it was tagged. Returns null when the session is not an
 * open entry, "duplicate" when the ear tag is already in use on the farm, and
 * `lot_not_found` for an invalid/legacy cross-farm destination.
 */
export class RegisterEntryAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RegisterEntryAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, input }) => {
    return this.repository.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.id, sessionId),
            eq(manejoSessions.farmId, farmId),
            isNull(manejoSessions.deletedAt)
          )
        )
        .for("update");
      if (!session || session.kind !== "entry" || session.destinationLotId === null) {
        return null;
      }
      if (session.status !== "open") return conflict("session_not_open");

      const [duplicate] = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.farmId, farmId), eq(animals.earTag, input.earTag)))
        .limit(1);
      if (duplicate) return "duplicate";

      const animal = await new InsertAnimalUseCase(tx).run({
        farmId,
        input: {
          ...input,
          lotId: session.destinationLotId,
          initialWeightDate: session.date,
        },
      });
      if (animal === "lot_not_found") return animal;

      const [animalRow] = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.farmId, farmId), eq(animals.earTag, animal.earTag)))
        .limit(1);

      // The chute line grows as the truck unloads: each arrival takes the next spot.
      const [line] = await tx
        .select({ handled: count() })
        .from(manejoSessionAnimals)
        .where(eq(manejoSessionAnimals.sessionId, session.id));

      const notes = input.notes?.trim();
      const [entryRow] = await tx
        .insert(manejoSessionAnimals)
        .values({
          sessionId: session.id,
          animalId: animalRow.id,
          position: line.handled,
          outcome: "done",
          weightKg: input.initialWeightKg ?? null,
          notes: notes ? notes : null,
          createdAnimal: true,
        })
        .returning();

      return { entry: toManejoSessionAnimal(entryRow, animal.earTag), animal };
    });
  };
}
