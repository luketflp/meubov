import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { Refused, resolve, type Resolved } from "./ResolveLine.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { MatchTarget } from "@/lib/domain/statements/match";

interface ConfirmHighUseCaseProps {
  farmId: number;
  userId: string;
  importId: string;
  pairs: ({ lineId: string } & MatchTarget)[];
}

/** Each pair confirmed, and how many were refused (paid by another conta meanwhile, …). */
type CurrUseCase = _UseCase<ConfirmHighUseCaseProps, { resolved: Resolved[]; refused: number }>;

/**
 * "Confirmar as N de confiança alta": pairs every line the page showed as alta,
 * each in its own transaction, so one refusal leaves the others confirmed.
 * Lines of another import are refused.
 */
export class ConfirmHighUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ConfirmHighUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, importId, pairs }) => {
    const resolved: Resolved[] = [];
    let refused = 0;
    for (const { lineId, kind, id } of pairs) {
      try {
        const result = await this.repository.transaction((tx) =>
          resolve(tx, { farmId, userId, lineId, action: { type: "match", target: { kind, id } } }).then((r) => {
            if (r.line.importId !== importId) throw new Refused("not_found");
            return r;
          })
        );
        resolved.push(result);
      } catch (error) {
        if (!(error instanceof Refused) && !isUniqueViolation(error)) throw error;
        refused += 1;
      }
    }
    return { resolved, refused };
  };
}
