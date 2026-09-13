import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface EnsureFarmForUserUseCaseProps {
  userId: string;
}

type EnsureFarmForUserUseCaseResponse = number;

type CurrUseCase = _UseCase<
  EnsureFarmForUserUseCaseProps,
  EnsureFarmForUserUseCaseResponse
>;

/**
 * First-access onboarding: guarantees the user has at least one farm.
 *
 * Lazy creation (instead of a sign-up hook) covers every entry path —
 * email/password, Google OAuth and users created before multi-farm existed.
 * The per-user advisory lock makes concurrent first requests (e.g. two tabs
 * hydrating at once) create exactly one farm.
 *
 * Returns the id of the user's first live farm, creating an empty farm (with the
 * user as owner) when none exists. Field defaults mirror the empty FarmData
 * the store starts with.
 */
export class EnsureFarmForUserUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("EnsureFarmForUserUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId }) => {
    return this.repository.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const memberships = await tx
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)))
        .orderBy(farmUsers.createdAt)
        .limit(1);
      if (memberships.length > 0) return memberships[0].farmId;

      const [created] = await tx
        .insert(farm)
        .values({ name: "", municipality: "", stateRegistration: "", manager: "" })
        .returning({ id: farm.id });
      await tx
        .insert(farmUsers)
        .values({ farmId: created.id, userId, role: "owner" });
      return created.id;
    });
  };
}
