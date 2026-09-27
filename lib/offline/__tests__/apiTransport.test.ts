import { describe, expect, it, vi } from "vitest";
import { createApiTransport } from "@/lib/offline/apiTransport";
import type { OutboxOp } from "@/lib/offline/types";

type Answer = { data: unknown; error: { status: number; value: unknown } | null };

/** The slice of the Eden client the two kinds under test walk through. */
function stubApi(answer: Answer) {
  const complete = vi.fn<(body: unknown, opts?: unknown) => Promise<Answer>>(async () => answer);
  const start = vi.fn<(body: unknown, opts?: unknown) => Promise<Answer>>(async () => answer);
  const animals = vi.fn<(params: { animalId: string }) => object>(() => ({
    complete: { post: complete },
  }));
  const manejo = Object.assign(
    vi.fn<(params: { id: string }) => object>(() => ({ animals })),
    { post: start }
  );
  return { api: { manejo }, manejo, animals, complete, start };
}

const op = (patch: Partial<OutboxOp> = {}): OutboxOp => ({
  id: "op1",
  seq: 1,
  userId: "u1",
  farmId: 1,
  sessionId: "s1",
  kind: "complete",
  earTag: "101",
  body: { weightKg: 301 },
  createdAt: "2026-09-25T14:07:00.000Z",
  state: "sending",
  attempts: 0,
  ...patch,
});

const idOf = (earTag: string) => (earTag === "101" ? "a-101" : undefined);

describe("createApiTransport", () => {
  it("sends a pass to its animal's route with the op's body and force", async () => {
    const s = stubApi({ data: { entry: { earTag: "101", outcome: "done" } }, error: null });
    const result = await createApiTransport(s.api as never, idOf).send(op(), { force: true });
    expect(s.manejo).toHaveBeenCalledWith({ id: "s1" });
    expect(s.animals).toHaveBeenCalledWith({ animalId: "a-101" });
    expect(s.complete).toHaveBeenCalledWith(
      { weightKg: 301, force: true },
      { headers: { "x-farm-id": "1" } }
    );
    expect(result).toEqual({ ok: true, result: { entry: { earTag: "101", outcome: "done" } } });
  });

  it("starts a manejo with the id the phone gave it", async () => {
    const s = stubApi({ data: { id: "s1" }, error: null });
    const body = { date: "2026-09-25", kind: "weighing", earTags: ["101"], weighing: true };
    await createApiTransport(s.api as never, idOf).send(
      op({ kind: "start", earTag: undefined, body }),
      { force: false }
    );
    expect(s.start).toHaveBeenCalledWith({ ...body, id: "s1" }, { headers: { "x-farm-id": "1" } });
  });

  it("reads the server's reason from a refusal", async () => {
    const s = stubApi({ data: null, error: { status: 409, value: { error: "session_closed" } } });
    const result = await createApiTransport(s.api as never, idOf).send(op(), { force: true });
    expect(result).toEqual({ ok: false, status: 409, error: "session_closed", sessionClosed: true });
  });

  it("keeps the server's entry from a 409, for the sheet", async () => {
    const server = { earTag: "101", outcome: "done", weightKg: 299 };
    const s = stubApi({ data: null, error: { status: 409, value: { error: "entry_not_actionable", entry: server } } });
    const result = await createApiTransport(s.api as never, idOf).send(op(), { force: false });
    expect(result).toEqual({ ok: false, status: 409, error: "entry_not_actionable", server });
  });

  it("throws when the request never got through", async () => {
    const s = stubApi({ data: null, error: { status: 503, value: new TypeError("Failed to fetch") } });
    await expect(
      createApiTransport(s.api as never, idOf).send(op(), { force: false })
    ).rejects.toThrow("network failure");
  });

  it("fails an op whose animal is no longer in the herd", async () => {
    const s = stubApi({ data: null, error: null });
    const result = await createApiTransport(s.api as never, idOf).send(op({ earTag: "999" }), {
      force: false,
    });
    expect(result).toEqual({ ok: false, status: 404, error: "animal_not_found" });
    expect(s.complete).not.toHaveBeenCalled();
  });
});
