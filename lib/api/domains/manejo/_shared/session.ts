/**
 * Pieces every manejo use case shares: the conflict shape a concurrent write
 * returns, the row locks a pass takes, and the columns the client merges back
 * into its herd afterwards.
 */
import { and, eq } from "drizzle-orm";

import { animals, manejoSessionAnimals, manejoSessions } from "@/lib/db/schema";

import type { Tx } from "@/lib/api/@types/repoTypes";

/** Herd change a pass applied to one animal (for the client-side merge). */
export interface AnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

/** Result of one completed pass (for the client-side merge). */

export type ManejoConflict = "session_not_open" | "entry_not_actionable";

export const conflict = (code: ManejoConflict): { conflict: ManejoConflict } => ({
  conflict: code,
});

export async function lockEntry(
  tx: Tx,
  farmId: number,
  sessionId: string,
  animalId: string
) {
  const [session] = await tx
    .select()
    .from(manejoSessions)
    .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
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

/** Columns the client merges back into its herd after a pass. */
export const ANIMAL_PATCH_COLUMNS = {
  earTag: animals.earTag,
  active: animals.active,
  lotId: animals.lotId,
} as const;
