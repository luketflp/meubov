import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { semenBulls, semenPurchases } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toSemenBull, toSemenPurchase } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { textOrNull } from "../_shared/text";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SemenBullRow } from "@/lib/db/schema";
import type { SemenBull } from "@/lib/types";

/** Editable fields of a bull; absent leaves a field as it is. */
export interface SemenBullPatchInput {
  name?: string;
  /** Blank clears it. */
  code?: string;
  /** Blank clears it. */
  breed?: string;
  /** Blank clears it. */
  central?: string;
}

interface UpdateBullUseCaseProps {
  farmId: number;
  id: string;
  patch: SemenBullPatchInput;
}

type UpdateBullUseCaseResponse = SemenBull | "not_found" | "duplicate_name";

type CurrUseCase = _UseCase<UpdateBullUseCaseProps, UpdateBullUseCaseResponse>;

/**
 * Edits a bull of the farm ("Editar") and returns it with its purchases. Only
 * the fields sent change; the name stays unique per farm (`duplicate_name`).
 */
export class UpdateBullUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateBullUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const set: Partial<typeof semenBulls.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.code !== undefined) set.code = textOrNull(patch.code);
    if (patch.breed !== undefined) set.breed = textOrNull(patch.breed);
    if (patch.central !== undefined) set.central = textOrNull(patch.central);

    const scope = and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, id));
    let row: SemenBullRow | undefined;
    if (Object.keys(set).length === 0) {
      [row] = await this.repository.select().from(semenBulls).where(scope).limit(1);
    } else {
      try {
        [row] = await this.repository.update(semenBulls).set(set).where(scope).returning();
      } catch (error) {
        if (isUniqueViolation(error)) return "duplicate_name";
        throw error;
      }
    }
    if (!row) return "not_found";

    const purchases = await this.repository
      .select()
      .from(semenPurchases)
      .where(eq(semenPurchases.bullId, row.id))
      .orderBy(asc(semenPurchases.date), asc(semenPurchases.id));
    return toSemenBull(row, purchases.map(toSemenPurchase));
  };
}
