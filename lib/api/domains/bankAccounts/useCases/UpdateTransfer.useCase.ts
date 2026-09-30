import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { transfers } from "@/lib/db/schema";
import { toTransfer } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { sameCents, unpairStale } from "@/lib/api/domains/statements/unpairStale";

import { checkTransferAccounts, type TransferRefusal } from "./AddTransfer.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Transfer } from "@/lib/types";

export interface TransferPatchInput {
  fromId?: string;
  toId?: string;
  date?: string;
  amountBrl?: number;
  notes?: string | null;
}

interface UpdateTransferUseCaseProps {
  farmId: number;
  id: string;
  patch: TransferPatchInput;
}

type UpdateTransferUseCaseResponse = Transfer | TransferRefusal | null;

type CurrUseCase = _UseCase<UpdateTransferUseCaseProps, UpdateTransferUseCaseResponse>;

/**
 * Edits a transferência; null when it is not on this farm. A conta is checked
 * only when it changes. A linha do extrato the edit no longer agrees with
 * (conta, side or value) is unpaired in the same transaction.
 */
export class UpdateTransferUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateTransferUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id, patch }) =>
    this.repository.transaction(async (tx) => {
      const scope = and(eq(transfers.farmId, farmId), eq(transfers.id, id));
      const [current] = await tx.select().from(transfers).where(scope).limit(1).for("update");
      if (!current) return null;
      const fromId = patch.fromId ?? current.fromId;
      const toId = patch.toId ?? current.toId;
      if (fromId === toId) return "same_account";
      const refused = await checkTransferAccounts(tx, farmId, {
        fromId: fromId !== current.fromId ? fromId : undefined,
        toId: toId !== current.toId ? toId : undefined,
      });
      if (refused) return refused;
      const [row] = await tx
        .update(transfers)
        .set({
          fromId,
          toId,
          date: patch.date ?? current.date,
          amountBrl: patch.amountBrl ?? current.amountBrl,
          notes: patch.notes === undefined ? current.notes : patch.notes?.trim() || null,
        })
        .where(scope)
        .returning();
      if (!row) return null;
      if (fromId !== current.fromId || toId !== current.toId || row.amountBrl !== current.amountBrl) {
        await unpairStale(
          tx,
          farmId,
          "transferId",
          id,
          (line) =>
            (line.bankAccountId === row.toId && sameCents(row.amountBrl, line)) ||
            (line.bankAccountId === row.fromId && sameCents(-row.amountBrl, line))
        );
      }
      return toTransfer(row);
    });
}
