import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, customCategories } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteCustomCategoryUseCaseProps {
  farmId: number;
  id: string;
}

/** False when an active animal still uses the category, which blocks the delete. */
type DeleteCustomCategoryUseCaseResponse = boolean;

type CurrUseCase = _UseCase<
  DeleteCustomCategoryUseCaseProps,
  DeleteCustomCategoryUseCaseResponse
>;

/** Removes a custom category; false when an active animal still uses it. */
export class DeleteCustomCategoryUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteCustomCategoryUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const inUse = await this.repository
      .select({ id: animals.id })
      .from(animals)
      .where(
        and(
          eq(animals.farmId, farmId),
          eq(animals.customCategoryId, id),
          eq(animals.active, true)
        )
      )
      .limit(1);
    if (inUse.length > 0) return false;
    await this.repository
      .delete(customCategories)
      .where(and(eq(customCategories.farmId, farmId), eq(customCategories.id, id)));
    return true;
  };
}
