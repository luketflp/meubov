import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Homologation (staging) database. Set HOMOLOG_DATABASE_URL in .env.local.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.HOMOLOG_DATABASE_URL! },
  verbose: true,
  casing: "snake_case",
});
