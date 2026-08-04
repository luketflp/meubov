/**
 * Write path — farm expenses (costs outside the sanitary treatments).
 * Farm-scoped; ids are server-generated uuids.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import type { Expense } from "@/lib/types";
import { toExpense } from "@/lib/api/services/mappers";

/** Registers an expense and returns it with its server-generated id. */
export async function addExpense(
  farmId: number,
  input: Omit<Expense, "id">
): Promise<Expense> {
  const [row] = await db
    .insert(expenses)
    .values({
      id: randomUUID(),
      farmId,
      date: input.date,
      category: input.category,
      amountBrl: input.amountBrl,
      notes: input.notes,
    })
    .returning();
  return toExpense(row);
}

/** Removes an expense; false when it does not exist on this farm. */
export async function removeExpense(farmId: number, id: string): Promise<boolean> {
  const rows = await db
    .delete(expenses)
    .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
    .returning({ id: expenses.id });
  return rows.length > 0;
}
