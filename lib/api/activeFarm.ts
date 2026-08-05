/**
 * Active-farm selection persisted in localStorage (browser only).
 *
 * The Eden client reads it on every request to send the x-farm-id header, so
 * the choice survives reloads and applies to all API calls without threading
 * state through call sites. Absent/invalid values mean "no explicit choice" and
 * the server falls back to the user's default farm.
 */
const STORAGE_KEY = "meubov.activeFarmId";

/** The explicitly selected farm id, or null when unset/invalid/server-side. */
export function getActiveFarmId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

export function setActiveFarmId(id: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(id));
}

export function clearActiveFarmId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
