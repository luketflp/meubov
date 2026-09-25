"use client";

/**
 * The farm's data as one HerdData, for the report selectors, rebuilt only
 * when a part of it changes.
 */
import { useMemo } from "react";
import type { HerdData } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";

export function useReportData(): HerdData {
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const movements = useHerdStore((s) => s.movements);
  const breeds = useHerdStore((s) => s.breeds);
  const protocols = useHerdStore((s) => s.protocols);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const customCategories = useHerdStore((s) => s.customCategories);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const farm = useHerdStore((s) => s.farm);
  return useMemo(
    () => ({
      animals,
      treatments,
      lots,
      invernadas,
      lotPlacements,
      movements,
      breeds,
      protocols,
      manejoSessions,
      expenses,
      accounts,
      customCategories,
      semenBulls,
      farm,
    }),
    [
      animals,
      treatments,
      lots,
      invernadas,
      lotPlacements,
      movements,
      breeds,
      protocols,
      manejoSessions,
      expenses,
      accounts,
      customCategories,
      semenBulls,
      farm,
    ]
  );
}
