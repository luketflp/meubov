/**
 * "Map your farm" — what the guided setup still has to ask for.
 *
 * The flow keeps no flag of its own. Every step is derived from data that
 * already exists: the saved sede on the farm and the invernadas whose
 * `boundary` was never drawn. So the guide disappears by itself when the last
 * outline is saved, and comes back on its own the day a new invernada is
 * registered — no migration, no "onboarding done" column to go stale.
 *
 * Node-safe on purpose: no Leaflet, no React. The map layout, the step pages
 * and Vitest all read the flow from here.
 */
import type { FarmData, Invernada } from "@/lib/types";

/** One thing the farm still needs before its map is complete. */
export type MapSetupStep =
  /** No saved view: the map cannot even open where the farm is. */
  | { kind: "headquarters" }
  /** No invernada registered at all — trace one and register it from the map. */
  | { kind: "first-invernada" }
  /** A registered invernada whose fence was never traced. */
  | { kind: "invernada"; invernadaId: string };

export const MAP_ROUTE = "/map";
export const SETUP_ROUTE = `${MAP_ROUTE}/setup`;
/** Path segment that stands for "an invernada that does not exist yet". */
export const NEW_INVERNADA_SEGMENT = "nova";

/** How many of the farm's invernadas have an outline. */
export interface BoundaryProgress {
  drawn: number;
  total: number;
}

/**
 * Registered invernadas with no outline, in the order a person reads their
 * codes: "1A" before "2" before "10". A plain string sort puts "10" second,
 * which makes the walk feel arbitrary to whoever numbered the fences.
 */
export function undrawnInvernadas(invernadas: Invernada[]): Invernada[] {
  return invernadas
    .filter((invernada) => invernada.boundary === undefined)
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}

/**
 * Every step still missing, in the order to ask for them.
 *
 * `skipped` holds the invernadas the farmer passed over in this session. It is
 * deliberately not persisted: skipping means "not now", and the next visit is
 * a new now.
 */
export function pendingSteps(
  farm: Pick<FarmData, "headquarters">,
  invernadas: Invernada[],
  skipped: readonly string[] = []
): MapSetupStep[] {
  const steps: MapSetupStep[] = [];
  if (farm.headquarters === undefined) steps.push({ kind: "headquarters" });

  if (invernadas.length === 0) {
    steps.push({ kind: "first-invernada" });
    return steps;
  }

  for (const invernada of undrawnInvernadas(invernadas)) {
    if (skipped.includes(invernada.id)) continue;
    steps.push({ kind: "invernada", invernadaId: invernada.id });
  }
  return steps;
}

/** The step to send the farmer to, or null when the farm is fully mapped. */
export function nextStep(
  farm: Pick<FarmData, "headquarters">,
  invernadas: Invernada[],
  skipped: readonly string[] = []
): MapSetupStep | null {
  return pendingSteps(farm, invernadas, skipped)[0] ?? null;
}

/**
 * True when nothing is left to ask. Skips are not counted: a farm whose
 * outlines were merely postponed is not a mapped farm.
 */
export function isSetupComplete(
  farm: Pick<FarmData, "headquarters">,
  invernadas: Invernada[]
): boolean {
  return pendingSteps(farm, invernadas).length === 0;
}

/** Route that runs a step. */
export function stepHref(step: MapSetupStep): string {
  switch (step.kind) {
    case "headquarters":
      return `${SETUP_ROUTE}/sede`;
    case "first-invernada":
      return `${SETUP_ROUTE}/invernada/${NEW_INVERNADA_SEGMENT}`;
    case "invernada":
      // Ids are generated, but a path segment is not the place to trust that.
      return `${SETUP_ROUTE}/invernada/${encodeURIComponent(step.invernadaId)}`;
  }
}

/** Outlines drawn out of the invernadas registered — what the guide reports. */
export function boundaryProgress(invernadas: Invernada[]): BoundaryProgress {
  return {
    drawn: invernadas.filter((invernada) => invernada.boundary !== undefined).length,
    total: invernadas.length,
  };
}
