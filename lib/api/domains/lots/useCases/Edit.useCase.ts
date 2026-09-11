import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  farm,
  lots,
} from "@/lib/db/schema";
import {
  toLot,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Lot,
} from "@/lib/types";

/** Editable registration fields of a logical lot. */
export interface LotPatchInput {
  name?: string;
  needsReview?: boolean;
}

interface UpdateLotUseCaseProps {
  farmId: number;
  id: string;
  patch: LotPatchInput;
}

type UpdateLotUseCaseResponse = Lot | null | "empty_patch" | "invalid_name" | "duplicate_name";

type CurrUseCase = _UseCase<UpdateLotUseCaseProps, UpdateLotUseCaseResponse>;

/**
 * Updates a logical lot's registration fields, farm-scoped.
 * `null` when no lot of this farm carries that id (a lot of another farm is
 * indistinguishable from a missing one, on purpose), `"empty_patch"` when the
 * caller sent no field, and `"invalid_name"` for whitespace-only names.
 */
export class UpdateLotUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateLotUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const set: Partial<typeof lots.$inferInsert> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) return "invalid_name";
      set.name = name;
    }
    if (patch.needsReview !== undefined) set.needsReview = patch.needsReview;
    if (Object.keys(set).length === 0) return "empty_patch";

    return this.repository.transaction(async (tx) => {
      if (set.name !== undefined) {
        await tx
          .select({ id: farm.id })
          .from(farm)
          .where(eq(farm.id, farmId))
          .for("update");
        const [duplicate] = await tx
          .select({ id: lots.id })
          .from(lots)
          .where(
            and(
              eq(lots.farmId, farmId),
              eq(lots.name, set.name),
              ne(lots.id, id),
              isNull(lots.deletedAt)
            )
          )
          .limit(1);
        if (duplicate) return "duplicate_name";
      }

      const [row] = await tx
        .update(lots)
        .set(set)
        .where(
          and(eq(lots.farmId, farmId), eq(lots.id, id), isNull(lots.deletedAt))
        )
        .returning();
      return row ? toLot(row) : null;
    });
  };
}
