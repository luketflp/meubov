import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  manejoSessions,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";


import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CloseSessionUseCaseProps {
  farmId: number;
  sessionId: string;
}

type CloseSessionUseCaseResponse = boolean;

type CurrUseCase = _UseCase<CloseSessionUseCaseProps, CloseSessionUseCaseResponse>;

/** Closes the session (remaining animals stay recorded as they are). */
export class CloseSessionUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CloseSessionUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId }) => {
    const rows = await this.repository
      .update(manejoSessions)
      .set({ status: "closed" })
      .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
      .returning({ id: manejoSessions.id });
    return rows.length > 0;
  };
}
