import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { toBankAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BankAccount } from "@/lib/types";

interface ArchiveBankAccountUseCaseProps {
  farmId: number;
  id: string;
  /** True archives, false restores. */
  archived: boolean;
}

/** Null when the conta is not on this farm; `is_main` for the conta principal. */
type ArchiveBankAccountUseCaseResponse = BankAccount | "is_main" | null;

type CurrUseCase = _UseCase<ArchiveBankAccountUseCaseProps, ArchiveBankAccountUseCaseResponse>;

/**
 * Archives a conta: it leaves "Pago por" and the page, and its rows keep
 * pointing at it. The conta principal stays until another one is principal.
 */
export class ArchiveBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ArchiveBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, archived }) => {
    const scope = and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, id));
    const [current] = await this.repository.select().from(bankAccounts).where(scope).limit(1);
    if (!current) return null;
    if (archived && current.isMain) return "is_main";
    const [row] = await this.repository
      .update(bankAccounts)
      .set({ archivedAt: archived ? new Date() : null })
      .where(scope)
      .returning();
    return row ? toBankAccount(row) : null;
  };
}
