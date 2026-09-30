import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessions, movements } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { isPayingAccount } from "../payingAccount";
import { unpairStale } from "@/lib/api/domains/statements/unpairStale";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface SetMovementBankAccountUseCaseProps {
  farmId: number;
  /** A venda/compra manejo session id, or a legacy movement row id. */
  id: string;
  bankAccountId: string | null;
}

type SetMovementBankAccountUseCaseResponse =
  | { id: string; bankAccountId: string | null }
  | "invalid_bank_account"
  | null;

type CurrUseCase = _UseCase<SetMovementBankAccountUseCaseProps, SetMovementBankAccountUseCaseResponse>;

/**
 * The Extrato's "Conta" on a venda or compra. A derived one is its manejo
 * session (the ledger row carries the session id); a legacy one is its
 * movements row. Null when neither is on this farm. The conta is checked only
 * when it changes; a linha of the conta it leaves is unpaired.
 */
export class SetMovementBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetMovementBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id, bankAccountId }) =>
    this.repository.transaction(async (tx) => {
      const [session] = await tx
        .select({ bankAccountId: manejoSessions.bankAccountId })
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.farmId, farmId),
            eq(manejoSessions.id, id),
            inArray(manejoSessions.kind, ["sale", "entry"]),
            isNull(manejoSessions.deletedAt)
          )
        )
        .limit(1)
        .for("update");
      const [legacy] = session
        ? []
        : await tx
            .select({ bankAccountId: movements.bankAccountId })
            .from(movements)
            .where(
              and(eq(movements.farmId, farmId), eq(movements.id, id), inArray(movements.type, ["sale", "purchase"]))
            )
            .limit(1)
            .for("update");
      if (!session && !legacy) return null;
      // An unchanged conta saves as it is, even archived.
      if ((session ?? legacy).bankAccountId === bankAccountId) return { id, bankAccountId };
      if (bankAccountId !== null && !(await isPayingAccount(tx, farmId, bankAccountId, "revenue"))) {
        return "invalid_bank_account";
      }
      if (session) {
        await tx
          .update(manejoSessions)
          .set({ bankAccountId })
          .where(and(eq(manejoSessions.farmId, farmId), eq(manejoSessions.id, id)));
      } else {
        await tx
          .update(movements)
          .set({ bankAccountId })
          .where(and(eq(movements.farmId, farmId), eq(movements.id, id)));
      }
      // A linha of the conta it left no longer confirms it.
      await unpairStale(tx, farmId, "movementId", id, (line) => line.bankAccountId === bankAccountId);
      return { id, bankAccountId };
    });
}
