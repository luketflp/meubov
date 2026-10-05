import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account, AccountGroup } from "@/lib/types";

interface AddAccountUseCaseProps {
  farmId: number;
  group: AccountGroup;
  name: string;
  /** Financing only: saldo devedor at the end of `openingDate`; both or neither. */
  openingBalanceBrl?: number;
  openingDate?: string;
}

/**
 * - `duplicate`: the grupo already has the name, archived contas included.
 * - `invalid_opening`: a saldo inicial comes without its date (or the
 *   reverse), or on a grupo that is not financiamento.
 * - `invalid_category`: the grupo is not Receitas, one fora do resultado, a
 *   built-in despesa grupo or one of this farm's.
 */
type AddAccountUseCaseResponse = Account | "duplicate" | "invalid_opening" | "invalid_category";

type CurrUseCase = _UseCase<AddAccountUseCaseProps, AddAccountUseCaseResponse>;

/** A saldo inicial comes with its date, and only on a conta de financiamento. */
export function validOpening(group: AccountGroup, balance: number | null, date: string | null): boolean {
  return balance === null ? date === null : date !== null && group === "financing";
}

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

  public run: CurrUseCase["run"] = async ({ farmId, group, name, openingBalanceBrl = null, openingDate = null }) => {
    if (!validOpening(group, openingBalanceBrl, openingDate)) return "invalid_opening";
    // Receitas and the three fora do resultado are fixed keys; any other grupo is a despesa grupo of this farm.
    const fixed = group === "revenue" || (CAPITAL_GROUPS as readonly string[]).includes(group);
    if (!fixed && !(await isFarmCategory(this.repository, farmId, group))) return "invalid_category";
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
        .values({ id: randomUUID(), farmId, group, name: trimmed, openingBalanceBrl, openingDate })
        .returning();
      return toAccount(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
