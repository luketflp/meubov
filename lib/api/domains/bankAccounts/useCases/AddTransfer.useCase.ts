import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, transfers } from "@/lib/db/schema";
import { toTransfer } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Transfer } from "@/lib/types";

interface AddTransferUseCaseProps {
  farmId: number;
  userId: string;
  fromId: string;
  toId: string;
  date: string;
  amountBrl: number;
  notes?: string;
}

/**
 * `same_account` when De and Para are one conta; `account_not_found` when
 * either is not the farm's; `archived` when either is archived; `card_from`
 * when De is a cartão (a cartão only receives the payment of its fatura).
 */
export type TransferRefusal = "same_account" | "account_not_found" | "archived" | "card_from";

type AddTransferUseCaseResponse = Transfer | TransferRefusal;

type CurrUseCase = _UseCase<AddTransferUseCaseProps, AddTransferUseCaseResponse>;

/** Checks the contas a transferência names (only those given): null when they may take it. */
export async function checkTransferAccounts(
  repo: RepositoryType,
  farmId: number,
  ids: { fromId?: string; toId?: string }
): Promise<Exclude<TransferRefusal, "same_account"> | null> {
  const wanted = [ids.fromId, ids.toId].filter((id): id is string => id !== undefined);
  if (wanted.length === 0) return null;
  const rows = await repo
    .select({ id: bankAccounts.id, kind: bankAccounts.kind, archivedAt: bankAccounts.archivedAt })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.farmId, farmId), inArray(bankAccounts.id, wanted)));
  if (rows.length !== new Set(wanted).size) return "account_not_found";
  if (rows.some((row) => row.archivedAt !== null)) return "archived";
  if (rows.some((row) => row.id === ids.fromId && row.kind === "card")) return "card_from";
  return null;
}

/** "Transferir": money moving between two contas; the saldo em contas does not change. */
export class AddTransferUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddTransferUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, fromId, toId, date, amountBrl, notes }) => {
    if (fromId === toId) return "same_account";
    const refused = await checkTransferAccounts(this.repository, farmId, { fromId, toId });
    if (refused) return refused;
    const [row] = await this.repository
      .insert(transfers)
      .values({
        id: randomUUID(),
        farmId,
        fromId,
        toId,
        date,
        amountBrl,
        notes: notes?.trim() || null,
        createdBy: userId,
      })
      .returning();
    return toTransfer(row);
  };
}
