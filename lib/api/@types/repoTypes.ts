/**
 * Database handles a use case can run against.
 *
 * `RepositoryType` is the query interface both the pooled client and a
 * transaction satisfy, so a use case that declares it accepts either. That is
 * what lets one use case run inside another's transaction — pass the `tx` as
 * the repository — instead of opening a nested one. `Tx` names that handle
 * where a signature has to be explicit about wanting the transaction.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { db } from "@/lib/db";
import type * as schema from "@/lib/db/schema";

/** Query interface shared by the pooled client and a transaction handle. */
export type RepositoryType = NodePgDatabase<typeof schema>;

/** Transaction handle of the app's Drizzle client. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
