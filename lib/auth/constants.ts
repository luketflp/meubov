/**
 * Shared authentication constants.
 *
 * Keeps auth rules (currently the minimum password length) in a single place so
 * the signup form, its input constraint, and the pt-BR error message never drift
 * apart. Must stay in sync with Better Auth's server-side `minPasswordLength`
 * (defaults to 8, see lib/auth/index.ts).
 */

/** Minimum number of characters required for a password. */
export const MIN_PASSWORD_LENGTH = 8;

/** pt-BR message shown when a password is shorter than {@link MIN_PASSWORD_LENGTH}. */
export const PASSWORD_TOO_SHORT_MESSAGE = `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
