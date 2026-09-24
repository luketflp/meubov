import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  invernadas,
  lotPlacements,
  lots,
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

/** Request fields for a whole-lot rotation. */
export interface MoveLotInput {
  invernadaId: string;
  startedOn: string;
  notes?: string;
}

/** Response the store can merge without reloading the whole herd. */
export interface MoveLotResult {
  lot: Lot;
  placement: LotPlacement;
  previousPlacement: LotPlacement;
}

export type MoveLotError =
  | "lot_not_found"
  | "invernada_not_found"
  | "placement_not_found"
  | "same_destination"
  | "future_date"
  | "nonmonotonic_date";

interface MoveLotUseCaseProps {
  farmId: number;
  id: string;
  input: MoveLotInput;
}

type MoveLotUseCaseResponse = MoveLotResult | MoveLotError;

type CurrUseCase = _UseCase<MoveLotUseCaseProps, MoveLotUseCaseResponse>;

/**
 * Moves a whole logical lot atomically. Locking the lot serializes competing
 * devices even before the current placement row is read; the partial unique
 * index remains the database-level invariant for one open placement per lot.
 */
export class MoveLotUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("MoveLotUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, input }) => {
    if (input.startedOn > todayISO()) return "future_date";

    return this.repository.transaction(async (tx) => {
      const [lotRow] = await tx
        .select()
        .from(lots)
        .where(
          and(eq(lots.farmId, farmId), eq(lots.id, id), isNull(lots.deletedAt))
        )
        .for("update");
      if (!lotRow) return "lot_not_found";

      const [destination] = await tx
        .select({ id: invernadas.id })
        .from(invernadas)
        .where(
          and(
            eq(invernadas.farmId, farmId),
            eq(invernadas.id, input.invernadaId),
            // A removed invernada takes no lote.
            isNull(invernadas.removedAt)
          )
        )
        .for("key share")
        .limit(1);
      if (!destination) return "invernada_not_found";

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
      if (current.invernadaId === destination.id) return "same_destination";
      if (input.startedOn <= current.startedOn) return "nonmonotonic_date";

      const [closedRow] = await tx
        .update(lotPlacements)
        .set({ endedOn: input.startedOn })
        .where(eq(lotPlacements.id, current.id))
        .returning();
      const notes = input.notes?.trim();
      const [placementRow] = await tx
        .insert(lotPlacements)
        .values({
          id: randomUUID(),
          farmId,
          lotId: lotRow.id,
          invernadaId: destination.id,
          startedOn: input.startedOn,
          notes: notes || null,
          baseline: false,
        })
        .returning();

      return {
        lot: toLot(lotRow),
        placement: toLotPlacement(placementRow),
        previousPlacement: toLotPlacement(closedRow),
      };
    });
  };
}
