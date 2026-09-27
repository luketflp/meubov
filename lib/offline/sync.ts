/**
 * The sync engine: sends the fila to the server one operation at a time, in
 * the order the brete did them, and sorts every answer into applied, conflito
 * (the vaqueiro decides), falha (only Descartar) or "try again later". The
 * transport, the clock, the online flag and the timers are injected, so the
 * whole state machine runs in tests without a network.
 */
import { dependentOps, type Outbox, type OutboxCounts } from "@/lib/offline/outbox";
import type { OutboxDetail, OutboxOp } from "@/lib/offline/types";
import type { ManejoSessionAnimal } from "@/lib/types";

export type SendResult =
  | { ok: true; result: unknown }
  | {
      ok: false;
      status: number;
      error?: string;
      message?: string;
      server?: ManejoSessionAnimal;
      sessionClosed?: boolean;
    };

/** Sends one operation; throws when the request never reached the server. */
export interface Transport {
  send(op: OutboxOp, opts: { force: boolean }): Promise<SendResult>;
}

export interface SyncStatus {
  online: boolean;
  phase: "offline" | "idle" | "sending" | "paused_auth";
  sending?: { done: number; total: number };
  lastSyncedAt?: string;
  offlineSince?: string;
  counts: OutboxCounts;
}

export type SyncKick = "online" | "visible" | "enqueue" | "manual" | "interval";

export interface SyncEngine {
  start(): void;
  stop(): void;
  kick(reason: SyncKick): Promise<void>;
  resolve(opId: string, choice: "server" | "mine"): Promise<void>;
  resolveAll(choice: "server" | "mine"): Promise<void>;
  discard(opId: string): Promise<void>;
  status(): SyncStatus;
  subscribe(fn: (s: SyncStatus) => void): () => void;
}

/** The four timer functions the engine uses; the browser's by default. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface SyncDeps {
  outbox: Outbox;
  transport: Transport;
  /**
   * The signed-in user: only their ops are sent, counted and resolved; another
   * user's stay in the fila, hidden, until they sign in again.
   */
  userId(): string | undefined;
  /** The active farm: only its ops are sent and counted; another farm's wait for it. */
  farmId(): number | undefined;
  isOnline(): boolean;
  now(): string;
  timers?: Timers;
  onApplied(op: OutboxOp, result: unknown): void;
  onDropped(op: OutboxOp): void;
  /** One reload of the herd after the vaqueiro's choices. */
  onBatchResolved(): Promise<void>;
  onAuthRequired(): void;
}

/** 409 answers that mean someone else got there first: the vaqueiro decides. */
const CONFLICT_ERRORS = new Set([
  "entry_not_actionable",
  "held_pending",
  "out_of_stock",
  "animal_inactive",
  "has_diagnosis",
  "session_closed",
  "session_not_open",
  "not_female",
  "bull_not_found",
  "id_taken",
]);

/** Refusals that mean the server's session is closed: "Aplicar o meu" cannot help. */
const CLOSED_ERRORS = new Set(["session_closed", "session_not_open"]);

/** Waits before the 1st, 2nd and 3rd retry of a network failure; the last one repeats. */
const RETRY_MS = [1_000, 5_000, 30_000];

/** How often a non-empty fila is tried while online. */
const INTERVAL_MS = 30_000;

type Refusal = Extract<SendResult, { ok: false }>;

/** The server is down or busy, not refusing: try again later, order kept. */
const retryable = (r: Refusal): boolean => r.status >= 500 || r.status === 429;

const detailOf = (r: Refusal): OutboxDetail => ({
  error: r.error ?? `http_${r.status}`,
  message: r.message,
  server: r.server,
  sessionClosed: r.sessionClosed || CLOSED_ERRORS.has(r.error ?? "") || undefined,
});

