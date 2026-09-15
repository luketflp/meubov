/**
 * The registered semen bulls and the doses each has left, live from the store.
 * Counted once per change of the herd, not once per bull per render: every
 * screen that lists bulls with their doses (the brete's chips, "Touros" of an
 * inseminação, the cobertura's bull select, "Registrar compra") reads it here.
 */
import { useMemo } from "react";
import type { SemenBull } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { bullStock } from "@/lib/domain/semen";

export interface SemenStock {
  bulls: SemenBull[];
  /** Doses the bull has left; 0 for a bull the store does not have. */
  dosesLeft: (bullId: string) => number;
}

/**
 * The bulls and their doses left: a pass at the brete takes one and every
 * reader sees it at once.
 */
export function useSemenStock(): SemenStock {
  const bulls = useHerdStore((s) => s.semenBulls);
  const animals = useHerdStore((s) => s.animals);
  return useMemo(() => {
    const left = new Map(bulls.map((bull) => [bull.id, bullStock(bull, animals).left]));
    return { bulls, dosesLeft: (bullId: string) => left.get(bullId) ?? 0 };
  }, [bulls, animals]);
}
