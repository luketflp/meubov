/**
 * MeuBov Drizzle migration CLI.
 *
 * Wraps `drizzle-kit` with environment routing (Local / Development /
 * Homologation / Production) so the same commands work locally and in CI/CD.
 *
 * Each environment maps to a drizzle-kit config file and a connection-string
 * env var. An environment is only usable when its env var is set — this is the
 * guard that keeps production out of reach for people who shouldn't touch it.
 *
 * Run interactively with `pnpm migration:cli`, or use the subcommands
 * (create / migrate / status / deploy / studio) for scripts and pipelines.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import * as dotenv from "dotenv";
import { Command } from "commander";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Config as DrizzleKitConfig } from "drizzle-kit";
import inquirer from "inquirer";

import { toKebabCase } from "./_helpers/kebabCase";
import { printTable } from "./_helpers/table";

dotenv.config({ path: ".env.local" });

// Drizzle-kit config file per environment. Local reuses the root config so the
// plain `db:*` scripts and this CLI stay in sync.
const CONFIG_PATHS = {
  Production: "config/drizzle.prod.ts",
  Homologation: "config/drizzle.homolog.ts",
  Development: "config/drizzle.dev.ts",
  Local: "drizzle.config.ts",
} as const;

// Connection-string env var per environment.
const ENV_VARIABLES = {
  Production: "PROD_DATABASE_URL",
  Homologation: "HOMOLOG_DATABASE_URL",
  Development: "DEV_DATABASE_URL",
  Local: "DATABASE_URL",
} as const;

// Short aliases accepted on the command line (e.g. `deploy prod`).
const CLI_ENV_ALIASES: Record<string, Environment> = {
  prod: "Production",
  homolog: "Homologation",
  dev: "Development",
  local: "Local",
};

type Environment = keyof typeof CONFIG_PATHS;

type MigrationAction =
  | "create"
  | "migrate"
  | "check"
  | "view-db"
  | "deploy"
  | "status";

interface DatabaseMigrationRow {
  id: string;
  hash: string;
  created_at: string | null;
}

// Helpers --------------------------------------------------------------------

/** Run a child process, streaming its output, resolving on exit code 0. */
const runCmd = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    console.log(`🚀 Running: ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command failed with exit code ${code}: ${cmd} ${args.join(" ")}`,
          ),
        );
      }
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to start command: ${err.message}`));
    });
  });

/** Absolute paths of every `.sql` migration file in a directory. */
const listMigrations = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    console.error(`❌ Directory not found: ${dir}`);
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => path.join(dir, file));
};

/** SHA-256 of a migration file — matches how drizzle records applied hashes. */
const hashMigrationFile = (filePath: string): string =>
  createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const validateConfig = (configPath: string): boolean => {
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    return false;
  }
  return true;
};

const validateEnvVariables = (env: Environment): boolean => {
  const envVar = ENV_VARIABLES[env];
  if (!envVar) {
    console.error(`❌ Invalid environment: ${env}`);
    console.log("Available environments:", Object.keys(ENV_VARIABLES).join(", "));
    return false;
  }

  if (!process.env[envVar]) {
    console.error(`❌ Environment variable not set: ${envVar}`);
    if (env !== "Local") {
      console.log(
        `❌❌ If you don't have the ${envVar} variable, it probably means you should not be running commands for the ${env} environment. ❌❌`,
      );
    }
    return false;
  }

  return true;
};

/** Read the applied migrations recorded in the target database. */
const listAppliedMigrations = async (
  env: Environment,
): Promise<DatabaseMigrationRow[]> => {
  if (!validateEnvVariables(env)) return [];
  const dbUrl = process.env[ENV_VARIABLES[env]];

  const configPath = CONFIG_PATHS[env];
  if (!validateConfig(configPath)) return [];

  const configFileUrl = pathToFileURL(path.resolve(configPath));
  const configData: DrizzleKitConfig = (await import(configFileUrl.href)).default;

  const migrationsTable = configData.migrations?.table || "__drizzle_migrations";
  const migrationsSchema = configData.migrations?.schema || "drizzle";

  const db = drizzle(dbUrl!);

  try {
    const applied = (await db.execute(sql`
      SELECT "id", "hash", "created_at"
      FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
      ORDER BY created_at ASC
    `)) as unknown as { rows: DatabaseMigrationRow[] };

    return applied.rows.map((row): DatabaseMigrationRow => {
      const timestamp = row.created_at ? parseInt(row.created_at, 10) : null;
      return {
        id: row.id,
        hash: row.hash,
        created_at: timestamp ? new Date(timestamp).toISOString() : "Unknown date",
      };
    });
  } catch (error) {
    console.error(`❌ Failed to fetch migrations from ${env}:`, error);
    return [];
  }
};

