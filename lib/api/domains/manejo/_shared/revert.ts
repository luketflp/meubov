/**
 * Undoing a pass: what `reopen` does, and what a forced pass does first when
 * another device already passed the animal. Call inside a transaction, after
 * `lockEntry`, with the session open and the entry not pending.
 */
import { and, eq, inArray } from "drizzle-orm";

import {
  animals,
  breedings,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
  weighings,
} from "@/lib/db/schema";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import {
  ANIMAL_PATCH_COLUMNS,
  conflict,
  lockDiagnosedBreedings,
  type AnimalPatch,
  type ManejoConflict,
} from "./session";

import type { Tx } from "@/lib/api/@types/repoTypes";
import type { ManejoSessionAnimal, Weighing } from "@/lib/types";

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

/**
 * The pass's cobertura was already diagnosed; `breedingId` names it so the
 * client can offer to clear that diagnosis first.
 */
export interface DiagnosedBreedingConflict {
  conflict: "has_diagnosis";
  breedingId: string;
}

/** Why an undo stops before its first write. */
export type RevertRefusal =
  | { conflict: ManejoConflict }
  | DiagnosedBreedingConflict
  | LotAssignmentError;

/** The rows `lockEntry` locked for the pass. */
export interface RevertContext {
  farmId: number;
  session: typeof manejoSessions.$inferSelect;
  entry: typeof manejoSessionAnimals.$inferSelect;
  animal: { id: string; earTag: string; lotId: string; active: boolean };
}

/** Reverts one animal to pending, deleting the effects its pass created. */
export async function revertEntry(
  tx: Tx,
  { farmId, session, entry, animal }: RevertContext
): Promise<ReopenResult | RevertRefusal> {
  // An animal that had a baixa stays out of the queue: there is nothing left
  // to apply to it, and in a venda the undo would even put it back in the
  // herd. Only a sold pass, whose own sale took it out, may be undone — and
  // a dúvida, which must be cleared for the venda to close: that undo only
  // resets the entry (and drops its weighing), never touching the animal.
  const soldHere = session.kind === "sale" && entry.outcome === "done";
  if (!animal.active && !soldHere && entry.outcome !== "held") {
    return conflict("animal_inactive");
  }
  const leftHerdHeld = !animal.active && entry.outcome === "held";
  const restoreLot = entry.previousLotId !== null && !leftHerdHeld;
  const earTag = animal.earTag;

  if (restoreLot && entry.previousLotId !== null) {
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
        eq(manejoSessionAnimals.animalId, animal.id)
      )
    );
    await tx.delete(animals).where(eq(animals.id, animal.id));
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
  // transferência, and back in the active herd after a boiada. A refugo
  // or a dúvida never left it.
  let patch: AnimalPatch | undefined;
  if (restoreLot || soldHere) {
    const [row] = await tx
      .update(animals)
      .set({
        ...(restoreLot && entry.previousLotId !== null ? { lotId: entry.previousLotId } : {}),
        ...(soldHere ? { active: true, inactiveReason: null, inactiveDate: null } : {}),
      })
      .where(eq(animals.id, animal.id))
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
      carcassYieldPct: null,
    })
    .where(
      and(
        eq(manejoSessionAnimals.sessionId, session.id),
        eq(manejoSessionAnimals.animalId, animal.id)
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
}

/**
 * The undo a forced pass runs before applying the phone's pass over one
 * another device wrote. An entrada's pass is never forced: undoing it
 * deletes the animal the pass would then be applied to.
 */
export async function forceReopen(
  tx: Tx,
  ctx: RevertContext
): Promise<ReopenResult | RevertRefusal> {
  if (ctx.entry.createdAnimal) return conflict("entry_not_actionable");
  return revertEntry(tx, ctx);
}

/**
 * A refusal thrown out of a pass's transaction instead of returned, so the
 * transaction rolls back (taking a forced undo with it) while
 * `answerRefusal` still answers it.
 */
export class Refused extends Error {
  readonly answer: unknown;

  constructor(answer: unknown) {
    super("pass refused");
    this.answer = answer;
  }
}

/** Runs a pass's transaction; a `Refused` thrown inside becomes the answer. */
export async function answerRefusal<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Refused) return error.answer as T;
    throw error;
  }
}
