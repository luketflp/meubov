/**
 * The farm as the phone last saw it: the user's own GET /api/herd payload
 * (money already redacted by the server), the farm list and the active farm,
 * keyed by `userId:farmId` so users never share one. The app boots from it
 * when the API is unreachable.
 */
import type { KeyValueStore } from "@/lib/offline/db";
import type { FarmOption } from "@/lib/store/useHerdStore";
import type { HerdData } from "@/lib/types";

export interface Snapshot {
  data: HerdData;
  farms: FarmOption[];
  activeFarmId: number;
  /** ISO datetime of the data: "Sem conexão · dados de dd/mm às HH:MM". */
  savedAt: string;
}

/** Meta key of the last signed-in user id: an offline boot has no session to ask. */
export const LAST_USER_KEY = "lastUser";

export const snapshotKey = (userId: string, farmId: number) => `${userId}:${farmId}`;

export async function saveSnapshot(
  store: KeyValueStore<Snapshot>,
  key: string,
  snap: Snapshot
): Promise<void> {
  await store.put(key, snap);
}

export async function loadSnapshot(
  store: KeyValueStore<Snapshot>,
  key: string
): Promise<Snapshot | undefined> {
  return store.get(key);
}

/** Deletes every snapshot of one user (sign-out); other users' stay. */
export async function clearUserSnapshots(
  store: KeyValueStore<Snapshot>,
  userId: string
): Promise<void> {
  // The store lists values, not keys: the user's keys are userId:<farm> for
  // any farm some snapshot names, and deleting a missing key is a no-op.
  const farmIds = new Set((await store.list()).map((snap) => snap.activeFarmId));
  for (const farmId of farmIds) await store.delete(snapshotKey(userId, farmId));
}

/** Statuses that mean the API was not reached: no answer, or a gateway/proxy one. */
const NETWORK_STATUSES = new Set([0, 502, 503, 504]);

/**
 * True when a failed load means "no network", the only case the app boots
 * from the snapshot. A rejected fetch (TypeError), a status 0/502/503/504 (an
 * Eden error's `status`, or the repository's "(status N)" message), or the
 * browser reporting offline. Every other answer (401, 403, 409, 500…) is the
 * server speaking and keeps its own screen.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  if (typeof error === "object" && error !== null && "status" in error) {
    return NETWORK_STATUSES.has(Number(error.status));
  }
  // ponytail: ApiHerdRepository only puts the status in its message; parse it
  // until the repository throws a typed error.
  const match = error instanceof Error ? /\(status (\d+)\)/.exec(error.message) : null;
  return match !== null && NETWORK_STATUSES.has(Number(match[1]));
}
