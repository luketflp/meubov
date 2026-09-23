import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  manejoSessionAnimals,
  manejoSessions,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { conflict, type ManejoConflict } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CloseSessionUseCaseProps {
  farmId: number;
  sessionId: string;
}

type CloseSessionUseCaseResponse = boolean | { conflict: ManejoConflict };

type CurrUseCase = _UseCase<CloseSessionUseCaseProps, CloseSessionUseCaseResponse>;

/**
 * Closes the session (remaining animals stay recorded as they are). A discarded
 * session is not found. A venda closes with every dúvida decided — boiada or
 * refugo — or it refuses with `held_pending`.
 */
export class CloseSessionUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CloseSessionUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId }) => {
    return this.repository.transaction(async (tx) => {
      // Lock the session first: setting a dúvida locks the same row, so no
      // dúvida can land between the held check below and the close.
      const [session] = await tx
        .select({ id: manejoSessions.id })
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.id, sessionId),
            eq(manejoSessions.farmId, farmId),
            isNull(manejoSessions.deletedAt)
          )
        )
        .for("update");
      if (!session) return false;

      const [held] = await tx
        .select({ animalId: manejoSessionAnimals.animalId })
        .from(manejoSessionAnimals)
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.outcome, "held")
          )
        )
        .limit(1);
      if (held) return conflict("held_pending");

      const rows = await tx
        .update(manejoSessions)
        .set({ status: "closed" })
        .where(
          and(
            eq(manejoSessions.id, session.id),
            eq(manejoSessions.farmId, farmId),
            isNull(manejoSessions.deletedAt)
          )
        )
        .returning({ id: manejoSessions.id });
      return rows.length > 0;
    });
  };
}
