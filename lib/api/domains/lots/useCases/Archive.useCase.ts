import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  lotPlacements,
  lots,
  manejoSessions,
} from "@/lib/db/schema";
import { todayISO } from "@/lib/domain/dates";
import {
  toLot,
  toLotPlacement,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Lot,
  LotPlacement,
} from "@/lib/types";

/** Result returned after closing a logical lot's current placement. */
export interface ArchiveLotResult {
  lot: Lot;
  previousPlacement: LotPlacement;
}

export type ArchiveLotError =
  | "lot_not_found"
  | "lot_occupied"
  | "placement_not_found"
  | "future_date"
  | "nonmonotonic_date";

interface ArchiveLotUseCaseProps {
  farmId: number;
  id: string;
  endedOn: string;
}

type ArchiveLotUseCaseResponse = ArchiveLotResult | ArchiveLotError;

type CurrUseCase = _UseCase<ArchiveLotUseCaseProps, ArchiveLotUseCaseResponse>;

/**
 * Archives a logical lot by closing its only open placement. A lot is active
 * exactly while that placement exists; no independent lifecycle flag can drift
 * out of sync. The lot and placement locks serialize archives with rotations
 * and deletion.
 */
export class ArchiveLotUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ArchiveLotUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, endedOn }) => {
    if (endedOn > todayISO()) return "future_date";

    return this.repository.transaction(async (tx) => {
      const [lotRow] = await tx
        .select()
        .from(lots)
        .where(
          and(eq(lots.farmId, farmId), eq(lots.id, id), isNull(lots.deletedAt))
        )
        .for("update");
      if (!lotRow) return "lot_not_found";

      const [occupied] = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(animals.lotId, lotRow.id),
            eq(animals.active, true)
          )
        )
        .limit(1);
      if (occupied) return "lot_occupied";

      // An open entry/transfer session may not have produced an animal yet, but
      // it has already reserved this logical lot as its destination. Closing the
      // lot now would strand that in-progress manejo.
      const [openDestinationSession] = await tx
        .select({ id: manejoSessions.id })
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.farmId, farmId),
            eq(manejoSessions.destinationLotId, lotRow.id),
            eq(manejoSessions.status, "open")
          )
        )
        .limit(1);
      if (openDestinationSession) return "lot_occupied";

      const [current] = await tx
        .select()
        .from(lotPlacements)
        .where(
          and(
            eq(lotPlacements.farmId, farmId),
            eq(lotPlacements.lotId, lotRow.id),
            isNull(lotPlacements.endedOn)
          )
        )
        .for("update");
      if (!current) return "placement_not_found";
      if (endedOn <= current.startedOn) return "nonmonotonic_date";

      const [closedRow] = await tx
        .update(lotPlacements)
        .set({ endedOn })
        .where(eq(lotPlacements.id, current.id))
        .returning();
      return {
        lot: toLot(lotRow),
        previousPlacement: toLotPlacement(closedRow),
      };
    });
  };
}
