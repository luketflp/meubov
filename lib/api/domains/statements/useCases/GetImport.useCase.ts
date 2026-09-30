import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { statementImports, statementLines } from "@/lib/db/schema";
import { toStatementImport, toStatementLine } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { pairKey } from "@/lib/domain/statements/match";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { StatementImport, StatementLine } from "@/lib/types";

interface GetImportUseCaseProps {
  farmId: number;
  id: string;
}

export interface ImportView {
  import: StatementImport;
  /** Oldest first. */
  lines: StatementLine[];
  /**
   * Every record some linha of the farm already confirms, as `pairKey`: never
   * offered again (a transferência only on the conta whose line pairs it).
   * The page builds the candidates from the herd it holds, minus these.
   */
  pairedIds: string[];
}

type CurrUseCase = _UseCase<GetImportUseCaseProps, ImportView | null>;

/** The Conciliar page's data; null when the import is not on this farm. */
export class GetImportUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("GetImportUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const [row] = await this.repository
      .select()
      .from(statementImports)
      .where(and(eq(statementImports.farmId, farmId), eq(statementImports.id, id)))
      .limit(1);
    if (!row) return null;
    const [lines, paired] = await Promise.all([
      this.repository
        .select()
        .from(statementLines)
        .where(and(eq(statementLines.farmId, farmId), eq(statementLines.importId, id)))
        .orderBy(asc(statementLines.date), asc(statementLines.id)),
      this.repository
        .select({
          bankAccountId: statementLines.bankAccountId,
          expenseId: statementLines.expenseId,
          movementId: statementLines.movementId,
          transferId: statementLines.transferId,
        })
        .from(statementLines)
        .where(
          and(
            eq(statementLines.farmId, farmId),
            inArray(statementLines.status, ["matched", "created", "transfer"])
          )
        ),
    ]);
    return {
      import: toStatementImport(row),
      lines: lines.map(toStatementLine),
      pairedIds: paired.map(pairKey).filter((key): key is string => key !== undefined),
    };
  };
}
