import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  invernadas,
  lotPlacements,
} from "@/lib/db/schema";
import {
  toInvernada,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Invernada,
} from "@/lib/types";

export type RemoveInvernadaResult = Invernada | "not_found" | "in_use";

interface RemoveInvernadaUseCaseProps {
  farmId: number;
  id: string;
  /** Stamped on an invernada kept for its history; the clock by default. */
  now?: Date;
}

type RemoveInvernadaUseCaseResponse = RemoveInvernadaResult;

type CurrUseCase = _UseCase<RemoveInvernadaUseCaseProps, RemoveInvernadaUseCaseResponse>;

/**
 * Removes an invernada. One no lote ever grazed is deleted. One a lote grazes
 * now is refused (`in_use`): the lote has to be moved first. One only past
 * lotes grazed is marked removed, so their history still names it.
 */
export class RemoveInvernadaUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveInvernadaUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, now = new Date() }) => {
    return this.repository.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(invernadas)
        .where(
          and(eq(invernadas.farmId, farmId), eq(invernadas.id, id), isNull(invernadas.removedAt))
        )
        .for("update");
      if (!row) return "not_found";

      const placements = await tx
        .select({ endedOn: lotPlacements.endedOn })
        .from(lotPlacements)
        .where(
          and(
            eq(lotPlacements.farmId, farmId),
            eq(lotPlacements.invernadaId, id)
          )
        );
      if (placements.some((placement) => placement.endedOn === null)) return "in_use";

      if (placements.length > 0) {
        await tx
          .update(invernadas)
          .set({ removedAt: now })
          .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)));
        return toInvernada({ ...row, removedAt: now });
      }

      await tx
        .delete(invernadas)
        .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)));
      return toInvernada(row);
    });
  };
}
