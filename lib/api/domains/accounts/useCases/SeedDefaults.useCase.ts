import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, planGroups } from "@/lib/db/schema";
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
 * "Sugerir contas padrão": creates the standard contas whose name their grupo
 * does not have yet (case-insensitive, archived contas included). A default's
 * grupo is found by name among the farm's active grupos, ignoring case; a
 * default whose grupo was renamed, archived or deleted is skipped. Running it
 * twice creates nothing the second time.
 */
export class SeedDefaultAccountsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SeedDefaultAccountsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId }) => {
    const groups = await this.repository
      .select({ id: planGroups.id, name: planGroups.name })
      .from(planGroups)
      .where(and(eq(planGroups.farmId, farmId), isNull(planGroups.archivedAt)));
    const groupId = new Map(groups.map((group) => [group.name.toLowerCase(), group.id]));
    const existing = await this.repository
      .select({ group: accounts.group, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.farmId, farmId));
    const key = (group: string, name: string) => `${group}:${name.toLowerCase()}`;
    const taken = new Set(existing.map((account) => key(account.group, account.name)));
    const missing = DEFAULT_ACCOUNTS.flatMap(({ group, name }) => {
      const id = groupId.get(group.toLowerCase());
      return id === undefined || taken.has(key(id, name)) ? [] : [{ group: id, name }];
    });
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
