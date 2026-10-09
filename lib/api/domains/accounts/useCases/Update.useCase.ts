import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { farmGroup } from "@/lib/api/domains/planGroups/farmGroup";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account } from "@/lib/types";

import { validOpening } from "./Add.useCase";

/** Absent leaves a field as it is; null clears it. */
export interface AccountPatchInput {
  name?: string;
  /** True archives the conta, false restores it. */
  archived?: boolean;
  /** Saldo devedor inicial of a conta de financiamento and its date: both or neither. */
  openingBalanceBrl?: number | null;
  openingDate?: string | null;
}

interface UpdateAccountUseCaseProps {
  farmId: number;
  id: string;
  patch: AccountPatchInput;
}

/**
 * - null: the conta is not on this farm.
 * - `invalid_opening`: as in AddAccount, checked on the conta as it will be
 *   after the patch.
 */
type UpdateAccountUseCaseResponse = Account | "duplicate" | "invalid_opening" | null;

type CurrUseCase = _UseCase<UpdateAccountUseCaseProps, UpdateAccountUseCaseResponse>;

/**
 * Renames a conta (the history follows, since lançamentos point at its id),
 * archives and restores it, or sets the saldo devedor inicial of a conta de
 * financiamento. A conta never changes grupo.
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
    if (patch.openingBalanceBrl !== undefined || patch.openingDate !== undefined) {
      const balance = patch.openingBalanceBrl === undefined ? current.openingBalanceBrl : patch.openingBalanceBrl;
      const date = patch.openingDate === undefined ? current.openingDate : patch.openingDate;
      // The conta's grupo says whether it may carry one: financiamentos only.
      const group = await farmGroup(this.repository, farmId, current.group);
      if (!group || !validOpening(group.kind, balance, date)) return "invalid_opening";
    }

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
    if (patch.openingBalanceBrl !== undefined) set.openingBalanceBrl = patch.openingBalanceBrl;
    if (patch.openingDate !== undefined) set.openingDate = patch.openingDate;
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
