import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "@/lib/offline/db";
import { createOutbox } from "@/lib/offline/outbox";
import {
  createSyncEngine,
  type SendResult,
  type SyncStatus,
  type Transport,
} from "@/lib/offline/sync";
import type { OutboxKind, OutboxOp } from "@/lib/offline/types";

type Answer = SendResult | "throw";

const conflict = (error: string): SendResult => ({ ok: false, status: 409, error });

/**
 * An engine over the memory outbox and a transport that answers from a script
 * per op id ("throw" is a network failure); ops without a script are accepted.
 */
function setup(script: Record<string, Answer[]> = {}, online = true) {
  const outbox = createOutbox(memoryStore(), memoryStore());
  const sent: { id: string; force: boolean }[] = [];
  const transport: Transport = {
    async send(op, { force }) {
      sent.push({ id: op.id, force });
      const answer = script[op.id]?.shift() ?? { ok: true, result: { id: op.id } };
      if (answer === "throw") throw new TypeError("Failed to fetch");
      return answer;
    },
  };
  let isOnline = online;
  const deps = {
    outbox,
    transport,
    userId: () => "u1",
    farmId: () => 1,
    isOnline: () => isOnline,
    now: () => new Date().toISOString(),
    onApplied: vi.fn(),
    onDropped: vi.fn(),
    onBatchResolved: vi.fn(async () => {}),
    onAuthRequired: vi.fn(),
  };
  const engine = createSyncEngine(deps);
  return {
    outbox,
    engine,
    deps,
    sent: () => sent.map((s) => s.id),
    forces: () => sent.map((s) => s.force),
    setOnline: (value: boolean) => {
      isOnline = value;
    },
    enqueue: (
      id: string,
      earTag: string | undefined,
      kind: OutboxKind = "complete",
      sessionId = "s1"
    ) =>
      outbox.enqueue({ id, userId: "u1", farmId: 1, sessionId, kind, earTag, body: {} }),
    states: async () =>
      Object.fromEntries((await outbox.list()).map((op) => [op.id, op.state])),
    ids: (fn: { mock: { calls: unknown[][] } }) =>
      fn.mock.calls.map((call) => (call[0] as OutboxOp).id),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T14:07:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSyncEngine", () => {
  it("sends the fila in order and applies each answer", async () => {
    const h = setup();
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.enqueue("c", "101", "skip");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "b", "c"]);
    expect(h.ids(h.deps.onApplied)).toEqual(["a", "b", "c"]);
    expect(h.deps.onApplied).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), { id: "a" });
    expect(await h.outbox.list()).toEqual([]);
    expect(h.engine.status()).toMatchObject({
      online: true,
      phase: "idle",
      counts: { queued: 0, conflict: 0, failed: 0 },
      lastSyncedAt: "2026-09-25T14:07:00.000Z",
    });
  });

  it("keeps a later pass behind a network failure and retries after 1 s, then 5 s", async () => {
    const h = setup({ a: ["throw", "throw"] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(await h.outbox.get("a")).toMatchObject({ state: "queued", attempts: 1 });
    await vi.advanceTimersByTimeAsync(999);
    expect(h.sent()).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sent()).toEqual(["a", "a"]);
    expect(await h.outbox.get("a")).toMatchObject({ state: "queued", attempts: 2 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(h.sent()).toEqual(["a", "a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sent()).toEqual(["a", "a", "a", "b"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("turns a 409 into a conflito, holds the same animal's later passes and the close, sends the others", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.enqueue("c", "101", "reopen");
    await h.enqueue("z", undefined, "close");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "b"]);
    expect(await h.outbox.get("z")).toMatchObject({ state: "conflict", detail: { error: "dependent" } });
    expect(await h.outbox.get("a")).toMatchObject({
      state: "conflict",
      detail: { error: "entry_not_actionable" },
    });
    expect(await h.outbox.get("c")).toMatchObject({ state: "conflict", detail: { error: "dependent" } });
    expect(await h.outbox.get("b")).toBeUndefined();
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 3, failed: 0 });
  });

  it.each(["session_closed", "session_not_open"])("marks a %s conflito as a closed session", async (error) => {
    const h = setup({ a: [conflict(error)] });
    await h.enqueue("a", "101");
    await h.engine.kick("enqueue");
    expect(await h.outbox.get("a")).toMatchObject({
      state: "conflict",
      detail: { error, sessionClosed: true },
    });
  });

  it("pauses on 401 with the fila intact and resumes on a manual kick", async () => {
    const h = setup({ a: [{ ok: false, status: 401 }] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(h.engine.status().phase).toBe("paused_auth");
    expect(h.deps.onAuthRequired).toHaveBeenCalledTimes(1);
    expect(await h.states()).toEqual({ a: "queued", b: "queued" });
    await h.engine.kick("interval");
    expect(h.sent()).toEqual(["a"]);
    await h.engine.kick("manual");
    expect(h.sent()).toEqual(["a", "a", "b"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("turns another 4xx into a falha, with the same animal's later passes", async () => {
    const h = setup({
      a: [{ ok: false, status: 422, error: "future_date", message: "Data no futuro" }],
    });
    await h.enqueue("a", "101", "baixa");
    await h.enqueue("b", "102");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "b"]);
    expect(await h.outbox.get("a")).toMatchObject({
      state: "failed",
      detail: { error: "future_date", message: "Data no futuro" },
    });
    expect(await h.outbox.get("c")).toMatchObject({ state: "failed", detail: { error: "dependent" } });
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 0, failed: 2 });
  });

  it("'Manter do servidor' drops the conflito and its dependents, then reloads once", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "server");
    expect(h.ids(h.deps.onDropped)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
    expect(h.deps.onBatchResolved).toHaveBeenCalledTimes(1);
    expect(h.sent()).toEqual(["a"]);
  });

  it("'Manter do servidor' on one animal keeps the session's close and sends it", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.enqueue("z", undefined, "close");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "server");
    expect(h.ids(h.deps.onDropped)).toEqual(["a", "c"]);
    expect(h.sent()).toEqual(["a", "z"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("a kept close stays held while another conflito of the session remains", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")], b: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.enqueue("z", undefined, "close");
    await h.engine.kick("enqueue");
    await h.engine.discard("a");
    expect(h.sent()).toEqual(["a", "b"]);
    expect(await h.states()).toEqual({ b: "conflict", z: "queued" });
    await h.engine.resolve("b", "server");
    expect(h.sent()).toEqual(["a", "b", "z"]);
  });

  it("Descartar on a start drops every later op of the session", async () => {
    const h = setup({ s: [{ ok: false, status: 422, error: "bad" }] });
    await h.enqueue("s", undefined, "start");
    await h.enqueue("a", "101");
    await h.enqueue("z", undefined, "close");
    await h.engine.kick("enqueue");
    await h.engine.discard("s");
    expect(h.ids(h.deps.onDropped)).toEqual(["s", "a", "z"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("removes an applied op before merging it, and a throwing merge keeps the order", async () => {
    const h = setup();
    h.deps.onApplied.mockImplementation((op: OutboxOp) => {
      if (op.id === "a") throw new Error("merge broke");
    });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "c"]);
    expect(h.ids(h.deps.onApplied)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("'Aplicar o meu' removes the op before merging it, even when the merge throws", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.engine.kick("enqueue");
    h.deps.onApplied.mockImplementation(() => {
      throw new Error("merge broke");
    });
    await h.engine.resolve("a", "mine");
    expect(await h.outbox.list()).toEqual([]);
  });

  it("'Aplicar o meu' resends with force and lets the held passes go", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "mine");
    expect(h.sent()).toEqual(["a", "a", "c"]);
    expect(h.forces()).toEqual([false, true, false]);
    expect(h.ids(h.deps.onApplied)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
    expect(h.deps.onBatchResolved).toHaveBeenCalledTimes(1);
  });

  it("'Aplicar o meu' refused again becomes a falha", async () => {
    const h = setup({ a: [conflict("entry_not_actionable"), conflict("has_diagnosis")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "mine");
    expect(await h.states()).toEqual({ a: "failed", c: "failed" });
    expect((await h.outbox.get("a"))?.detail).toMatchObject({ error: "has_diagnosis" });
    expect(h.deps.onApplied).not.toHaveBeenCalled();
  });

  it("'Aplicar todos os meus' goes through the conflitos in fila order with one reload", async () => {
    const h = setup({
      a: [conflict("entry_not_actionable")],
      d: [conflict("out_of_stock")],
    });
    await h.enqueue("a", "101");
    await h.enqueue("d", "103");
    await h.engine.kick("enqueue");
    await h.engine.resolveAll("mine");
    expect(h.sent()).toEqual(["a", "d", "a", "d"]);
    expect(h.forces()).toEqual([false, false, true, true]);
    expect(h.deps.onBatchResolved).toHaveBeenCalledTimes(1);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("Descartar removes a falha and its dependents and takes their records out", async () => {
    const h = setup({ a: [{ ok: false, status: 404, error: "not_found" }] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.discard("a");
    expect(h.ids(h.deps.onDropped)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
    expect(h.sent()).toEqual(["a"]);
  });

  it("sends and counts only the signed-in user's ops", async () => {
    const h = setup();
    await h.outbox.enqueue({ id: "x", userId: "u2", farmId: 1, sessionId: "s1", kind: "complete", earTag: "103", body: {} });
    await h.enqueue("a", "101");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(await h.states()).toEqual({ x: "queued" });
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 0, failed: 0 });
  });

  it("sends and counts only the active farm's ops", async () => {
    const h = setup();
    await h.outbox.enqueue({ id: "x", userId: "u1", farmId: 2, sessionId: "s2", kind: "complete", earTag: "103", body: {} });
    await h.enqueue("a", "101");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(await h.states()).toEqual({ x: "queued" });
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 0, failed: 0 });
  });

  it("reports offline, then sending with progress, then idle", async () => {
    const h = setup({}, false);
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual([]);
    expect(h.engine.status()).toMatchObject({
      online: false,
      phase: "offline",
      offlineSince: "2026-09-25T14:07:00.000Z",
      counts: { queued: 2, conflict: 0, failed: 0 },
    });
    const seen: SyncStatus[] = [];
    h.engine.subscribe((s) => seen.push(s));
    vi.setSystemTime(new Date("2026-09-25T14:41:00.000Z"));
    h.setOnline(true);
    await h.engine.kick("online");
    expect(seen.filter((s) => s.phase === "sending").map((s) => s.sending)).toEqual([
      { done: 0, total: 2 },
      { done: 1, total: 2 },
    ]);
    expect(seen.at(-1)).toMatchObject({
      online: true,
      phase: "idle",
      lastSyncedAt: "2026-09-25T14:41:00.000Z",
      counts: { queued: 0, conflict: 0, failed: 0 },
    });
    expect(seen.at(-1)?.offlineSince).toBeUndefined();
  });
});
