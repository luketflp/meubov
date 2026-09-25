import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account } from "@/lib/types";

/** Absent leaves a field as it is. */
export interface AccountPatchInput {
  name?: string;
  /** True archives the conta, false restores it. */
  archived?: boolean;
}

interface UpdateAccountUseCaseProps {
  farmId: number;
  id: string;
  patch: AccountPatchInput;
}

/** Null when the conta is not on this farm. */
type UpdateAccountUseCaseResponse = Account | "duplicate" | null;

type CurrUseCase = _UseCase<UpdateAccountUseCaseProps, UpdateAccountUseCaseResponse>;

/**
 * Renames a conta (the history follows, since lançamentos point at its id) or
 * archives and restores it. A conta is never deleted.
 */
export class UpdateAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(accounts.farmId, farmId), eq(accounts.id, id));
    const [current] = await this.repository.select().from(accounts).where(scope).limit(1);
    if (!current) return null;

    const set: Partial<typeof accounts.$inferInsert> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      const [clash] = await this.repository
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.farmId, farmId),
            eq(accounts.group, current.group),
            ne(accounts.id, id),
            sql`lower(${accounts.name}) = lower(${name})`
          )
        )
        .limit(1);
      if (clash) return "duplicate";
      set.name = name;
    }
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    if (Object.keys(set).length === 0) return toAccount(current);

    try {
      const [row] = await this.repository.update(accounts).set(set).where(scope).returning();
      return row ? toAccount(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
