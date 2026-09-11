import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { customCategories } from "@/lib/db/schema";
import { toCustomCategory } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Category, CustomCategory } from "@/lib/types";

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === UNIQUE_VIOLATION;

interface AddCustomCategoryUseCaseProps {
  farmId: number;
  name: string;
  baseCategory: Category;
}

/** Null when the name is already in use on this farm. */
type AddCustomCategoryUseCaseResponse = CustomCategory | null;

type CurrUseCase = _UseCase<
  AddCustomCategoryUseCaseProps,
  AddCustomCategoryUseCaseResponse
>;

/** Creates a custom category; null when the name is already in use on this farm. */
export class AddCustomCategoryUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddCustomCategoryUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, name, baseCategory }) => {
    try {
      const [row] = await this.repository
        .insert(customCategories)
        .values({
          id: randomUUID(),
          farmId,
          name: name.trim(),
          baseCategory,
        })
        .returning();
      return toCustomCategory(row);
    } catch (error) {
      if (isUniqueViolation(error) || isUniqueViolation((error as { cause?: unknown }).cause)) {
        return null;
      }
      throw error;
    }
  };
}
