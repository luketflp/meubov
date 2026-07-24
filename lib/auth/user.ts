/**
 * Small presentation helpers for the authenticated user (avatar initials,
 * display name). Kept framework-agnostic so both the sidebar and the mobile tab
 * bar can share them.
 */

/**
 * Builds up-to-two-letter uppercase initials from a display name.
 * Falls back to "?" when the name is empty or has no usable characters.
 */
export function getInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";

  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

/** Prefers the user's name; falls back to their email; then a generic label. */
export function displayName(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  const trimmedEmail = email?.trim();
  if (trimmedEmail) return trimmedEmail;
  return "Usuário";
}
