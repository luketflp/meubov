/**
 * Outline validation shared by the invernada writers.
 *
 * TypeBox already enforced shape, vertex count and coordinate ranges; what is
 * left is what JSON Schema cannot express — a ring that crosses itself or has
 * no enclosed area.
 */
import { isUsableRing, normalizeRing } from "@/lib/domain/geo";

/** Rejected because the outline is not a usable pasture ring. */
export type InvalidBoundary = "invalid_boundary";

/** Canonical outline to store, or `"invalid"` when the ring is not a pasture. */
export function sanitizeBoundary(
  boundary: [number, number][]
): [number, number][] | "invalid" {
  const ring = normalizeRing(boundary);
  if (!isUsableRing(ring)) return "invalid";
  return ring;
}