/** The later ops held back only because an earlier op of the same animal was refused. */
const held = (op: OutboxOp): boolean => op.detail?.error === "dependent";

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  const { outbox, transport } = deps;
  const timers: Timers = deps.timers ?? globalThis;
  const listeners = new Set<(s: SyncStatus) => void>();
  // With no known user nothing matches: ops always carry a real user id.
  const who = () => deps.userId() ?? "";
  // With no active farm nothing matches either (farm ids are positive).
  const farm = () => deps.farmId() ?? -1;
  let online = true;
  let offlineSince: string | undefined;
  let lastSyncedAt: string | undefined;
  let counts: OutboxCounts = { queued: 0, conflict: 0, failed: 0 };
  let sending: SyncStatus["sending"];
  let pausedAuth = false;
  let stopped = false;
  let draining: Promise<void> | null = null;
  let again = false;
  let retry: unknown;
  let interval: unknown;
  // Drains and the vaqueiro's choices touch the outbox one at a time.
  let lock: Promise<unknown> = Promise.resolve();

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = lock.then(fn);
    lock = run.catch(() => undefined);
    return run;
  }

  /** Reads the online flag; the first offline reading starts "Sem conexão desde". */
  function sense(): void {
    online = deps.isOnline();
    if (!online) offlineSince ??= deps.now();
    else offlineSince = undefined;
  }

  function snapshot(): SyncStatus {
    return {
      online,
      phase: !online ? "offline" : pausedAuth ? "paused_auth" : sending ? "sending" : "idle",
      sending,
      lastSyncedAt,
      offlineSince,
      counts,
    };
  }

  /** Re-reads the counts, starts or stops the 30 s interval and tells every subscriber. */
  async function refresh(): Promise<void> {
    sense();
    counts = await outbox.counts(who(), farm());
    const wanted = !stopped && online && counts.queued > 0;
    if (wanted && interval === undefined) {
      interval = timers.setInterval(() => void kick("interval"), INTERVAL_MS);
    }
    if (!wanted && interval !== undefined) {
      timers.clearInterval(interval);
      interval = undefined;
    }
    const status = snapshot();
    for (const fn of listeners) fn(status);
  }

  /** Marks an op conflito or falha, and the later ops of the same animal with it. */
  async function settle(
    op: OutboxOp,
    state: "conflict" | "failed",
    detail: OutboxDetail
  ): Promise<void> {
    await outbox.update(op.id, { state, detail });
    for (const dep of dependentOps(await outbox.list(), op)) {
      if (dep.state === "queued" || held(dep)) {
        await outbox.update(dep.id, { state, detail: { error: "dependent" } });
      }
    }
  }

  /**
   * Drops an op and the later ops of the same animal (every later op after a
   * start); the store takes their records out. A close or carcass-yield held
   * only behind it goes back in line, where `blocks()` keeps it while another
   * conflito or falha of the session remains.
   */
  async function drop(op: OutboxOp): Promise<void> {
    const later = dependentOps(await outbox.list(), op);
    deps.onDropped(op);
    await outbox.remove(op.id);
    for (const dep of later) {
      if (op.kind !== "start" && dep.earTag === undefined) {
        if (held(dep)) await outbox.update(dep.id, { state: "queued", detail: undefined });
        continue;
      }
      deps.onDropped(dep);
      await outbox.remove(dep.id);
    }
  }

  /** Takes a sent op out of the fila, then merges the answer; a failed merge is only logged. */
  async function applied(op: OutboxOp, result: unknown): Promise<void> {
    await outbox.remove(op.id);
    try {
      deps.onApplied(op, result);
    } catch (error) {
      console.error("sync apply failed", error);
    }
  }

  /** Puts a network-failed op back in line and schedules the next try. */
  async function backOff(op: OutboxOp): Promise<false> {
    const attempts = op.attempts + 1;
    await outbox.update(op.id, { state: "queued", attempts });
    if (retry !== undefined) timers.clearTimeout(retry);
    retry = stopped
      ? undefined
      : timers.setTimeout(() => {
          retry = undefined;
          void kick("interval");
        }, RETRY_MS[Math.min(attempts, RETRY_MS.length) - 1]);
    return false;
  }

  /** Sends one op of the drain; false when the drain must stop (network, sign-in). */
  async function sendOne(op: OutboxOp): Promise<boolean> {
    // Gone already: an undo took it out of the fila before it left.
    if (!(await outbox.update(op.id, { state: "sending" }))) return true;
    let result: SendResult;
    try {
      result = await transport.send(op, { force: false });
    } catch {
      return backOff(op);
    }
    if (result.ok) {
      await applied(op, result.result);
      return true;
    }
    if (retryable(result)) return backOff(op);
    if (result.status === 401) {
      await outbox.update(op.id, { state: "queued" });
      pausedAuth = true;
      deps.onAuthRequired();
      return false;
    }
    const isConflict = result.status === 409 && CONFLICT_ERRORS.has(result.error ?? "");
    await settle(op, isConflict ? "conflict" : "failed", detailOf(result));
    return true;
  }

  async function drain(): Promise<void> {
    let done = 0;
    do {
      again = false;
      for (let op = await outbox.nextSendable(who(), farm()); op; op = await outbox.nextSendable(who(), farm())) {
        sense();
        if (!online || pausedAuth) return;
        counts = await outbox.counts(who(), farm());
        sending = { done, total: done + counts.queued };
        await refresh();
        if (!(await sendOne(op))) return;
        done += 1;
      }
    } while (again);
    if ((await outbox.counts(who(), farm())).queued === 0) lastSyncedAt = deps.now();
  }

  function kick(reason: SyncKick): Promise<void> {
    if (reason === "manual") pausedAuth = false;
    if (draining) {
      again = true;
      return draining;
    }
    const run = exclusive(async () => {
      try {
        sense();
        if (online && !pausedAuth) await drain();
      } finally {
        sending = undefined;
        await refresh();
      }
    });
    draining = run
      .catch((error: unknown) => console.error("sync failed", error))
      .finally(() => {
        draining = null;
        // A kick that arrived after the drain's last look goes now (never as
        // "manual": only the vaqueiro lifts a sign-in pause).
        if (again) {
          again = false;
          void kick("enqueue");
        }
      });
    return draining;
  }

  async function resolveOne(opId: string, choice: "server" | "mine"): Promise<void> {
    const op = await outbox.get(opId);
    if (op?.state !== "conflict") return;
    if (choice === "server") return drop(op);
    // Held back behind another conflito, it never reached the server: back in line.
    if (held(op)) {
      await outbox.update(op.id, { state: "queued", detail: undefined });
      return;
    }
    let result: SendResult;
    try {
      result = await transport.send(op, { force: true });
    } catch {
      return; // still a conflito; the choice can be made again with signal
    }
    if (result.ok) {
      await applied(op, result.result);
      for (const dep of dependentOps(await outbox.list(), op)) {
        if (held(dep)) await outbox.update(dep.id, { state: "queued", detail: undefined });
      }
      return;
    }
    if (result.status === 401) {
      pausedAuth = true;
      deps.onAuthRequired();
      return;
    }
    if (retryable(result)) return;
    await settle(op, "failed", detailOf(result));
  }

  /** After the vaqueiro's choice: one reload, then whatever is back in line goes. */
  async function afterBatch(): Promise<void> {
    await deps.onBatchResolved();
    await kick("enqueue");
  }

  return {
    start() {
      stopped = false;
      // An op left "sending" by a tab closed mid-request goes back in line.
      void exclusive(async () => {
        for (const op of await outbox.list()) {
          if (op.state === "sending") await outbox.update(op.id, { state: "queued" });
        }
      }).then(() => kick("online"));
    },
    stop() {
      stopped = true;
      if (retry !== undefined) timers.clearTimeout(retry);
      if (interval !== undefined) timers.clearInterval(interval);
      retry = undefined;
      interval = undefined;
    },
    kick,
    async resolve(opId, choice) {
      await exclusive(() => resolveOne(opId, choice));
      await afterBatch();
    },
    async resolveAll(choice) {
      await exclusive(async () => {
        for (const op of await outbox.list(who(), farm())) {
          if (op.state === "conflict") await resolveOne(op.id, choice);
        }
      });
      await afterBatch();
    },
    async discard(opId) {
      await exclusive(async () => {
        const op = await outbox.get(opId);
        if (op && op.state !== "sending") await drop(op);
      });
      await afterBatch();
    },
    status() {
      sense();
      return snapshot();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
