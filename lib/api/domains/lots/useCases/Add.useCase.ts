import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  farm,
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

/** Result returned when a logical lot is created in its initial invernada. */
export interface CreateLotResult {
  lot: Lot;
  placement: LotPlacement;
}

export type CreateLotError =
  | "invernada_not_found"
  | "invalid_name"
  | "duplicate_name";

interface AddLotUseCaseProps {
  farmId: number;
  input: { name: string; invernadaId: string };
}

type AddLotUseCaseResponse = CreateLotResult | CreateLotError;

type CurrUseCase = _UseCase<AddLotUseCaseProps, AddLotUseCaseResponse>;

/** Creates a logical lot and its current placement in one transaction. */
export class AddLotUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddLotUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    const name = input.name.trim();
    if (!name) return "invalid_name";

    return this.repository.transaction(async (tx) => {
      // Serializes name-based creation with bulk imports for this farm. Logical
      // lot names are user-facing identifiers in the spreadsheet import.
      await tx
        .select({ id: farm.id })
        .from(farm)
        .where(eq(farm.id, farmId))
        .for("update");

      // A deleted lot releases its name: the farmer sees no group holding it.
      const [existing] = await tx
        .select({ id: lots.id })
        .from(lots)
        .where(
          and(
            eq(lots.farmId, farmId),
            eq(lots.name, name),
            isNull(lots.deletedAt)
          )
        )
        .limit(1);
      if (existing) return "duplicate_name";

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

      const [lotRow] = await tx
        .insert(lots)
        .values({ id: randomUUID(), farmId, name, needsReview: false })
        .returning();
      const [placementRow] = await tx
        .insert(lotPlacements)
        .values({
          id: randomUUID(),
          farmId,
          lotId: lotRow.id,
          invernadaId: destination.id,
          startedOn: todayISO(),
          baseline: false,
        })
        .returning();

      return { lot: toLot(lotRow), placement: toLotPlacement(placementRow) };
    });
  };
}
