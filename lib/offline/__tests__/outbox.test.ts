import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/offline/db";
import { createOutbox, dependentOps, type Outbox } from "@/lib/offline/outbox";
import type { OutboxOp } from "@/lib/offline/types";

type NewOp = Parameters<Outbox["enqueue"]>[0];

let nextId = 0;
const newOp = (overrides: Partial<NewOp> = {}): NewOp => ({
  id: `op-${++nextId}`,
  userId: "user-1",
  farmId: 1,
  sessionId: "s1",
  kind: "complete",
  earTag: "BR-001",
  body: {},
  ...overrides,
});

const setup = () => {
  const store = memoryStore<OutboxOp>();
  const meta = memoryStore<number>();
  return { store, meta, outbox: createOutbox(store, meta) };
};

describe("createOutbox", () => {
  it("enqueues with a monotonic seq, queued state and no attempts", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp({ createdAt: "2026-09-25T10:00:00.000Z" }));
    const b = await outbox.enqueue(newOp());

    expect(a).toMatchObject({ seq: 1, state: "queued", attempts: 0, createdAt: "2026-09-25T10:00:00.000Z" });
    expect(b.seq).toBe(2);
    expect(Number.isNaN(Date.parse(b.createdAt))).toBe(false);
  });

  it("keeps seq monotonic across a restart, since meta persists", async () => {
    const { store, meta, outbox } = setup();
    await outbox.enqueue(newOp());
    await outbox.enqueue(newOp());

    const restarted = createOutbox(store, meta);
    expect((await restarted.enqueue(newOp())).seq).toBe(3);
    expect((await restarted.list()).map((op) => op.seq)).toEqual([1, 2, 3]);
  });

  it("gives concurrent enqueues distinct seqs", async () => {
    const { outbox } = setup();
    const ops = await Promise.all([outbox.enqueue(newOp()), outbox.enqueue(newOp()), outbox.enqueue(newOp())]);
    expect(ops.map((op) => op.seq).sort()).toEqual([1, 2, 3]);
  });

  it("lists by seq ascending whatever the storage order", async () => {
    const { store, outbox } = setup();
    const late = { ...newOp(), seq: 5, state: "queued", attempts: 0, createdAt: "2026-09-25T10:05:00.000Z" } as OutboxOp;
    const early = { ...newOp(), seq: 2, state: "queued", attempts: 0, createdAt: "2026-09-25T10:02:00.000Z" } as OutboxOp;
    await store.put(late.id, late);
    await store.put(early.id, early);

    expect((await outbox.list()).map((op) => op.seq)).toEqual([2, 5]);
  });

  it("gets, updates and removes one op", async () => {
    const { outbox } = setup();
    const op = await outbox.enqueue(newOp());

    const updated = await outbox.update(op.id, { state: "failed", detail: { error: "forbidden" } });
    expect(updated).toMatchObject({ id: op.id, seq: 1, state: "failed", detail: { error: "forbidden" } });
    expect(await outbox.get(op.id)).toEqual(updated);
    expect(await outbox.update("missing", { state: "queued" })).toBeUndefined();

    await outbox.remove(op.id);
    expect(await outbox.get(op.id)).toBeUndefined();
  });

  it("nextSendable returns the lowest-seq queued op", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp());
    await outbox.enqueue(newOp({ earTag: "BR-002" }));

    expect((await outbox.nextSendable())?.id).toBe(a.id);
    await outbox.update(a.id, { state: "sending" });
    expect((await outbox.nextSendable())?.earTag).toBe("BR-002");
  });

  it("nextSendable skips a pass blocked by an earlier conflict on the same animal, not another animal", async () => {
    const { outbox } = setup();
    const first = await outbox.enqueue(newOp({ earTag: "BR-001" }));
    await outbox.enqueue(newOp({ earTag: "BR-001", kind: "reopen" }));
    const other = await outbox.enqueue(newOp({ earTag: "BR-002" }));

    await outbox.update(first.id, { state: "conflict", detail: { error: "entry_not_actionable" } });

    expect((await outbox.nextSendable())?.id).toBe(other.id);
  });

  it("nextSendable skips every op of a session whose start conflicted or failed", async () => {
    const { outbox } = setup();
    const start = await outbox.enqueue(newOp({ sessionId: "s2", kind: "start", earTag: undefined }));
    await outbox.enqueue(newOp({ sessionId: "s2", earTag: "BR-003" }));
    await outbox.enqueue(newOp({ sessionId: "s2", kind: "close", earTag: undefined }));
    const elsewhere = await outbox.enqueue(newOp({ sessionId: "s1", earTag: "BR-001" }));

    await outbox.update(start.id, { state: "failed", detail: { error: "forbidden" } });
    expect((await outbox.nextSendable())?.id).toBe(elsewhere.id);

    await outbox.update(start.id, { state: "conflict", detail: { error: "id_taken" } });
    expect((await outbox.nextSendable())?.id).toBe(elsewhere.id);

    await outbox.remove(elsewhere.id);
    expect(await outbox.nextSendable()).toBeUndefined();
  });

  it("nextSendable holds a close back behind any earlier conflito of its session", async () => {
    const { outbox } = setup();
    const first = await outbox.enqueue(newOp({ earTag: "BR-001" }));
    const close = await outbox.enqueue(newOp({ kind: "close", earTag: undefined }));

    await outbox.update(first.id, { state: "conflict", detail: { error: "entry_not_actionable" } });
    expect(await outbox.nextSendable()).toBeUndefined();

    await outbox.remove(first.id);
    expect((await outbox.nextSendable())?.id).toBe(close.id);
  });

  it("list, nextSendable and counts see only the given user's ops", async () => {
    const { outbox } = setup();
    const other = await outbox.enqueue(newOp({ userId: "user-2" }));
    const mine = await outbox.enqueue(newOp({ earTag: "BR-002" }));

    expect((await outbox.list("user-1")).map((op) => op.id)).toEqual([mine.id]);
    expect((await outbox.nextSendable("user-1"))?.id).toBe(mine.id);
    expect((await outbox.nextSendable())?.id).toBe(other.id);
    expect(await outbox.counts("user-1")).toEqual({ queued: 1, conflict: 0, failed: 0 });
    expect(await outbox.counts()).toEqual({ queued: 2, conflict: 0, failed: 0 });
  });

  it("list, nextSendable and counts see only the given farm's ops", async () => {
    const { outbox } = setup();
    const other = await outbox.enqueue(newOp({ farmId: 2 }));
    const mine = await outbox.enqueue(newOp({ earTag: "BR-002" }));

    expect((await outbox.list("user-1", 1)).map((op) => op.id)).toEqual([mine.id]);
    expect((await outbox.nextSendable("user-1", 1))?.id).toBe(mine.id);
    expect((await outbox.nextSendable("user-1", 2))?.id).toBe(other.id);
    expect(await outbox.counts("user-1", 1)).toEqual({ queued: 1, conflict: 0, failed: 0 });
  });

  it("removeIfQueued takes a queued op out, never one being sent", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp());
    const b = await outbox.enqueue(newOp({ earTag: "BR-002" }));
    const sending = outbox.update(b.id, { state: "sending" });

    expect(await outbox.removeIfQueued(b.id)).toBe(false);
    expect(await sending).toMatchObject({ state: "sending" });
    expect(await outbox.removeIfQueued(a.id)).toBe(true);
    expect(await outbox.update(a.id, { state: "sending" })).toBeUndefined();
    expect((await outbox.list()).map((op) => op.id)).toEqual([b.id]);
  });

  it("counts queued (sending included), conflicts and failures", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp());
    const b = await outbox.enqueue(newOp({ earTag: "BR-002" }));
    const c = await outbox.enqueue(newOp({ earTag: "BR-003" }));
    await outbox.enqueue(newOp({ earTag: "BR-004" }));
    await outbox.update(a.id, { state: "sending" });
    await outbox.update(b.id, { state: "conflict" });
    await outbox.update(c.id, { state: "failed" });

    expect(await outbox.counts()).toEqual({ queued: 2, conflict: 1, failed: 1 });
  });

  it("removeSession drops every op of that session only; hasPending sees any state", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp({ sessionId: "s1" }));
    await outbox.enqueue(newOp({ sessionId: "s1", earTag: "BR-002" }));
    await outbox.enqueue(newOp({ sessionId: "s2" }));

    await outbox.update(a.id, { state: "failed" });
    expect(await outbox.hasPending("s1")).toBe(true);
    expect(await outbox.hasPending("s3")).toBe(false);

    await outbox.removeSession("s1");
    expect(await outbox.hasPending("s1")).toBe(false);
    expect((await outbox.list()).map((op) => op.sessionId)).toEqual(["s2"]);
  });
});

