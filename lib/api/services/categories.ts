/**
 * Write path — user-defined herd categories (mapped to a canonical base).
 * Farm-scoped; ids are server-generated uuids.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { animals, customCategories } from "@/lib/db/schema";
import type { Category, CustomCategory } from "@/lib/types";
import { toCustomCategory } from "@/lib/api/services/mappers";

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === UNIQUE_VIOLATION;

/**
 * Creates a custom category; null when the name is already in use on this farm.
 */
export async function addCustomCategory(
  farmId: number,
  input: { name: string; baseCategory: Category }
): Promise<CustomCategory | null> {
  try {
    const [row] = await db
      .insert(customCategories)
      .values({
        id: randomUUID(),
        farmId,
        name: input.name.trim(),
        baseCategory: input.baseCategory,
      })
      .returning();
    return toCustomCategory(row);
  } catch (error) {
    if (isUniqueViolation(error) || isUniqueViolation((error as { cause?: unknown }).cause)) {
      return null;
    }
    throw error;
  }
}

/** Removes a custom category; false when an active animal still uses it. */
export async function removeCustomCategory(
  farmId: number,
  id: string
): Promise<boolean> {
  const inUse = await db
    .select({ id: animals.id })
    .from(animals)
    .where(
      and(
        eq(animals.farmId, farmId),
        eq(animals.customCategoryId, id),
        eq(animals.active, true)
      )
    )
    .limit(1);
  if (inUse.length > 0) return false;
  await db
    .delete(customCategories)
    .where(and(eq(customCategories.farmId, farmId), eq(customCategories.id, id)));
  return true;
}
