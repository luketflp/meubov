/**
 * What a lançamento needs and what it stores, by kind. Add, AddSeries and
 * Update all ask here.
 *
 * - yield: its aplicação as conta bancária (isPayingAccount says which one
 *   may receive it), paid on its data. No grupo, no conta do plano, no
 *   vencimento, no lote, no movimento.
 * - every other kind: a grupo of this farm of the same kind (farmGroup;
 *   archived ones count). A conta, when given, is of this farm and sits in
 *   that grupo.
 * - investment, financing, partners: a conta is required, and a movimento
 *   (a saída when none is sent). No lote.
 */
import { and, eq } from "drizzle-orm";

import { accounts } from "@/lib/db/schema";
import { farmGroup } from "@/lib/api/domains/planGroups/farmGroup";
import { isCapitalKind } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, ExpenseCategory } from "@/lib/types";

/** A lançamento as sent, or a row as it will be after a patch. */
export interface EntryInput {
  kind: EntryKind;
  flow?: EntryFlow | null;
  date: string;
  /** Required for every kind but a rendimento. */
  category?: ExpenseCategory;
  dueDate?: string | null;
  paidAt?: string | null;
  accountId?: string | null;
  lotId?: string | null;
  bankAccountId?: string | null;
}

/** The columns the kind decides, as they are stored. */
export interface NormalisedEntry {
  kind: EntryKind;
  flow: EntryFlow | null;
  /** Null on a rendimento only. */
  category: ExpenseCategory | null;
  dueDate: string | null;
  paidAt: string | null;
  accountId: string | null;
  lotId: string | null;
}

/**
 * The row as it will be stored, or why not.
 *
 * `invalid_category`: a lançamento other than a rendimento without a grupo,
 * or whose grupo is not one of this farm's of its kind (archived ones count).
 *
 * `invalid_account`: a capital lançamento without a conta; a conta outside
 * the grupo sent or of another farm; a rendimento with a conta do plano.
 *
 * `invalid_bank_account`: a rendimento without its aplicação.
 *
 * One select for the grupo, and one for the conta do plano when it is sent.
 */
export async function normaliseEntry(
  repo: RepositoryType,
  farmId: number,
  entry: EntryInput
): Promise<NormalisedEntry | "invalid_category" | "invalid_account" | "invalid_bank_account"> {
  const accountId = entry.accountId ?? null;
  if (entry.kind === "yield") {
    if (accountId !== null) return "invalid_account";
    if (!entry.bankAccountId) return "invalid_bank_account";
    return {
      kind: "yield",
      flow: null,
      category: null,
      dueDate: null,
      paidAt: entry.date,
      accountId: null,
      lotId: null,
    };
  }
  if (!entry.category) return "invalid_category";
  const group = await farmGroup(repo, farmId, entry.category);
  if (group?.kind !== entry.kind) return "invalid_category";
  const capital = isCapitalKind(entry.kind);
  if (capital && accountId === null) return "invalid_account";
  if (accountId !== null) {
    const [account] = await repo
      .select({ group: accounts.group })
      .from(accounts)
      .where(and(eq(accounts.farmId, farmId), eq(accounts.id, accountId)))
      .limit(1);
    if (account?.group !== entry.category) return "invalid_account";
  }
  const common = {
    kind: entry.kind,
    category: entry.category,
    dueDate: entry.dueDate ?? null,
    paidAt: entry.paidAt ?? null,
    accountId,
  };
  return capital
    ? { ...common, flow: entry.flow ?? "out", lotId: null }
    : { ...common, flow: null, lotId: entry.lotId ?? null };
}
