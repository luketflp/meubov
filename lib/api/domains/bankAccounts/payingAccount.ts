import { and, eq } from "drizzle-orm";

import { bankAccounts } from "@/lib/db/schema";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind } from "@/lib/types";

/**
 * Whether a lançamento of `kind` may be paid from (or received into) the conta:
 * one of this farm, not archived (unless `allowArchived`: a row that already
 * holds it), and a cartão only for a despesa. A venda or compra passes
 * "revenue", which keeps cartões out.
 */
export async function isPayingAccount(
  repo: RepositoryType,
  farmId: number,
  bankAccountId: string,
  kind: EntryKind,
  allowArchived = false
): Promise<boolean> {
  const [account] = await repo
    .select({ kind: bankAccounts.kind, archivedAt: bankAccounts.archivedAt })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, bankAccountId)))
    .limit(1);
  return (
    account !== undefined &&
    (allowArchived || account.archivedAt === null) &&
    (kind === "expense" || account.kind !== "card")
  );
}
