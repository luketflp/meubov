/**
 * The fila: operations waiting for the server, ordered by `seq`.
 *
 * `seq` is the last value kept under meta key "seq", so it keeps growing after
 * the app restarts. An operation of a session never goes before an earlier one
 * of the same session: `nextSendable` takes the lowest queued seq, and holds
 * back what depends on an earlier conflito or falha (the same animal, or
 * everything after a start that did not go through).
 */
import type { KeyValueStore } from "@/lib/offline/db";
import type { OutboxOp } from "@/lib/offline/types";

export interface OutboxCounts {
  /** Waiting to be sent, including the one being sent. */
  queued: number;
  conflict: number;
  failed: number;
}

export interface Outbox {
  enqueue(
    op: Omit<OutboxOp, "seq" | "state" | "attempts" | "createdAt"> & { createdAt?: string }
  ): Promise<OutboxOp>;
  /** Seq ascending; only `userId`'s (merge-notes ruling 7) and `farmId`'s ops when given. */
  list(userId?: string, farmId?: number): Promise<OutboxOp[]>;
  get(id: string): Promise<OutboxOp | undefined>;
  /** Undefined when the op is gone (an undo took it out). */
  update(id: string, patch: Partial<OutboxOp>): Promise<OutboxOp | undefined>;
  remove(id: string): Promise<void>;
  /** Removes the op only while it is still queued, in line with `update`: true when it went. */
  removeIfQueued(id: string): Promise<boolean>;
  removeSession(sessionId: string): Promise<void>;
  /** Any op of that session, in any state. */
  hasPending(sessionId: string): Promise<boolean>;
  /** The lowest-seq queued op (of `userId` and `farmId` when given) that no earlier conflito or falha holds back. */
  nextSendable(userId?: string, farmId?: number): Promise<OutboxOp | undefined>;
  /** Only `userId`'s and `farmId`'s ops when given. */
  counts(userId?: string, farmId?: number): Promise<OutboxCounts>;
}

const SEQ_KEY = "seq";

/**
 * True when `earlier` holds `op` back: same session, stuck, and a start, the
 * same animal, or `op` has no animal (a close or carcass-yield waits for the
 * whole session).
 */
function blocks(earlier: OutboxOp, op: OutboxOp): boolean {
  return (
    earlier.sessionId === op.sessionId &&
    earlier.seq < op.seq &&
    (earlier.state === "conflict" || earlier.state === "failed") &&
    (earlier.kind === "start" ||
      op.earTag === undefined ||
      (earlier.earTag !== undefined && earlier.earTag === op.earTag))
  );
}

/**
 * Later ops of op's session on the same animal plus the later ops without an
 * animal (close, carcass-yield), or every later op of the session after a start.
 */
export function dependentOps(ops: OutboxOp[], op: OutboxOp): OutboxOp[] {
  return ops.filter(
    (other) =>
      other.sessionId === op.sessionId &&
      other.seq > op.seq &&
      (op.kind === "start" ||
        other.earTag === undefined ||
        (op.earTag !== undefined && other.earTag === op.earTag))
  );
}

export function createOutbox(store: KeyValueStore<OutboxOp>, meta: KeyValueStore<number>): Outbox {
  // Enqueues, updates and undo removals run one after another: two taps never
  // read the same seq, and an undo never removes an op the engine is sending.
  // ponytail: per-tab chain; two tabs at once could race — one brete tab is the use.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn);
    chain = next.catch(() => {});
    return next;
  }

  const list = async (userId?: string, farmId?: number) =>
    (await store.list())
      .filter((op) => userId === undefined || op.userId === userId)
      .filter((op) => farmId === undefined || op.farmId === farmId)
      .sort((a, b) => a.seq - b.seq);

  return {
    enqueue(input) {
      return serial(async () => {
        const seq = ((await meta.get(SEQ_KEY)) ?? 0) + 1;
        await meta.put(SEQ_KEY, seq);
        const op: OutboxOp = {
          ...input,
          createdAt: input.createdAt ?? new Date().toISOString(),
          seq,
          state: "queued",
          attempts: 0,
        };
        await store.put(op.id, op);
        return op;
      });
    },

    list,

    get: (id) => store.get(id),

    update(id, patch) {
      return serial(async () => {
        const op = await store.get(id);
        if (!op) return undefined;
        const updated = { ...op, ...patch };
        await store.put(id, updated);
        return updated;
      });
    },

    remove: (id) => store.delete(id),

    removeIfQueued(id) {
      return serial(async () => {
        if ((await store.get(id))?.state !== "queued") return false;
        await store.delete(id);
        return true;
      });
    },

    async removeSession(sessionId) {
      for (const op of await store.list()) {
        if (op.sessionId === sessionId) await store.delete(op.id);
      }
    },

    async hasPending(sessionId) {
      return (await store.list()).some((op) => op.sessionId === sessionId);
    },

    async nextSendable(userId, farmId) {
      const ops = await list(userId, farmId);
      return ops.find((op) => op.state === "queued" && !ops.some((earlier) => blocks(earlier, op)));
    },

    async counts(userId, farmId) {
      const counts: OutboxCounts = { queued: 0, conflict: 0, failed: 0 };
      for (const op of await list(userId, farmId)) {
        if (op.state === "queued" || op.state === "sending") counts.queued++;
        else counts[op.state]++;
      }
      return counts;
    },
  };
}
