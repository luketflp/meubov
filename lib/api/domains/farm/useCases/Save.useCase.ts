import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm } from "@/lib/db/schema";
import { toFarmData } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { FarmData } from "@/lib/types";

/**
 * Registration data plus the three-valued sede: an absent `headquarters` keeps
 * the saved map view, an object replaces it, and null clears it.
 */
export type FarmDataInput = Omit<FarmData, "headquarters"> & {
  headquarters?: FarmData["headquarters"] | null;
};

type SaveFarmUseCaseProps = { farmId: number; data: FarmDataInput };

type SaveFarmUseCaseResponse = FarmData;

type CurrUseCase = _UseCase<SaveFarmUseCaseProps, SaveFarmUseCaseResponse>;

/**
 * Updates the farm registration data, and the saved map view only when the
 * caller said something about it.
 *
 * The sede is written from the map and the registration fields from Settings,
 * which knows nothing about coordinates — so a full replace here would let
 * every "Salvar" in Settings erase the map center. Returns the stored row
 * rather than the input, so the caller's copy is what the database holds.
 */
export class SaveFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SaveFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, data }) => {
    const set: Partial<typeof farm.$inferInsert> = {
      name: data.name,
      municipality: data.municipality,
      stateRegistration: data.stateRegistration,
      manager: data.manager,
    };
    if (data.headquarters !== undefined) {
      set.headquartersLat = data.headquarters?.lat ?? null;
      set.headquartersLng = data.headquarters?.lng ?? null;
      set.headquartersZoom = data.headquarters?.zoom ?? null;
    }
    const [row] = await this.repository
      .update(farm)
      .set(set)
      .where(eq(farm.id, farmId))
      .returning();
    return toFarmData(row);
  };
}
