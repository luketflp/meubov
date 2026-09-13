/**
 * Convites: an e-mail waiting to be claimed by whoever signs in with it.
 * Nothing is sent; the owner tells the person. Pure helpers for the server's
 * use cases and the lists on both sides.
 */

export const INVITE_TTL_DAYS = 7;

const DAY_MS = 86_400_000;

export type InviteStatus = "pending" | "accepted" | "declined" | "canceled";

/** What the owner's list shows; expired is derived, never stored. */
export type ListedInviteState = "pending" | "expired" | "declined";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
}

export function inviteState(
  invite: { status: InviteStatus; expiresAt: Date | string },
  now: Date
): ListedInviteState | null {
  if (invite.status === "declined") return "declined";
  if (invite.status !== "pending") return null;
  return new Date(invite.expiresAt).getTime() <= now.getTime() ? "expired" : "pending";
}

/** Whole days left, rounded up, at least one while the convite is still valid. */
export function daysLeft(expiresAt: Date | string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS));
}

export function expiresInLabel(expiresAt: Date | string, now: Date): string {
  const days = daysLeft(expiresAt, now);
  return days === 1 ? "expira em 1 dia" : `expira em ${days} dias`;
}

/** The same, opening a sentence. */
export function expiresInSentence(expiresAt: Date | string, now: Date): string {
  const label = expiresInLabel(expiresAt, now);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const INSTANT_DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/** DD/MM/AAAA of a stored timestamp, on the Brazilian calendar. */
export function formatInstantDate(value: Date | string): string {
  return INSTANT_DATE.format(new Date(value));
}

export function inviteDateLine(
  invite: { state: ListedInviteState; expiresAt: string; respondedAt: string | null },
  now: Date
): string {
  if (invite.state === "pending") return expiresInLabel(invite.expiresAt, now);
  if (invite.state === "expired") return `expirou em ${formatInstantDate(invite.expiresAt)}`;
  return `recusou em ${formatInstantDate(invite.respondedAt ?? invite.expiresAt)}`;
}
