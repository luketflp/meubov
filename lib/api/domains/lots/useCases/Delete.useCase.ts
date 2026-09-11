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

/** A lot that still holds the herd or an open manejo cannot be deleted. */
export type RemoveLotError = "lot_not_found" | "lot_occupied";

export interface RemoveLotResult {
  lot: Lot;
  /** The open placement, closed today because the lot grazed at least a day. */
  closedPlacement?: LotPlacement;
  /** The open placement, dropped because it started today and spans nothing. */
  removedPlacementId?: string;
}

interface RemoveLotUseCaseProps {
  farmId: number;
  id: string;
}

type RemoveLotUseCaseResponse = RemoveLotResult | RemoveLotError;

type CurrUseCase = _UseCase<RemoveLotUseCaseProps, RemoveLotUseCaseResponse>;

/**
 * Soft-deletes a logical lot: it leaves every list and picker, while the row
 * stays for the history pointing at it — past placements, manejo sessions and
 * sold animals still print the name of the group they belonged to. Deleting
 * also vacates the invernada, since a group that no longer exists cannot
 * occupy pasture.
 *
 * Refused while active animals sit in the lot, or while an open manejo session
 * has reserved it as its destination: both would strand live records on a
 * group the farmer can no longer see. Deleting an already-deleted lot repeats
 * the same answer instead of failing; only an id of no lot of this farm is a
 * 404 (a lot of another farm is indistinguishable from a missing one).
 */
export class RemoveLotUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveLotUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    return this.repository.transaction(async (tx) => {
      const [lotRow] = await tx
        .select()
        .from(lots)
        .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
        .for("update");
      if (!lotRow) return "lot_not_found";
      if (lotRow.deletedAt) return { lot: toLot(lotRow) };

      const [occupied] = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            eq(animals.farmId, farmId),
            eq(animals.lotId, id),
            eq(animals.active, true)
          )
        )
        .limit(1);
      if (occupied) return "lot_occupied";

      const [openDestinationSession] = await tx
        .select({ id: manejoSessions.id })
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.farmId, farmId),
            eq(manejoSessions.destinationLotId, id),
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
            eq(lotPlacements.lotId, id),
            isNull(lotPlacements.endedOn)
          )
        )
        .for("update");

      let closedPlacement: LotPlacement | undefined;
      let removedPlacementId: string | undefined;
      if (current) {
        const today = todayISO();
        if (today > current.startedOn) {
          const [closedRow] = await tx
            .update(lotPlacements)
            .set({ endedOn: today })
            .where(eq(lotPlacements.id, current.id))
            .returning();
          closedPlacement = toLotPlacement(closedRow);
        } else {
          // A placement starting and ending today covers no day of grazing, and
          // the period check rejects it — drop it instead of recording a void.
          await tx.delete(lotPlacements).where(eq(lotPlacements.id, current.id));
          removedPlacementId = current.id;
        }
      }

      const [deletedRow] = await tx
        .update(lots)
        .set({ deletedAt: new Date() })
        .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
        .returning();
      return { lot: toLot(deletedRow), closedPlacement, removedPlacementId };
    });
  };
}
