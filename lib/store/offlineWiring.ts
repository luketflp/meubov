/**
 * The phone's fila and sync engine — one of each per tab,
 * built on first use in the browser (never during SSR) — and the window
 * events that kick the engine. The store hands in what happens to its state.
 */
import { api } from "@/lib/api/client";
import { createApiTransport } from "@/lib/offline/apiTransport";
import { openStore } from "@/lib/offline/db";
import { createOutbox, type Outbox } from "@/lib/offline/outbox";
import {
  createSyncEngine,
  type SyncDeps,
  type SyncEngine,
  type SyncStatus,
} from "@/lib/offline/sync";
import type { OutboxOp } from "@/lib/offline/types";

let outbox: Outbox | undefined;
let engine: SyncEngine | undefined;
/** The signed-in user: only their ops are sent, counted and listed (merge-notes ruling 7). */
let user: string | undefined;

/**
 * Who the fila works for: the store sets it after an online load (the session
 * read) or an offline boot (the snapshot's user, held until the session is
 * confirmed), and clears it on sign-out. A new
 * user kicks a sync by hand, which also lifts a 401 pause.
 */
export function setSyncUser(userId: string | undefined): void {
  user = userId;
  void engine?.kick("manual");
}

export function getSyncUser(): string | undefined {
  return user;
}

export function getOutbox(): Outbox {
  return (outbox ??= createOutbox(openStore("outbox"), openStore("meta")));
}

/** The engine once `wireOffline` ran; undefined during SSR and before the first load. */
export function getEngine(): SyncEngine | undefined {
  return engine;
}

export interface OfflineHooks
  extends Pick<SyncDeps, "onApplied" | "onDropped" | "onBatchResolved" | "onAuthRequired"> {
  animalIdByEarTag(earTag: string): string | undefined;
  /**
   * True while the fila's user is only the snapshot's (an offline boot): the
   * engine treats the phone as offline, so nothing is sent under another session.
   */
  holdSync(): boolean;
  /** The active farm: only its ops are sent, counted and listed. */
  farmId(): number | undefined;
  /** Every status change, with the fila as it stands after it. */
  onChange(sync: SyncStatus, ops: OutboxOp[]): void;
}

/**
 * Builds the engine and hooks it to the window, once. Later calls only kick a
 * sync by hand — after signing in again, that is what lifts a 401 pause.
 */
export function wireOffline(hooks: OfflineHooks): void {
  if (typeof window === "undefined") return;
  if (engine) {
    void engine.kick("manual");
    return;
  }
  const fila = getOutbox();
  const e = createSyncEngine({
    outbox: fila,
    transport: createApiTransport(api, hooks.animalIdByEarTag),
    userId: () => user,
    farmId: hooks.farmId,
    isOnline: () => navigator.onLine && !hooks.holdSync(),
    now: () => new Date().toISOString(),
    onApplied: hooks.onApplied,
    onDropped: hooks.onDropped,
    onBatchResolved: hooks.onBatchResolved,
    onAuthRequired: hooks.onAuthRequired,
  });
  engine = e;
  e.subscribe((sync) => {
    void fila
      .list(user ?? "", hooks.farmId() ?? -1)
      .then((ops) => hooks.onChange(sync, ops))
      .catch(() => {});
  });
  // Both flips re-read the flag: "online" drains, "offline" shows "Sem conexão".
  window.addEventListener("online", () => void e.kick("online"));
  window.addEventListener("offline", () => void e.kick("online"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void e.kick("visible");
  });
  e.start();
}
