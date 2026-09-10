import type { Invernada } from "@/lib/types";

/**
 * How an invernada is named everywhere on the map: the code always, the name
 * only when the farm gave it one. Shared so a polygon tooltip, a step panel and
 * the summary sheet can never drift apart.
 */
export function invernadaLabel(invernada: Pick<Invernada, "code" | "name">): string {
  return invernada.name
    ? `Invernada ${invernada.code} · ${invernada.name}`
    : `Invernada ${invernada.code}`;
}
