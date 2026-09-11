import { and, eq } from "drizzle-orm";

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
}

type RemoveInvernadaUseCaseResponse = RemoveInvernadaResult;

type CurrUseCase = _UseCase<RemoveInvernadaUseCaseProps, RemoveInvernadaUseCaseResponse>;

/** Deletes only an invernada with no placement history. */
export class RemoveInvernadaUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveInvernadaUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    return this.repository.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(invernadas)
        .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)))
        .for("update");
      if (!row) return "not_found";

      const [placement] = await tx
        .select({ id: lotPlacements.id })
        .from(lotPlacements)
        .where(
          and(
            eq(lotPlacements.farmId, farmId),
            eq(lotPlacements.invernadaId, id)
          )
        )
        .limit(1);
      if (placement) return "in_use";

      await tx
        .delete(invernadas)
        .where(and(eq(invernadas.farmId, farmId), eq(invernadas.id, id)));
      return toInvernada(row);
    });
  };
}
