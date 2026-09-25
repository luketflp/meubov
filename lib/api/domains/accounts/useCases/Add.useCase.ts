import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account, AccountGroup } from "@/lib/types";

interface AddAccountUseCaseProps {
  farmId: number;
  group: AccountGroup;
  name: string;
}

/** `duplicate` when the grupo already has the name, archived contas included. */
type AddAccountUseCaseResponse = Account | "duplicate";

type CurrUseCase = _UseCase<AddAccountUseCaseProps, AddAccountUseCaseResponse>;

/**
 * Creates a conta in a grupo. The name is compared without case first; the
 * unique index on lower(name) catches a concurrent insert of the same name.
 */
export class AddAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, group, name }) => {
    const trimmed = name.trim();
    const [clash] = await this.repository
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.farmId, farmId),
          eq(accounts.group, group),
          sql`lower(${accounts.name}) = lower(${trimmed})`
        )
      )
      .limit(1);
    if (clash) return "duplicate";

    try {
      const [row] = await this.repository
        .insert(accounts)
        .values({ id: randomUUID(), farmId, group, name: trimmed })
        .returning();
      return toAccount(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
