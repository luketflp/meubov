/**
 * Pieces every manejo use case shares: the conflict shape a concurrent write
 * returns, the row locks a pass, an undo and a delete take, and the columns the
 * client merges back into its herd afterwards.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  animals,
  breedings,
  manejoSessionAnimals,
  manejoSessions,
  pregnancyDiagnoses,
} from "@/lib/db/schema";
import { isDiagnosed } from "@/lib/domain/reproduction";

import type { Tx } from "@/lib/api/@types/repoTypes";

/** Herd change a pass applied to one animal (for the client-side merge). */
export interface AnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

/** Result of one completed pass (for the client-side merge). */

/**
 * Why a pass cannot be written right now. `out_of_stock`: the inseminação bull
 * has no dose left. `has_diagnosis`: the cobertura a pass wrote was already
 * diagnosed, so undoing the pass would erase the ultrassom too.
 */
export type ManejoConflict =
  | "session_not_open"
  | "entry_not_actionable"
  | "out_of_stock"
  | "has_diagnosis";

export const conflict = (code: ManejoConflict): { conflict: ManejoConflict } => ({
  conflict: code,
});

/**
 * Locks the session and the animal's chute entry (`FOR UPDATE`) for one pass.
 * A discarded session answers like a missing one, and so does a delete that
 * commits while the pass waits for the lock: the row it gets is re-checked.
 * Call inside a transaction.
 */
export async function lockEntry(
  tx: Tx,
  farmId: number,
  sessionId: string,
  animalId: string
) {
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
  if (!session) return { session: undefined, entry: undefined, animal: undefined };
  const [animal] = await tx
    .select({ id: animals.id, earTag: animals.earTag, lotId: animals.lotId })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
    .limit(1);
  if (!animal) return { session, entry: undefined, animal: undefined };
  const [entry] = await tx
    .select()
    .from(manejoSessionAnimals)
    .where(
      and(
        eq(manejoSessionAnimals.sessionId, session.id),
        eq(manejoSessionAnimals.animalId, animal.id)
      )
    )
    .for("update");
  return { session, entry, animal };
}

/**
 * Locks the coberturas that passes recorded (`FOR UPDATE`) and returns the ids
 * of those already diagnosed pregnant or open: the ones an undo or a delete
 * must not take down. The diagnoses are read, and locked, in a statement of
 * their own once the coberturas are held, so a diagnosis written meanwhile is
 * either seen here or waits for this transaction and then fails its foreign
 * key — never cascaded away unseen with its cobertura. Call inside a
 * transaction.
 */
export async function lockDiagnosedBreedings(
  tx: Tx,
  breedingIds: string[]
): Promise<Set<string>> {
  if (breedingIds.length === 0) return new Set();
  await tx
    .select({ id: breedings.id })
    .from(breedings)
    .where(inArray(breedings.id, breedingIds))
    .for("update");
  const diagnoses = await tx
    .select({ breedingId: pregnancyDiagnoses.breedingId, result: pregnancyDiagnoses.result })
    .from(pregnancyDiagnoses)
    .where(inArray(pregnancyDiagnoses.breedingId, breedingIds))
    .for("update");
  return new Set(diagnoses.filter((d) => isDiagnosed(d.result)).map((d) => d.breedingId));
}

/** Columns the client merges back into its herd after a pass. */
export const ANIMAL_PATCH_COLUMNS = {
  earTag: animals.earTag,
  active: animals.active,
  lotId: animals.lotId,
} as const;