/** Resolve the local drizzle-kit binary, failing fast if deps aren't installed. */
const getDrizzleBin = (): string => {
  const binPath = path.resolve("node_modules/.bin/drizzle-kit");
  if (!fs.existsSync(binPath)) {
    console.error("❌ drizzle-kit not found. Please run: pnpm install");
    process.exit(1);
  }
  return binPath;
};

const DRIZZLE_BIN = getDrizzleBin();

// Action handlers ------------------------------------------------------------

const runCreate = async (name: string): Promise<void> => {
  try {
    const kebabName = toKebabCase(name.trim());
    await runCmd(DRIZZLE_BIN, [
      "generate",
      "--name",
      kebabName,
      "--config",
      CONFIG_PATHS.Local,
    ]);
    console.log("✅ Migration file created successfully");
  } catch (error) {
    console.error("❌ Failed to create migration:", error);
    process.exit(1);
  }
};

const promptCreate = async (): Promise<void> => {
  const { name } = await inquirer.prompt<{ name: string }>([
    {
      type: "input",
      name: "name",
      message: "Migration name:",
      validate: (v: string) => (!!v && v.trim().length > 0) || "Name is required",
    },
  ]);
  await runCreate(name);
};

const runMigrate = async (): Promise<void> => {
  const environment: Environment = "Local";
  const configPath = CONFIG_PATHS[environment];
  if (!validateEnvVariables(environment)) return;
  if (!validateConfig(configPath)) return;

  try {
    await runCmd(DRIZZLE_BIN, ["migrate", "--config", configPath]);
    console.log(`✅ Migrations applied to ${environment} environment`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

const runCheck = async (): Promise<void> => {
  try {
    await runCmd(DRIZZLE_BIN, ["check", "--config", CONFIG_PATHS.Local]);
    console.log("✅ Migration check completed");
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  }
};

const runViewDb = async (environment: Environment): Promise<void> => {
  if (!validateEnvVariables(environment)) return;
  const configPath = CONFIG_PATHS[environment];
  if (!validateConfig(configPath)) return;

  try {
    await runCmd(DRIZZLE_BIN, ["studio", "--config", configPath]);
    console.log(`✅ Database studio opened for ${environment} environment`);
  } catch (error) {
    console.error("❌ Failed to open database studio:", error);
    process.exit(1);
  }
};

const promptViewDb = async (): Promise<void> => {
  const { environment } = await inquirer.prompt<{ environment: Environment }>([
    {
      type: "list",
      name: "environment",
      message: "Which environment database to view?",
      choices: Object.keys(CONFIG_PATHS),
    },
  ]);
  await runViewDb(environment);
};

const runDeploy = async (
  environment: Environment,
  options?: { yes?: boolean },
): Promise<void> => {
  if (!validateEnvVariables(environment)) return;

  let confirmed = !!options?.yes;
  if (!confirmed) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to deploy to ${environment}?`,
        default: false,
      },
    ]);
    confirmed = confirm;
  }

  if (!confirmed) {
    console.log("Deployment cancelled");
    return;
  }

  const configPath = CONFIG_PATHS[environment];
  if (!validateConfig(configPath)) return;

  try {
    await runCmd(DRIZZLE_BIN, ["migrate", "--config", configPath]);
    console.log(`✅ Successfully deployed to ${environment}`);
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
};

const promptDeploy = async (): Promise<void> => {
  console.log(
    "⚠️  Warning: This will apply all pending migrations to the selected environment.",
  );
  const { environment } = await inquirer.prompt<{ environment: Environment }>([
    {
      type: "list",
      name: "environment",
      message: "Which environment to deploy to?",
      choices: Object.keys(CONFIG_PATHS).filter((env) => env !== "Local"),
    },
  ]);
  await runDeploy(environment);
};

const runStatus = async (environment: Environment): Promise<void> => {
  if (!validateEnvVariables(environment)) return;

  try {
    const appliedMigrations = await listAppliedMigrations(environment);
    const fileHashes = listMigrations("./drizzle").map((file) => ({
      name: path.basename(file).replace(/\.sql$/, ""),
      hash: hashMigrationFile(file),
    }));

    type StatusRow = {
      Migration: string;
      Status: string;
      "Applied At": string;
    };

    const rows: StatusRow[] = fileHashes.map(({ name, hash }): StatusRow => {
      const applied = appliedMigrations.find((mig) => mig.hash === hash);
      return {
        Migration: name,
        Status: applied ? "✅ Applied" : "⏳ Pending",
        "Applied At":
          applied?.created_at?.replace(/T/, " ").replace(/Z$/, "") || "N/A",
      };
    });

    rows.sort((a, b) => a.Migration.localeCompare(b.Migration));

    console.log(`\n📋 Migration Status (${environment}):`);
    console.log("─".repeat(80));
    printTable(rows);

    const applied = rows.filter((s) => s.Status.includes("Applied")).length;
    const pending = rows.filter((s) => s.Status.includes("Pending")).length;
    console.log("📊 Summary:");
    console.log(`   Applied: ${applied}`);
    console.log(`   Pending: ${pending}`);
  } catch (error) {
    console.error("❌ Status check failed:", error);
    process.exit(1);
  }
};

const promptStatus = async (): Promise<void> => {
  const { environment } = await inquirer.prompt<{ environment: Environment }>([
    {
      type: "list",
      name: "environment",
      message: "Which environment to check?",
      choices: Object.keys(CONFIG_PATHS),
    },
  ]);
  await runStatus(environment);
};

/** Map a CLI alias (`prod`, `dev`, ...) to an Environment, or exit. */
const resolveEnv = (alias: string): Environment => {
  const env = CLI_ENV_ALIASES[alias.toLowerCase()];
  if (!env) {
    console.error(`❌ Invalid environment: ${alias}`);
    console.log("Available environments:", Object.keys(CLI_ENV_ALIASES).join(", "));
    process.exit(1);
  }
  return env;
};

// CLI ------------------------------------------------------------------------
const program = new Command();

program
  .name("migrations_cli")
  .description("MeuBov CLI for Drizzle migrations")
  .version("0.1.0")
  .action(async () => {
    console.log("🛠️  MeuBov Drizzle Migration CLI");
    console.log("────────────────────────────────");

    const { action } = await inquirer.prompt<{ action: MigrationAction }>([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "📝 Create new migration", value: "create" },
          { name: "🚀 Run migrations (Local)", value: "migrate" },
          { name: "🔍 Check migrations integrity", value: "check" },
          { name: "📊 View database (Studio)", value: "view-db" },
          { name: "🚢 Deploy to environment", value: "deploy" },
          { name: "📋 Migration status", value: "status" },
        ],
      },
    ]);

    try {
      switch (action) {
        case "create":
          await promptCreate();
          break;
        case "migrate":
          await runMigrate();
          break;
        case "check":
          await runCheck();
          break;
        case "view-db":
          await promptViewDb();
          break;
        case "deploy":
          await promptDeploy();
          break;
        case "status":
          await promptStatus();
          break;
        default:
          console.error("❌ Unknown action");
          process.exit(1);
      }
      process.exit(0);
    } catch (error) {
      console.error("❌ Unexpected error:", error);
      process.exit(1);
    }
  });

// Subcommands for CI/CD and scripting.
program
  .command("create <name>")
  .description("Create a new migration with the given name")
  .action(async (name: string) => {
    if (!name || name.trim().length === 0) {
      console.error("❌ Migration name is required");
      process.exit(1);
    }
    await runCreate(name);
    process.exit(0);
  });

program
  .command("migrate")
  .description("Run pending migrations for the local environment")
  .action(async () => {
    await runMigrate();
    process.exit(0);
  });

program
  .command("check")
  .description("Verify the integrity of the migration files")
  .action(async () => {
    await runCheck();
    process.exit(0);
  });

program
  .command("studio [environment]")
  .description("Open Drizzle Studio for the specified environment")
  .action(async (environment = "local") => {
    await runViewDb(resolveEnv(environment));
    process.exit(0);
  });

program
  .command("deploy [environment]")
  .description("Deploy migrations to the specified environment")
  .option("-y, --yes", "Skip confirmation prompts (assume yes)")
  .action(async (environment = "local", opts: { yes?: boolean }) => {
    await runDeploy(resolveEnv(environment), { yes: !!opts?.yes });
    process.exit(0);
  });

program
  .command("status [environment]")
  .description("Check the status of migrations for the specified environment")
  .action(async (environment = "local") => {
    await runStatus(resolveEnv(environment));
    process.exit(0);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
