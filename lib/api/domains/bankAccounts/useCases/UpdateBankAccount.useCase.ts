import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { toBankAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BankAccount } from "@/lib/types";

/** Absent leaves a field as it is; null clears it. */
export interface BankAccountPatchInput {
  name?: string;
  label?: string | null;
  openingBalanceBrl?: number;
  openingDate?: string;
  isMain?: boolean;
  closingDay?: number;
  dueDay?: number;
  paysFromId?: string | null;
}

interface UpdateBankAccountUseCaseProps {
  farmId: number;
  id: string;
  patch: BankAccountPatchInput;
}

/**
 * Null when the conta is not on this farm; `main_required` when the conta
 * principal is unmarked (mark another one instead); `archived` when an
 * archived conta is marked principal.
 */
type UpdateBankAccountUseCaseResponse =
  | BankAccount
  | "invalid_pays_from"
  | "card_cannot_be_main"
  | "investment_cannot_be_main"
  | "main_required"
  | "archived"
  | null;

type CurrUseCase = _UseCase<UpdateBankAccountUseCaseProps, UpdateBankAccountUseCaseResponse>;

/**
 * Edits a conta ("Editar conta"). The kind never changes. Marking it principal
 * unmarks the current one in the same transaction. A cartão's saldo inicial is
 * what was owed on it (negative); the card fields are ignored on any other conta.
 */
export class UpdateBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    return this.repository.transaction(async (tx) => {
      const scope = and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, id));
      const [current] = await tx.select().from(bankAccounts).where(scope).limit(1).for("update");
      if (!current) return null;
      const card = current.kind === "card";
      // Only a conta corrente or a caixa receives the vendas and compras of the manejos.
      const mainable = current.kind === "checking" || current.kind === "cash";
      if (!mainable && patch.isMain) return card ? "card_cannot_be_main" : "investment_cannot_be_main";
      if (current.isMain && patch.isMain === false) return "main_required";
      if (patch.isMain && !current.isMain && current.archivedAt !== null) return "archived";
      if (card && patch.paysFromId && patch.paysFromId !== current.paysFromId) {
        const [payer] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(
              eq(bankAccounts.farmId, farmId),
              eq(bankAccounts.id, patch.paysFromId),
              eq(bankAccounts.kind, "checking"),
              isNull(bankAccounts.archivedAt)
            )
          )
          .limit(1);
        if (!payer) return "invalid_pays_from";
      }
      if (patch.isMain && !current.isMain) {
        await tx
          .update(bankAccounts)
          .set({ isMain: false })
          .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.isMain, true), ne(bankAccounts.id, id)));
      }
      const declared = {
        name: patch.name?.trim(),
        label: patch.label === undefined ? undefined : patch.label?.trim() || null,
        openingBalanceBrl: patch.openingBalanceBrl,
        openingDate: patch.openingDate,
        isMain: patch.isMain,
        closingDay: card ? patch.closingDay : undefined,
        dueDay: card ? patch.dueDay : undefined,
        paysFromId: card ? patch.paysFromId : undefined,
      };
      const set = Object.fromEntries(Object.entries(declared).filter(([, value]) => value !== undefined));
      if (Object.keys(set).length === 0) return toBankAccount(current);
      const [row] = await tx.update(bankAccounts).set(set).where(scope).returning();
      return row ? toBankAccount(row) : null;
    });
  };
}
