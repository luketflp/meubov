/**
 * Drizzle client for the MeuBov app.
 *
 * Uses node-postgres (`pg`) because the local database is a plain Postgres
 * running in Docker (see docker-compose.yml). This is the single app-side
 * database handle; the repository swap (MockHerdRepository -> DB-backed
 * implementation) will consume `db` in a later step.
 *
 * The connection string comes from `DATABASE_URL` (loaded by Next.js from
 * `.env.local`). We fail fast with a clear message when it is missing.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/lib/db/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Define it in .env.local (see .env.example).",
  );
}

/** Shared connection pool for the app's Postgres database. */
const pool = new Pool({ connectionString });

/** Drizzle instance bound to the schema, with snake_case column mapping. */
export const db = drizzle(pool, { schema, casing: "snake_case" });
