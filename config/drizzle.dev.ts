import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Development (shared/remote) database. Set DEV_DATABASE_URL in .env.local.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DEV_DATABASE_URL! },
  verbose: true,
  casing: "snake_case",
});
