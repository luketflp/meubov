/**
 * Sends one fila operation to the manejo route its online action calls, with
 * the same body (plus `force` on the four pass routes when the vaqueiro chose
 * "Aplicar o meu"), and reads the answer the way the sync engine needs it.
 */
import type { api as herdApi } from "@/lib/api/client";
import type { SendResult, Transport } from "@/lib/offline/sync";
import type { OutboxOp } from "@/lib/offline/types";
import type { ManejoSessionAnimal } from "@/lib/types";

type Answer = { data: unknown; error: { status: unknown; value: unknown } | null };

/** The Eden call of one op; null when its animal is not in the herd any more. */
function request(
  api: typeof herdApi,
  op: OutboxOp,
  force: boolean,
  animalId: string | undefined
): Promise<Answer> | null {
  const session = api.manejo({ id: op.sessionId });
  // The op's own farm, not the one active now: a farm switch mid-send changes nothing.
  const opts = { headers: { "x-farm-id": String(op.farmId) } };
  // op.body is exactly what the online action sent, typed there.
  switch (op.kind) {
    case "start":
      return api.manejo.post({ ...op.body, id: op.sessionId } as never, opts);
    case "carcass-yield":
      return session["carcass-yield"].post(op.body as never, opts);
    case "close":
      return session.close.post(undefined, opts);
  }
  if (animalId === undefined) return null;
  const animal = session.animals({ animalId });
  switch (op.kind) {
    case "complete":
      return animal.complete.post({ ...op.body, force } as never, opts);
    case "set-aside":
      return animal["set-aside"].post({ ...op.body, force } as never, opts);
    case "skip":
      return animal.skip.post({ ...op.body, force } as never, opts);
    case "baixa":
      return animal.baixa.post({ ...op.body, force } as never, opts);
    case "reopen":
      return animal.reopen.post(undefined, opts);
  }
  return null;
}

export function createApiTransport(
  api: typeof herdApi,
  animalIdByEarTag: (earTag: string) => string | undefined
): Transport {
  return {
    async send(op, { force }): Promise<SendResult> {
      const animalId = op.earTag === undefined ? undefined : animalIdByEarTag(op.earTag);
      const call = request(api, op, force, animalId);
      if (call === null) return { ok: false, status: 404, error: "animal_not_found" };
      const { data, error } = await call;
      if (!error) return { ok: true, result: data };
      const status = Number(error.status);
      // Eden answers 503 without a response when fetch itself failed: no signal.
      if (status === 0 || status === 503) throw new Error(`network failure (${status})`);
      const value =
        typeof error.value === "object" && error.value !== null
          ? (error.value as { error?: unknown; message?: unknown; entry?: unknown })
          : {};
      const code = typeof value.error === "string" ? value.error : undefined;
      return {
        ok: false,
        status,
        error: code,
        message: typeof value.message === "string" ? value.message : undefined,
        // The pass routes' 409s name the server's entry (merge-notes ruling 8).
        server:
          typeof value.entry === "object" && value.entry !== null
            ? (value.entry as ManejoSessionAnimal)
            : undefined,
        sessionClosed: code === "session_closed" || code === "session_not_open" || undefined,
      };
    },
  };
}
