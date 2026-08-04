/**
 * Runs pending drizzle migrations before the production build on Vercel
 * (the `vercel-build` script). Uses the root drizzle.config.ts, whose
 * DATABASE_URL is the production database in Vercel's build environment.
 *
 * Preview and development deploys SKIP the migration on purpose: they build
 * against the same DATABASE_URL, and a feature branch must never mutate the
 * production schema. Locally VERCEL_ENV is unset, so `pnpm vercel-build`
 * also skips.
 *
 * Failure ordering is safe: if the migration fails, the build fails and the
 * previous deployment keeps serving.
 */
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;

if (env === "production") {
  console.log("VERCEL_ENV=production — applying pending migrations...");
  execSync("pnpm exec drizzle-kit migrate", { stdio: "inherit" });
  console.log("Migrations up to date.");
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${env ?? "not set"}).`);
}