describe("dependentOps", () => {
  it("returns the later ops of the same session and animal for a pass", async () => {
    const { outbox } = setup();
    await outbox.enqueue(newOp({ earTag: "BR-001", kind: "skip" }));
    const pass = await outbox.enqueue(newOp({ earTag: "BR-001" }));
    await outbox.enqueue(newOp({ earTag: "BR-002" }));
    const reopen = await outbox.enqueue(newOp({ earTag: "BR-001", kind: "reopen" }));
    await outbox.enqueue(newOp({ sessionId: "s2", earTag: "BR-001" }));
    await outbox.enqueue(newOp({ kind: "close", earTag: undefined }));

    const close = (await outbox.list()).at(-1)!;
    expect(dependentOps(await outbox.list(), pass).map((op) => op.id)).toEqual([reopen.id, close.id]);
  });

  it("returns every later op of the session for a start", async () => {
    const { outbox } = setup();
    const start = await outbox.enqueue(newOp({ sessionId: "s2", kind: "start", earTag: undefined }));
    const pass = await outbox.enqueue(newOp({ sessionId: "s2", earTag: "BR-003" }));
    await outbox.enqueue(newOp({ sessionId: "s1", earTag: "BR-001" }));
    const close = await outbox.enqueue(newOp({ sessionId: "s2", kind: "close", earTag: undefined }));

    expect(dependentOps(await outbox.list(), start).map((op) => op.id)).toEqual([pass.id, close.id]);
  });
});
