import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { toAccount } from "@/lib/api/mappers";
import { DEFAULT_ACCOUNTS } from "@/lib/domain/accounts";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account } from "@/lib/types";

interface SeedDefaultAccountsUseCaseProps {
  farmId: number;
}

/** The contas this call created; empty when the farm had them all. */
type SeedDefaultAccountsUseCaseResponse = { created: Account[] };

type CurrUseCase = _UseCase<SeedDefaultAccountsUseCaseProps, SeedDefaultAccountsUseCaseResponse>;

/**
 * "Sugerir contas padrão": creates the standard contas whose name the grupo
 * does not have yet (case-insensitive, archived contas included). Running it
 * twice creates nothing the second time.
 */
export class SeedDefaultAccountsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SeedDefaultAccountsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId }) => {
    const existing = await this.repository
      .select({ group: accounts.group, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.farmId, farmId));
    const key = (group: string, name: string) => `${group}:${name.toLowerCase()}`;
    const taken = new Set(existing.map((account) => key(account.group, account.name)));
    const missing = DEFAULT_ACCOUNTS.filter((account) => !taken.has(key(account.group, account.name)));
    if (missing.length === 0) return { created: [] };

    // A concurrent seed or add of the same name is skipped by the unique index.
    const rows = await this.repository
      .insert(accounts)
      .values(missing.map(({ group, name }) => ({ id: randomUUID(), farmId, group, name })))
      .onConflictDoNothing()
      .returning();
    return { created: rows.map(toAccount) };
  };
}
