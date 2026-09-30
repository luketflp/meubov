import { and, eq } from "drizzle-orm";

import { statementLines } from "@/lib/db/schema";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

type Pointer = "expenseId" | "movementId" | "transferId";

export interface PairedLine {
  bankAccountId: string;
  /** Signed: + entrada, − saída. */
  amountBrl: number;
}

/** True when `signed` is the line's value to the centavo. */
export function sameCents(signed: number, line: PairedLine): boolean {
  return Math.round(signed * 100) === Math.round(line.amountBrl * 100);
}

/**
 * After an edit of a paired record: every linha pointing at it through
 * `pointer` that the record no longer agrees with (`agrees`: it still moves
 * the line's value, on the line's side, in the line's conta) loses the
 * pointer, and the trigger of migration 0023 sends it back to pending. Run it
 * in the edit's transaction.
 */
export async function unpairStale(
  tx: RepositoryType,
  farmId: number,
  pointer: Pointer,
  id: string,
  agrees: (line: PairedLine) => boolean
): Promise<void> {
  const lines = await tx
    .select({ id: statementLines.id, bankAccountId: statementLines.bankAccountId, amountBrl: statementLines.amountBrl })
    .from(statementLines)
    .where(and(eq(statementLines.farmId, farmId), eq(statementLines[pointer], id)));
  for (const line of lines) {
    if (agrees(line)) continue;
    await tx
      .update(statementLines)
      .set({ [pointer]: null })
      .where(eq(statementLines.id, line.id));
  }
}
