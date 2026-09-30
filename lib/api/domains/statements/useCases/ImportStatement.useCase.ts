import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, statementImports, statementLines } from "@/lib/db/schema";
import { toStatementImport } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { MAX_STATEMENT_BYTES, statementFormat } from "@/lib/domain/statements/common";
import { parseCsv } from "@/lib/domain/statements/csv";
import { parseOfx } from "@/lib/domain/statements/ofx";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { CsvMapping, StatementImport } from "@/lib/types";

/** Why a linha dated on or before the saldo inicial is set aside. */
export const BEFORE_OPENING_REASON = "antes do saldo inicial";

/** Rows per insert: Postgres takes at most 65 535 parameters in one statement. */
const CHUNK = 1000;

/** Every fresh line was written by a concurrent import: roll this one back. */
class NothingNew extends Error {}

interface ImportStatementUseCaseProps {
  farmId: number;
  userId: string;
  bankAccountId: string;
  fileName: string;
  content: string;
  mapping?: CsvMapping;
}

export interface ImportResult {
  import: StatementImport;
  newLines: number;
  skipped: number;
}

/**
 * A refusal is a code: `not_found`, `not_checking`, `too_large`,
 * `mapping_required`, `nothing_new`, or the parser's (`not_ofx`, `no_lines`,
 * `bad_date:<row>`, `bad_amount:<row>`).
 */
type ImportStatementUseCaseResponse = ImportResult | string;

type CurrUseCase = _UseCase<ImportStatementUseCaseProps, ImportStatementUseCaseResponse>;

/**
 * Reads an extrato into a conta corrente (not an archived one). Lines already imported (same
 * `externalId` in the conta) are skipped and counted; a file with nothing new
 * is refused. Lines on or before the saldo inicial arrive ignored. A CSV uses
 * the mapping sent (and keeps it on the conta) or the one the conta holds.
 */
export class ImportStatementUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ImportStatementUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, bankAccountId, fileName, content, mapping }) => {
    const [account] = await this.repository
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, bankAccountId)))
      .limit(1);
    if (!account || account.archivedAt !== null) return "not_found";
    if (account.kind !== "checking") return "not_checking";
    if (content.length > MAX_STATEMENT_BYTES) return "too_large";

    const format = statementFormat(fileName, content);
    const csvMapping = mapping ?? account.csvMapping ?? null;
    if (format === "csv" && csvMapping === null) return "mapping_required";
    const parsed = format === "ofx" ? parseOfx(content) : parseCsv(content, csvMapping!);
    if (!parsed.ok) return parsed.error;
    const { lines, bankBalance, period } = parsed.statement;

    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i += CHUNK) {
      const ids = lines.slice(i, i + CHUNK).map((l) => l.externalId);
      const rows = await this.repository
        .select({ externalId: statementLines.externalId })
        .from(statementLines)
        .where(and(eq(statementLines.bankAccountId, bankAccountId), inArray(statementLines.externalId, ids)));
      for (const row of rows) seen.add(row.externalId);
    }
    const fresh = lines.filter((l) => !seen.has(l.externalId));
    if (fresh.length === 0) return "nothing_new";

    // Lines another import of the same file wrote meanwhile are dropped on conflict;
    // the counts are what this import actually wrote, and nothing written rolls back.
    try {
      return await this.repository.transaction(async (tx) => {
        const [row] = await tx
          .insert(statementImports)
          .values({
            id: randomUUID(),
            farmId,
            bankAccountId,
            fileName,
            format,
            periodFrom: period.from,
            periodTo: period.to,
            bankBalanceBrl: bankBalance?.amountBrl ?? null,
            bankBalanceDate: bankBalance?.date ?? null,
            lineCount: 0,
            skippedCount: lines.length,
            createdBy: userId,
          })
          .returning();
        let written = 0;
        for (let i = 0; i < fresh.length; i += CHUNK) {
          const inserted = await tx
            .insert(statementLines)
            .values(
              fresh.slice(i, i + CHUNK).map((line) => {
                const before = line.date <= account.openingDate;
                return {
                  id: randomUUID(),
                  farmId,
                  bankAccountId,
                  importId: row.id,
                  date: line.date,
                  description: line.description,
                  amountBrl: line.amountBrl,
                  externalId: line.externalId,
                  status: before ? ("ignored" as const) : ("pending" as const),
                  ignoreReason: before ? BEFORE_OPENING_REASON : null,
                };
              })
            )
            // Two imports of one file racing: the second one's copies are dropped.
            .onConflictDoNothing()
            .returning({ id: statementLines.id });
          written += inserted.length;
        }
        if (written === 0) throw new NothingNew();
        const [counted] = await tx
          .update(statementImports)
          .set({ lineCount: written, skippedCount: lines.length - written })
          .where(eq(statementImports.id, row.id))
          .returning();
        if (format === "csv" && mapping) {
          await tx.update(bankAccounts).set({ csvMapping: mapping }).where(eq(bankAccounts.id, bankAccountId));
        }
        return { import: toStatementImport(counted), newLines: written, skipped: lines.length - written };
      });
    } catch (error) {
      if (error instanceof NothingNew) return "nothing_new";
      throw error;
    }
  };
}
