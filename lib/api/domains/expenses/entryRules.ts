/**
 * What a lançamento needs and what it stores, by kind. Add, AddSeries and
 * Update all ask here.
 *
 * - investment, financing, partners: a conta do plano of the same group and
 *   of this farm, and a movimento (a saída when none is sent). Grupo
 *   "other", no lote.
 * - yield: its aplicação as conta bancária (isPayingAccount says which one
 *   may receive it), paid on its data. No conta do plano, no vencimento, no
 *   lote, no movimento.
 * - expense, revenue: as sent. A conta, when given, must be of this farm and
 *   outside the capital groups.
 */
import { and, eq } from "drizzle-orm";

import { accounts } from "@/lib/db/schema";
import { CAPITAL_GROUPS, isCapitalKind } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { CapitalGroup, EntryFlow, EntryKind, ExpenseCategory } from "@/lib/types";

/** A lançamento as sent, or a row as it will be after a patch. */
export interface EntryInput {
  kind: EntryKind;
  flow?: EntryFlow | null;
  date: string;
  category: ExpenseCategory;
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
  category: ExpenseCategory;
  dueDate: string | null;
  paidAt: string | null;
  accountId: string | null;
  lotId: string | null;
}

/**
 * The row as it will be stored, or why not.
 *
 * `invalid_account`: a capital lançamento without a conta of its group on
 * this farm; a despesa or receita in a conta of another farm or of a capital
 * group; a rendimento with a conta do plano.
 *
 * `invalid_bank_account`: a rendimento without its aplicação.
 *
 * One select, and only when a conta do plano is sent.
 */
export async function normaliseEntry(
  repo: RepositoryType,
  farmId: number,
  entry: EntryInput
): Promise<NormalisedEntry | "invalid_account" | "invalid_bank_account"> {
  const accountId = entry.accountId ?? null;
  if (entry.kind === "yield") {
    if (accountId !== null) return "invalid_account";
    if (!entry.bankAccountId) return "invalid_bank_account";
    return {
      kind: "yield",
      flow: null,
      category: "other",
      dueDate: null,
      paidAt: entry.date,
      accountId: null,
      lotId: null,
    };
  }
  const capital = isCapitalKind(entry.kind);
  if (capital && accountId === null) return "invalid_account";
  if (accountId !== null) {
    const [account] = await repo
      .select({ group: accounts.group })
      .from(accounts)
      .where(and(eq(accounts.farmId, farmId), eq(accounts.id, accountId)))
      .limit(1);
    // A capital lançamento sits in a conta of its own group; a despesa or receita never in a capital one.
    const fits =
      account !== undefined &&
      (capital ? account.group === entry.kind : !CAPITAL_GROUPS.includes(account.group as CapitalGroup));
    if (!fits) return "invalid_account";
  }
  const common = { dueDate: entry.dueDate ?? null, paidAt: entry.paidAt ?? null, accountId };
  return capital
    ? { kind: entry.kind, flow: entry.flow ?? "out", category: "other", lotId: null, ...common }
    : { kind: entry.kind, flow: null, category: entry.category, lotId: entry.lotId ?? null, ...common };
}
