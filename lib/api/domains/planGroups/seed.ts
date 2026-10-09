import { randomUUID } from "node:crypto";

import { planGroups, type PlanGroupRow } from "@/lib/db/schema";
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import type { GroupKind } from "@/lib/types";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** Writes a farm's starting grupos: the eleven defaults, or the list given (a farm copied from another). */
export async function seedPlanGroups(
  repo: RepositoryType,
  farmId: number,
  groups: readonly { kind: GroupKind; name: string }[] = DEFAULT_GROUPS
): Promise<PlanGroupRow[]> {
  if (groups.length === 0) return [];
  return repo
    .insert(planGroups)
    .values(groups.map(({ kind, name }) => ({ id: randomUUID(), farmId, kind, name })))
    .returning();
}
