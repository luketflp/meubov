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
 * - expense, revenue: as sent. The grupo is a built-in key or one of the
 *   farm's grupos (isFarmCategory). A conta, when given, is of this farm and
 *   agrees with the grupo: a despesa's conta sits in the despesa's grupo, a
 *   receita's in Receitas.
 */
import { and, eq } from "drizzle-orm";

import { accounts } from "@/lib/db/schema";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";
import { isCapitalKind } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, ExpenseCategory } from "@/lib/types";

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
 * `invalid_category`: a despesa or receita whose grupo is neither a built-in
 * one nor one of this farm's (archived ones count).
 *
 * `invalid_account`: a capital lançamento without a conta of its group on
 * this farm; a despesa in a conta of another grupo, a receita in a conta
 * outside Receitas, or either in a conta of another farm; a rendimento with a
 * conta do plano.
 *
 * `invalid_bank_account`: a rendimento without its aplicação.
 *
 * One select for a grupo of the farm (none for a built-in key), and one for
 * the conta do plano when it is sent.
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
      category: "other",
      dueDate: null,
      paidAt: entry.date,
      accountId: null,
      lotId: null,
    };
  }
  const capital = isCapitalKind(entry.kind);
  if (capital && accountId === null) return "invalid_account";
  // A capital lançamento stores "other"; a despesa or receita stores the grupo it sent.
  if (!capital && !(await isFarmCategory(repo, farmId, entry.category))) return "invalid_category";
  if (accountId !== null) {
    const [account] = await repo
      .select({ group: accounts.group })
      .from(accounts)
      .where(and(eq(accounts.farmId, farmId), eq(accounts.id, accountId)))
      .limit(1);
    // The conta's grupo is the lançamento's: its own group for a capital kind, Receitas for a receita, the grupo sent for a despesa.
    const group = capital ? entry.kind : entry.kind === "revenue" ? "revenue" : entry.category;
    if (account?.group !== group) return "invalid_account";
  }
  const common = { dueDate: entry.dueDate ?? null, paidAt: entry.paidAt ?? null, accountId };
  return capital
    ? { kind: entry.kind, flow: entry.flow ?? "out", category: "other", lotId: null, ...common }
    : { kind: entry.kind, flow: null, category: entry.category, lotId: entry.lotId ?? null, ...common };
}
