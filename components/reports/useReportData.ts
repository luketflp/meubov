"use client";

/**
 * The farm's data as one HerdData, for the report selectors, rebuilt only
 * when a part of it changes; and the financial reports' inputs the same way.
 */
import { useMemo } from "react";
import type { HerdData } from "@/lib/types";
import type { PlanInputs } from "@/lib/domain/planTree";
import { useHerdStore } from "@/lib/store/useHerdStore";

export function useReportData(): HerdData {
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const movements = useHerdStore((s) => s.movements);
  const breeds = useHerdStore((s) => s.breeds);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
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
      manejoSessions,
      expenses,
      accounts,
      planGroups,
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
      manejoSessions,
      expenses,
      accounts,
      planGroups,
      customCategories,
      semenBulls,
      farm,
    ]
  );
}

/** The ledger's inputs plus the contas bancárias and transferências: what the financial reports read. */
export function usePlanInputs(): PlanInputs {
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const movements = useHerdStore((s) => s.movements);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const planGroups = useHerdStore((s) => s.planGroups);
  return useMemo(
    () => ({ expenses, accounts, movements, manejoSessions, animals, lots, bankAccounts, transfers, planGroups }),
    [expenses, accounts, movements, manejoSessions, animals, lots, bankAccounts, transfers, planGroups]
  );
}
