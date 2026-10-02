import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { toBankAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BankAccount, BankAccountKind } from "@/lib/types";

interface AddBankAccountUseCaseProps {
  farmId: number;
  kind: BankAccountKind;
  name: string;
  label?: string;
  openingBalanceBrl?: number;
  openingDate: string;
  isMain?: boolean;
  closingDay?: number;
  dueDay?: number;
  paysFromId?: string;
}

/**
 * `card_days` when a cartão lacks its fechamento or vencimento day;
 * `invalid_pays_from` when "Paga pela conta" is not an active conta corrente
 * of the farm; `card_cannot_be_main` for a cartão marked principal and
 * `investment_cannot_be_main` for an aplicação marked principal.
 */
type AddBankAccountUseCaseResponse =
  | BankAccount
  | "card_days"
  | "invalid_pays_from"
  | "card_cannot_be_main"
  | "investment_cannot_be_main";

type CurrUseCase = _UseCase<AddBankAccountUseCaseProps, AddBankAccountUseCaseResponse>;

/**
 * Creates a conta. The farm's first conta corrente or caixa becomes the conta
 * principal; one marked principal takes the place of the current one.
 */
export class AddBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, kind, ...input }) => {
    const card = kind === "card";
    // Only a conta corrente or a caixa receives the vendas and compras of the manejos.
    const mainable = kind === "checking" || kind === "cash";
    if (card && (input.closingDay === undefined || input.dueDay === undefined)) return "card_days";
    if (!mainable && input.isMain) return card ? "card_cannot_be_main" : "investment_cannot_be_main";

    return this.repository.transaction(async (tx) => {
      if (card && input.paysFromId !== undefined) {
        const [payer] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(
              eq(bankAccounts.farmId, farmId),
              eq(bankAccounts.id, input.paysFromId),
              eq(bankAccounts.kind, "checking"),
              isNull(bankAccounts.archivedAt)
            )
          )
          .limit(1);
        if (!payer) return "invalid_pays_from";
      }
      const [main] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.isMain, true)))
        .limit(1)
        .for("update");
      const isMain = mainable && (input.isMain === true || !main);
      if (isMain && main) {
        await tx.update(bankAccounts).set({ isMain: false }).where(eq(bankAccounts.id, main.id));
      }
      const [row] = await tx
        .insert(bankAccounts)
        .values({
          id: randomUUID(),
          farmId,
          kind,
          name: input.name.trim(),
          label: input.label?.trim() || null,
          // A cartão's saldo inicial is what was owed on it that day, negative.
          openingBalanceBrl: input.openingBalanceBrl ?? 0,
          openingDate: input.openingDate,
          isMain,
          closingDay: card ? input.closingDay : null,
          dueDay: card ? input.dueDay : null,
          paysFromId: card ? (input.paysFromId ?? null) : null,
        })
        .returning();
      return toBankAccount(row);
    });
  };
}
