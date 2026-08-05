/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** True for a duplicate-key error, raw or wrapped by the database driver. */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  ((error as { code?: string }).code === UNIQUE_VIOLATION ||
    isUniqueViolation((error as { cause?: unknown }).cause));
