/**
 * Write path — animal movements (purchase, sale, transfer).
 *
 * A movement is one row plus optional side effects on the listed animals:
 * sale deactivates them, transfer moves them to the destination lot (resolved
 * by name inside the farm, as the store always did). Everything runs in one
 * transaction; the affected animals come back as patches for the client merge.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { animals, lots, movements } from "@/lib/db/schema";
import type { Category, Movement, MovementType } from "@/lib/types";
import { toMovement } from "@/lib/api/services/mappers";

export interface NewMovementInput {
  type: MovementType;
  date: string;
  quantity: number;
  category: Category;
  origin: string;
  destination: string;
  /** Total value in BRL; required for purchase/sale (route enforces). */
  amountBrl?: number;
  notes?: string;
  earTags?: string[];
}

/** Patch applied to one animal by a sale or transfer. */
export interface AnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

export async function recordMovement(
  farmId: number,
  input: NewMovementInput
): Promise<{ movement: Movement; animals: AnimalPatch[] }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(movements)
      .values({
        id: randomUUID(),
        farmId,
        type: input.type,
        date: input.date,
        quantity: input.quantity,
        category: input.category,
        origin: input.origin,
        destination: input.destination,
        amountBrl: input.type === "transfer" ? null : input.amountBrl,
        notes: input.notes,
      })
      .returning();

    let patches: AnimalPatch[] = [];
    const earTags = input.earTags ?? [];
    if (earTags.length > 0) {
      const scope = and(eq(animals.farmId, farmId), inArray(animals.earTag, earTags));
      if (input.type === "sale") {
        patches = await tx
          .update(animals)
          .set({ active: false })
          .where(scope)
          .returning({ earTag: animals.earTag, active: animals.active, lotId: animals.lotId });
      } else if (input.type === "transfer") {
        const [destination] = await tx
          .select({ id: lots.id })
          .from(lots)
          .where(and(eq(lots.farmId, farmId), eq(lots.name, input.destination)))
          .limit(1);
        if (destination) {
          patches = await tx
            .update(animals)
            .set({ lotId: destination.id })
            .where(scope)
            .returning({ earTag: animals.earTag, active: animals.active, lotId: animals.lotId });
        }
      }
    }

    return { movement: toMovement(row), animals: patches };
  });
}
