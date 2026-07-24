import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load DATABASE_URL from .env.local so the CLI (generate/migrate/push/studio)
// sees the same connection string Next.js uses at runtime.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  casing: "snake_case",
});
