/**
 * First-access onboarding: guarantees the user has at least one farm.
 *
 * Lazy creation (instead of a sign-up hook) covers every entry path —
 * email/password, Google OAuth and users created before multi-farm existed.
 * The per-user advisory lock makes concurrent first requests (e.g. two tabs
 * hydrating at once) create exactly one farm.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";

/**
 * Returns the id of the user's first farm, creating an empty farm (with the
 * user as owner) when none exists. Field defaults mirror the empty FarmData
 * the store starts with.
 */
export async function ensureFarmForUser(userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const memberships = await tx
      .select({ farmId: farmUsers.farmId })
      .from(farmUsers)
      .where(sql`${farmUsers.userId} = ${userId}`)
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
}
