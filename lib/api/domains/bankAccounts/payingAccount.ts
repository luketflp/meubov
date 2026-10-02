import { and, eq } from "drizzle-orm";

import { bankAccounts } from "@/lib/db/schema";
import { mayPayFrom } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind } from "@/lib/types";

/**
 * Whether a lançamento of `kind` (and movimento `flow`) may be paid from or
 * received into the conta. The conta must be of this farm and not archived
 * (unless `allowArchived`: a row that already holds it). Its kind must be one
 * `mayPayFrom` takes: a cartão only pays a despesa or a compra of an
 * investimento, and an aplicação only receives a rendimento. A venda or a
 * compra of the manejos passes "revenue", which keeps cartões and aplicações out.
 */
export async function isPayingAccount(
  repo: RepositoryType,
  farmId: number,
  bankAccountId: string,
  kind: EntryKind,
  allowArchived = false,
  flow: EntryFlow | null = null
): Promise<boolean> {
  const [account] = await repo
    .select({ kind: bankAccounts.kind, archivedAt: bankAccounts.archivedAt })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, bankAccountId)))
    .limit(1);
  return (
    account !== undefined &&
    (allowArchived || account.archivedAt === null) &&
    mayPayFrom(account.kind, kind, flow)
  );
}
