import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm } from "@/lib/db/schema";
import { toFarmData } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { FarmData } from "@/lib/types";

type SaveFarmUseCaseProps = {
  farmId: number;
  /** `safraStartMonth` absent leaves the stored one. */
  data: Omit<FarmData, "headquarters" | "safraStartMonth"> & Partial<Pick<FarmData, "safraStartMonth">>;
  /** The caller edits the Financeiro: only then may the início da safra move. */
  canEditFinance: boolean;
};

/** `finance_forbidden`: a new início da safra from a caller who does not edit the Financeiro; nothing written. */
type SaveFarmUseCaseResponse = FarmData | "finance_forbidden";

type CurrUseCase = _UseCase<SaveFarmUseCaseProps, SaveFarmUseCaseResponse>;

/**
 * Updates the farm registration data and, when sent, the início da safra. The
 * sede is saved by SaveHeadquartersUseCase and never touched here. Moving the
 * início regroups the orçamento's months, so it is Financeiro edit's to do.
 * Returns the stored row rather than the input, so the caller's copy is what
 * the database holds.
 */
export class SaveFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SaveFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, data, canEditFinance }) => {
    if (
      data.safraStartMonth !== undefined &&
      !canEditFinance &&
      data.safraStartMonth !== (await safraStartMonth(this.repository, farmId))
    ) {
      return "finance_forbidden";
    }
    const [row] = await this.repository
      .update(farm)
      .set({
        name: data.name,
        municipality: data.municipality,
        stateRegistration: data.stateRegistration,
        manager: data.manager,
        ...(data.safraStartMonth === undefined ? {} : { safraStartMonth: data.safraStartMonth }),
      })
      .where(eq(farm.id, farmId))
      .returning();
    return toFarmData(row);
  };
}
