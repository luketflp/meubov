/**
 * Herd weight calculations.
 */
import type { Animal } from "@/lib/types";
import { formatArroba, formatKg } from "@/lib/domain/format";

/** Kilograms per arroba (Brazilian beef cattle standard). */
export const KG_PER_ARROBA = 30;

/** Converts kilograms into arrobas. */
export function kgToArroba(kg: number): number {
  return kg / KG_PER_ARROBA;
}

/**
 * Weight in the app standard, with kg and arroba together, e.g.: "482 kg · 16,1 @".
 * Reuses formatKg/formatArroba/kgToArroba.
 */
export function formatWeightWithArroba(kg: number): string {
  return `${formatKg(kg)} · ${formatArroba(kgToArroba(kg))}`;
}

/**
 * Current weight of the animal: the last recorded weighing (weighings sorted asc by date).
 * Returns null if there are no weighings.
 */
export function currentWeight(a: Animal): number | null {
  if (a.weighings.length === 0) return null;
  return a.weighings[a.weighings.length - 1].weightKg;
}

/**
 * Total weight in kg of the ACTIVE animals with a recorded weighing.
 */
export function totalWeightKg(animals: Animal[]): number {
  return animals
    .filter((a) => a.active)
    .reduce((total, a) => total + (currentWeight(a) ?? 0), 0);
}
