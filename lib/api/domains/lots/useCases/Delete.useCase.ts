import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  lotPlacements,
  lots,
  manejoSessionAnimals,
  manejoSessions,
  statementLines,
} from "@/lib/db/schema";
import { todayISO } from "@/lib/domain/dates";
import { hasMoney } from "@/lib/domain/moneyRedaction";
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

/**
 * A lot that still holds the herd or an open manejo cannot be deleted; a purge
 * that would empty a manejo with money also needs Financeiro edit.
 */
export type RemoveLotError = "lot_not_found" | "lot_occupied" | "finance_required";

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
  /** Delete the lot's active animals too; false for a member without Financeiro edit. */
  purge?: { canEditFinance: boolean };
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
 *
 * `purge` is for a lot entered by mistake: its active animals go for good, and
 * their weighings, treatments, coberturas, partos and passes go with them by
 * cascade. A manejo left without any animal is deleted the way "Excluir manejo"
 * does it. Animals that already left the lot stay, as does the lot row they
 * point at. Every refusal comes before the first write, since a transaction
 * that returns one still commits.
 */
export class RemoveLotUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveLotUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, purge }) => {
    return this.repository.transaction(async (tx) => {
      const [lotRow] = await tx
        .select()
        .from(lots)
        .where(and(eq(lots.farmId, farmId), eq(lots.id, id)))
        .for("update");
      if (!lotRow) return "lot_not_found";
      if (lotRow.deletedAt) return { lot: toLot(lotRow) };

      // Locked, so a pass or a weighing on one of them waits for the purge
      // and then finds no animal.
      const herdIds = (
        await tx
          .select({ id: animals.id })
          .from(animals)
          .where(
            and(
              eq(animals.farmId, farmId),
              eq(animals.lotId, id),
              eq(animals.active, true)
            )
          )
          .for("update")
      ).map((animal) => animal.id);
      if (herdIds.length > 0 && !purge) return "lot_occupied";

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

      if (purge && herdIds.length > 0) {
        // One row per pass, so a manejo comes once per animal of the lot.
        const touched = new Map(
          (
            await tx
              .select({
                id: manejoSessions.id,
                status: manejoSessions.status,
                pricePerArroba: manejoSessions.pricePerArroba,
                totalAmountBrl: manejoSessions.totalAmountBrl,
                planCostBrl: manejoSessions.planCostBrl,
              })
              .from(manejoSessionAnimals)
              .innerJoin(manejoSessions, eq(manejoSessionAnimals.sessionId, manejoSessions.id))
              .where(
                and(
                  inArray(manejoSessionAnimals.animalId, herdIds),
                  isNull(manejoSessions.deletedAt)
                )
              )
          ).map((session) => [session.id, session])
        );
        if ([...touched.values()].some((session) => session.status === "open")) {
          return "lot_occupied";
        }
        // What is left once the manejos with another animal drop out is what
        // the purge empties.
        if (touched.size > 0) {
          const kept = await tx
            .select({ id: manejoSessionAnimals.sessionId })
            .from(manejoSessionAnimals)
            .where(
              and(
                inArray(manejoSessionAnimals.sessionId, [...touched.keys()]),
                notInArray(manejoSessionAnimals.animalId, herdIds)
              )
            );
          for (const session of kept) touched.delete(session.id);
        }
        if (!purge.canEditFinance && [...touched.values()].some(hasMoney)) {
          return "finance_required";
        }

        await tx.delete(animals).where(inArray(animals.id, herdIds));
        const emptiedIds = [...touched.keys()];
        if (emptiedIds.length > 0) {
          await tx
            .update(manejoSessions)
            .set({ deletedAt: new Date() })
            .where(inArray(manejoSessions.id, emptiedIds));
          // The linha do extrato a venda or entrada confirmed goes back to
          // pending (a trigger resets the status).
          await tx
            .update(statementLines)
            .set({ movementId: null })
            .where(
              and(
                eq(statementLines.farmId, farmId),
                inArray(statementLines.movementId, emptiedIds)
              )
            );
        }
      }

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
