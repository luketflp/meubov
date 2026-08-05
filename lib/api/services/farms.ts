/**
 * Farm listing: which farms a user can act on.
 *
 * Regular users see the farms they are members of (oldest membership first, the
 * same ordering the farm macro uses to pick the default farm). Superusers see
 * every farm, with their real role where a membership exists and "owner"
 * elsewhere, mirroring the bypass in lib/api/plugins/farm.ts.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";

export interface FarmSummary {
  id: number;
  name: string;
  role: "owner" | "member";
}

/** Lists the farms the user can access, first item being the default farm. */
export async function listFarmsForUser(
  userId: string,
  superuser: boolean
): Promise<FarmSummary[]> {
  if (superuser) {
    const rows = await db
      .select({ id: farm.id, name: farm.name, role: farmUsers.role })
      .from(farm)
      .leftJoin(
        farmUsers,
        and(eq(farmUsers.farmId, farm.id), eq(farmUsers.userId, userId))
      )
      .orderBy(asc(farm.id));
    return rows.map((row) => ({ ...row, role: row.role ?? "owner" }));
  }

  return db
    .select({ id: farm.id, name: farm.name, role: farmUsers.role })
    .from(farmUsers)
    .innerJoin(farm, eq(farm.id, farmUsers.farmId))
    .where(eq(farmUsers.userId, userId))
    .orderBy(asc(farmUsers.createdAt));
}
