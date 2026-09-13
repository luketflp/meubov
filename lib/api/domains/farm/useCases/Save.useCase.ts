import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm } from "@/lib/db/schema";
import { toFarmData } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { FarmData } from "@/lib/types";

type SaveFarmUseCaseProps = { farmId: number; data: Omit<FarmData, "headquarters"> };

type SaveFarmUseCaseResponse = FarmData;

type CurrUseCase = _UseCase<SaveFarmUseCaseProps, SaveFarmUseCaseResponse>;

/**
 * Updates the farm registration data. The sede is saved by
 * SaveHeadquartersUseCase and never touched here. Returns the stored row
 * rather than the input, so the caller's copy is what the database holds.
 */
export class SaveFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SaveFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, data }) => {
    const [row] = await this.repository
      .update(farm)
      .set({
        name: data.name,
        municipality: data.municipality,
        stateRegistration: data.stateRegistration,
        manager: data.manager,
      })
      .where(eq(farm.id, farmId))
      .returning();
    return toFarmData(row);
  };
}
