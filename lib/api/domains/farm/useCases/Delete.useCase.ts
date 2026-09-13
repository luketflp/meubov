import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers } from "@/lib/db/schema";
import { deleteVerdict } from "@/lib/domain/farms";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteFarmUseCaseProps {
  userId: string;
  farmId: number;
  now: Date;
}

type DeleteFarmUseCaseResponse = "deleted" | "farm_not_found" | "not_owner" | "last_farm";

type CurrUseCase = _UseCase<DeleteFarmUseCaseProps, DeleteFarmUseCaseResponse>;

/**
 * Soft-deletes a farm its Dono no longer wants: `deleted_at` hides it from
 * every member at once, its rows stay for a mistake to be undone by hand, and
 * its pending convites are canceled so nobody joins a farm that is gone.
 *
 * The per-user advisory lock serializes the count: two tabs cannot each delete
 * one of the user's last two farms. A superuser gets no bypass here.
 *
 * `Leave` and `RemoveMember` do not take this lock, so leaving another farm at
 * the same moment can still leave the user with no live farm; the macro then
 * falls back to a lazy empty farm, as the spec allows.
 */
export class DeleteFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, farmId, now }) => {
    return this.repository.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const live = await tx
        .select({ farmId: farmUsers.farmId, role: farmUsers.role })
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)));

      const membership = live.find((row) => row.farmId === farmId);
      if (!membership) return "farm_not_found" as const;
      const verdict = deleteVerdict({ role: membership.role, liveFarmCount: live.length });
      if (verdict !== "ok") return verdict;

      await tx.update(farm).set({ deletedAt: now }).where(eq(farm.id, farmId));
      await tx
        .update(farmInvites)
        .set({ status: "canceled", respondedAt: now })
        .where(and(eq(farmInvites.farmId, farmId), eq(farmInvites.status, "pending")));
      return "deleted" as const;
    });
  };
}
