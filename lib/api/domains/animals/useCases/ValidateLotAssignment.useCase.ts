import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { lotPlacements, lots } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** A supplied logical lot is missing, cross-farm, or archived/unplaced. */
export type LotAssignmentError = "lot_not_found";

interface ValidateLotAssignmentUseCaseProps {
  farmId: number;
  lotId: string;
}

type ValidateLotAssignmentUseCaseResponse = LotAssignmentError | null;

type CurrUseCase = _UseCase<ValidateLotAssignmentUseCaseProps, ValidateLotAssignmentUseCaseResponse>;

/**
 * Verifies an active logical-lot assignment inside the caller's transaction —
 * pass that transaction as the repository so the locks below belong to it.
 * The lot lock serializes this check with archive, movement and deletion; the
 * placement lock keeps the open assignment valid until the animal write
 * commits. Deleted, archived/unplaced and cross-farm lots are intentionally
 * exposed as the same `lot_not_found` result.
 */
export class ValidateLotAssignmentUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ValidateLotAssignmentUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, lotId }) => {
    const [lot] = await this.repository
      .select({ id: lots.id })
      .from(lots)
      .where(
        and(eq(lots.farmId, farmId), eq(lots.id, lotId), isNull(lots.deletedAt))
      )
      .for("key share");
    if (!lot) return "lot_not_found";

    const [placement] = await this.repository
      .select({ id: lotPlacements.id })
      .from(lotPlacements)
      .where(
        and(
          eq(lotPlacements.farmId, farmId),
          eq(lotPlacements.lotId, lot.id),
          isNull(lotPlacements.endedOn)
        )
      )
      .for("share");
    return placement ? null : "lot_not_found";
  };
}
