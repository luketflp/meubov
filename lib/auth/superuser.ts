/**
 * Superuser allowlist (server-only).
 *
 * SUPERUSER_EMAILS is a comma-separated list of e-mails allowed to access ALL
 * farms, bypassing the farm_users membership check in lib/api/plugins/farm.ts.
 * Kept out of lib/auth/constants.ts because that module is imported by client
 * components and this one reads a server env var.
 */

/** True when the e-mail is in the SUPERUSER_EMAILS allowlist (case-insensitive). */
export function isSuperuser(email: string): boolean {
  const raw = process.env.SUPERUSER_EMAILS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}
