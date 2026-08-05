/**
 * Stocking rate calculations (AU/ha).
 */
import type { Animal, StockingRateClass } from "@/lib/types";
import { totalWeightKg } from "@/lib/domain/weights";

/** Kilograms of live weight per Animal Unit (1 AU = 450 kg). */
export const KG_PER_AU = 450;

/** Total Animal Units: summed current weight of the active animals / 450. */
export function totalAu(animals: Animal[]): number {
  return totalWeightKg(animals) / KG_PER_AU;
}

/** Invernada stocking rate in AU per hectare. Returns 0 if hectares <= 0. */
export function stockingRateAuPerHa(animals: Animal[], hectares: number): number {
  if (hectares <= 0) return 0;
  return totalAu(animals) / hectares;
}

/**
 * Classifies the stocking rate (heuristic for managed tropical pasture):
 * - "high": >= 1.6 AU/ha (high grazing pressure, degradation risk);
 * - "good": >= 0.9 and < 1.6 AU/ha (balance range);
 * - "light": < 0.9 AU/ha (underused pasture).
 */
export function classifyStockingRate(auPerHa: number): StockingRateClass {
  if (auPerHa >= 1.6) return "high";
  if (auPerHa >= 0.9) return "good";
  return "light";
}
