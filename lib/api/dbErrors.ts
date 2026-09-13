/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** Postgres foreign-key-violation SQLSTATE. */
const FOREIGN_KEY_VIOLATION = "23503";

/** True when the error, or any error it wraps, carries the SQLSTATE. */
const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  ((error as { code?: string }).code === code ||
    hasCode((error as { cause?: unknown }).cause, code));

/** True for a duplicate-key error, raw or wrapped by the database driver. */
export const isUniqueViolation = (error: unknown): boolean => hasCode(error, UNIQUE_VIOLATION);

/**
 * True for a foreign-key error, raw or wrapped by the database driver: a row
 * still referenced elsewhere, or a reference to a row deleted meanwhile.
 */
export const isForeignKeyViolation = (error: unknown): boolean =>
  hasCode(error, FOREIGN_KEY_VIOLATION);
