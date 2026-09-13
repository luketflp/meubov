import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm } from "@/lib/db/schema";
import { toFarmData } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { FarmData } from "@/lib/types";

type SaveHeadquartersUseCaseProps = {
  farmId: number;
  /** The view to open the map on, or null to forget it. */
  headquarters: NonNullable<FarmData["headquarters"]> | null;
};

type SaveHeadquartersUseCaseResponse = FarmData;

type CurrUseCase = _UseCase<SaveHeadquartersUseCaseProps, SaveHeadquartersUseCaseResponse>;

/**
 * Saves the sede: where and how close the farm map opens. It has a route of
 * its own because it belongs to Lotes e Mapa while the registration fields
 * belong to Fazenda, and the two are granted separately.
 */
export class SaveHeadquartersUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SaveHeadquartersUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, headquarters }) => {
    const [row] = await this.repository
      .update(farm)
      .set({
        headquartersLat: headquarters?.lat ?? null,
        headquartersLng: headquarters?.lng ?? null,
        headquartersZoom: headquarters?.zoom ?? null,
      })
      .where(eq(farm.id, farmId))
      .returning();
    return toFarmData(row);
  };
}
