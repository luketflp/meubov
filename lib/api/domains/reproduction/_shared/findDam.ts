/**
 * Dam lookup shared by every reproduction write.
 *
 * Reproduction belongs to females only, so a male is rejected here rather than
 * silently accepted by the insert below it. Kept as a plain helper instead of
 * a use case: it writes nothing and exists only to guard the three writes.
 */
import { and, eq } from "drizzle-orm";

import { animals } from "@/lib/db/schema";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** Why the dam could not be used; every write starts by resolving her. */
export type DamError = "animal_not_found" | "not_female";

/** The dam's server-side data needed to write her records and her calf's. */
export interface Dam {
  id: string;
  breed: string;
  lotId: string;
}

/** Resolves the dam by stable id inside the farm. */
export async function findDam(
  repository: RepositoryType,
  farmId: number,
  animalId: string
): Promise<Dam | DamError> {
  const [row] = await repository
    .select({
      id: animals.id,
      sex: animals.sex,
      breed: animals.breed,
      lotId: animals.lotId,
    })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
    .limit(1);
  if (!row) return "animal_not_found";
  if (row.sex !== "female") return "not_female";
  return { id: row.id, breed: row.breed, lotId: row.lotId };
}
