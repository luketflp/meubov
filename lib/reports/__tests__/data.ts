/**
 * An empty farm for the report tests, with partial overrides.
 */
import type { HerdData } from "@/lib/types";

/** Creates a farm with no records, with partial overrides. */
export function makeData(overrides: Partial<HerdData> = {}): HerdData {
  return {
    animals: [],
    treatments: [],
    lots: [],
    invernadas: [],
    lotPlacements: [],
    movements: [],
    breeds: [],
    protocols: [],
    manejoSessions: [],
    expenses: [],
    accounts: [],
    customCategories: [],
    semenBulls: [],
    farm: { name: "Fazenda Teste", municipality: "", stateRegistration: "", manager: "" },
    ...overrides,
  };
}
