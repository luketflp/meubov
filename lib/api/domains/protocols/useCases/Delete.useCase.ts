import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { healthProtocols } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteProtocolUseCaseProps {
  farmId: number;
  id: string;
}

type DeleteProtocolUseCaseResponse = void;

type CurrUseCase = _UseCase<DeleteProtocolUseCaseProps, DeleteProtocolUseCaseResponse>;

/** Removes a health protocol (scheduled treatments it generated remain). */
export class DeleteProtocolUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteProtocolUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    await this.repository
      .delete(healthProtocols)
      .where(and(eq(healthProtocols.farmId, farmId), eq(healthProtocols.id, id)));
  };
}
