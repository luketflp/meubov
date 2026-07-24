import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Production database. Set PROD_DATABASE_URL in .env.local.
// Only people who should touch production will have this variable set.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.PROD_DATABASE_URL! },
  verbose: true,
  casing: "snake_case",
});
