/**
 * The grupo a lançamento, a conta or an orçamento line names. normaliseEntry
 * (lançamentos, séries, "Criar lançamento" from a linha do extrato), AddAccount
 * and PutBudgetLine ask here before a grupo id is stored: the columns are
 * text, so nothing in the database checks them. The caller compares the kind.
 */
import { and, eq } from "drizzle-orm";

import { planGroups, type PlanGroupRow } from "@/lib/db/schema";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/**
 * The grupo of this farm by id, archived or not (an old lançamento in an
 * archived grupo still saves; the forms just stop offering it); null when it
 * is not the farm's. Takes the pooled client or a transaction.
 */
export async function farmGroup(repo: RepositoryType, farmId: number, id: string): Promise<PlanGroupRow | null> {
  const [row] = await repo
    .select()
    .from(planGroups)
    .where(and(eq(planGroups.farmId, farmId), eq(planGroups.id, id)))
    .limit(1);
  return row ?? null;
}
