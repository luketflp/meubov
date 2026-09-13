/**
 * Semen stock under a row lock, shared by every write that takes or gives back
 * a dose: a purchase delete, a single IATF cobertura and an inseminação pass.
 *
 * Stock is never stored. It is the doses bought minus the breedings that used
 * one, so two concurrent writes could both see the last dose. Locking the
 * bull row first serializes them; the counts are separate statements issued
 * after the lock is held, so each one reads what the previous holder committed.
 */
import { and, count, eq, sql } from "drizzle-orm";

import { breedings, semenBulls, semenPurchases } from "@/lib/db/schema";

import type { Tx } from "@/lib/api/@types/repoTypes";
import type { SemenBullRow } from "@/lib/db/schema";

/** A locked bull and its dose counts at the moment of the lock. */
export interface LockedBullStock {
  bull: SemenBullRow;
  bought: number;
  used: number;
  left: number;
}

/**
 * Locks the bull row (`FOR UPDATE`) and counts its doses. Call inside a
 * transaction; null when the bull does not exist on this farm.
 */
export async function lockBullStock(
  tx: Tx,
  farmId: number,
  bullId: string
): Promise<LockedBullStock | null> {
  const [bull] = await tx
    .select()
    .from(semenBulls)
    .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, bullId)))
    .for("update");
  if (!bull) return null;

  const [purchased] = await tx
    .select({
      bought: sql<number>`coalesce(sum(${semenPurchases.doses}), 0)`.mapWith(Number),
    })
    .from(semenPurchases)
    .where(eq(semenPurchases.bullId, bull.id));
  const [consumed] = await tx
    .select({ used: count() })
    .from(breedings)
    .where(eq(breedings.semenBullId, bull.id));

  const bought = Number(purchased?.bought ?? 0);
  const used = Number(consumed?.used ?? 0);
  return { bull, bought, used, left: bought - used };
}

/**
 * What a cobertura stores as its bull "ear tag" when it used a registered
 * bull's dose: the bull's code, or its name when it has none.
 */
export function bullEarTagOf(bull: { code: string | null; name: string }): string {
  return bull.code || bull.name;
}
