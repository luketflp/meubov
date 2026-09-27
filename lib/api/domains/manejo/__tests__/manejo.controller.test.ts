/**
 * How the manejo routes answer a refusal. A diagnosed cobertura names itself in
 * the 409 of an undo (`POST .../reopen`) and of a delete (`DELETE /manejo/:id`),
 * so the client can offer to clear that diagnosis; every other conflict keeps
 * its plain `{ error }`. A venda still holding a dúvida cannot close, and the
 * rendimento a complete pass carries is stripped from the body before it
 * reaches the use case for a caller without Financeiro edit.
 *
 * The farm macro is stubbed to a fixed farm and, by default, the Dono's full
 * permissions — a test may override them through `permState` — and the use
 * cases to queued answers, so only the controller's mapping runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { reopen, remove, complete, setAside, close, start, skip } = vi.hoisted(() => ({
  reopen: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  setAside: vi.fn(),
  close: vi.fn(),
  start: vi.fn(),
  skip: vi.fn(),
}));

const { permState } = vi.hoisted(() => ({
  permState: { current: undefined as unknown },
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/plugins/farm", async () => {
  const { Elysia } = await import("elysia");
  const { FULL_PERMISSIONS } = await import("@/lib/domain/permissions");
  return {
    farmPlugin: new Elysia({ name: "farm" }).macro({
      farm: { resolve: () => ({ farmId: 7, permissions: permState.current ?? FULL_PERMISSIONS }) },
    }),
  };
});
vi.mock("../useCases/ReopenAnimal.useCase", () => ({
  ReopenAnimalUseCase: class {
    run = reopen;
  },
}));
vi.mock("../useCases/Delete.useCase", () => ({
  DeleteSessionUseCase: class {
    run = remove;
  },
}));
vi.mock("../useCases/CompleteAnimal.useCase", () => ({
  CompleteAnimalUseCase: class {
    run = complete;
  },
}));
vi.mock("../useCases/SetAsideAnimal.useCase", () => ({
  SetAsideAnimalUseCase: class {
    run = setAside;
  },
}));
vi.mock("../useCases/Close.useCase", () => ({
  CloseSessionUseCase: class {
    run = close;
  },
}));
vi.mock("../useCases/Start.useCase", () => ({
  StartSessionUseCase: class {
    run = start;
  },
}));
vi.mock("../useCases/SkipAnimal.useCase", () => ({
  SkipAnimalUseCase: class {
    run = skip;
  },
}));

import { manejoController } from "../manejo.controller";

const call = async (method: string, path: string, body?: unknown) => {
  const response = await manejoController.handle(
    new Request(`http://localhost${path}`, {
      method,
      ...(body !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    })
  );
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  reopen.mockReset();
  remove.mockReset();
  complete.mockReset();
  setAside.mockReset();
  close.mockReset();
  start.mockReset();
  skip.mockReset();
  permState.current = undefined;
});

describe("POST /manejo/:id/animals/:animalId/reopen", () => {
  it("answers 409 with the cobertura when its diagnosis blocks the undo", async () => {
    reopen.mockResolvedValue({ conflict: "has_diagnosis", breedingId: "br-1" });

    expect(await call("POST", "/manejo/s-1/animals/a-1/reopen")).toEqual({
      status: 409,
      body: { error: "has_diagnosis", breedingId: "br-1" },
    });
    expect(reopen).toHaveBeenCalledWith({ farmId: 7, sessionId: "s-1", animalId: "a-1" });
  });

  it("keeps any other conflict as a plain error", async () => {
    reopen.mockResolvedValue({ conflict: "session_not_open" });

    expect(await call("POST", "/manejo/s-1/animals/a-1/reopen")).toEqual({
      status: 409,
      body: { error: "session_not_open" },
    });
  });
});

describe("DELETE /manejo/:id", () => {
  it("answers 409 with the blocked animals, a diagnosed one with its cobertura", async () => {
    const blocked = [
      { earTag: "V-03", reason: "has_diagnosis", breedingId: "br-3" },
      { earTag: "B-001", reason: "moved_lot" },
    ];
    remove.mockResolvedValue({ blocked });

    expect(await call("DELETE", "/manejo/s-1")).toEqual({ status: 409, body: { blocked } });
  });
});

describe("POST /manejo/:id/animals/:animalId/complete", () => {
  it("strips the rendimento from the body for a caller without Financeiro edit", async () => {
    const { PRESETS } = await import("@/lib/domain/permissions");
    permState.current = PRESETS.vaqueiro;
    complete.mockResolvedValue({ entry: { earTag: "V-01", outcome: "done" }, treatments: [] });

    await call("POST", "/manejo/s-1/animals/a-1/complete", { weightKg: 500, carcassYieldPct: 54 });

    expect(complete).toHaveBeenCalledWith({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: { weightKg: 500, carcassYieldPct: undefined },
    });
  });

  it("keeps the rendimento in the body for a caller with Financeiro edit", async () => {
    complete.mockResolvedValue({ entry: { earTag: "V-01", outcome: "done" }, treatments: [] });

    await call("POST", "/manejo/s-1/animals/a-1/complete", { weightKg: 500, carcassYieldPct: 54 });

    expect(complete).toHaveBeenCalledWith({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: { weightKg: 500, carcassYieldPct: 54 },
    });
  });
});

describe("POST /manejo/:id/animals/:animalId/set-aside", () => {
  it("routes the call to the use case and returns its value", async () => {
    setAside.mockResolvedValue({ entry: { earTag: "V-01", outcome: "held" } });

    const result = await call("POST", "/manejo/s-1/animals/a-1/set-aside", { list: "held" });

    expect(setAside).toHaveBeenCalledWith({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });
    expect(result).toEqual({ status: 200, body: { entry: { earTag: "V-01", outcome: "held" } } });
  });
});

describe("POST /manejo/:id/close", () => {
  it("answers 409 when a dúvida is still open", async () => {
    close.mockResolvedValue({ conflict: "held_pending" });

    expect(await call("POST", "/manejo/s-1/close")).toEqual({
      status: 409,
      body: { error: "held_pending" },
    });
  });

  it("closes when nothing is left in dúvida", async () => {
    close.mockResolvedValue(true);

    expect(await call("POST", "/manejo/s-1/close")).toEqual({
      status: 200,
      body: { id: "s-1", status: "closed" },
    });
  });
});

describe("POST /manejo with the id a phone made up offline", () => {
  const BODY = {
    id: "0b7f2c1e-8a4d-4c3b-9f1e-2d5a6b7c8d9e",
    date: "2026-09-25",
    kind: "weighing",
    earTags: ["V-01"],
    weighing: true,
  };

  it("answers 409 id_taken when another farm holds the id", async () => {
    start.mockResolvedValue("id_taken");

    expect(await call("POST", "/manejo", BODY)).toEqual({ status: 409, body: { error: "id_taken" } });
    expect(start).toHaveBeenCalledWith({ farmId: 7, input: BODY });
  });

  it("refuses an id that is not a uuid before the use case runs", async () => {
    const response = await manejoController.handle(
      new Request("http://localhost/manejo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...BODY, id: "s-1" }),
      })
    );

    expect(response.status).toBe(422);
    expect(start).not.toHaveBeenCalled();
  });
});

describe("a forced pass", () => {
  it("forwards force on complete and answers 409 session_closed", async () => {
    complete.mockResolvedValue({ conflict: "session_closed" });

    expect(
      await call("POST", "/manejo/s-1/animals/a-1/complete", { weightKg: 500, force: true })
    ).toEqual({ status: 409, body: { error: "session_closed" } });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
  });

  it("forwards force on skip and answers 409 session_closed", async () => {
    skip.mockResolvedValue({ conflict: "session_closed" });

    expect(await call("POST", "/manejo/s-1/animals/a-1/skip", { force: true })).toEqual({
      status: 409,
      body: { error: "session_closed" },
    });
    expect(skip).toHaveBeenCalledWith({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      notes: undefined,
      force: true,
    });
  });

  it("answers 409 with the server's entry, its valor hidden without Financeiro", async () => {
    const { PRESETS } = await import("@/lib/domain/permissions");
    permState.current = PRESETS.vaqueiro;
    const entry = { earTag: "V-01", outcome: "done", weightKg: 299, amountBrl: 4200 };
    setAside.mockResolvedValue({ conflict: "entry_not_actionable", entry });

    expect(await call("POST", "/manejo/s-1/animals/a-1/set-aside", { list: "held" })).toEqual({
      status: 409,
      body: { error: "entry_not_actionable", entry: { earTag: "V-01", outcome: "done", weightKg: 299 } },
    });
  });

  it("answers 404 on set-aside when the undo finds the old lot gone", async () => {
    setAside.mockResolvedValue("lot_not_found");

    expect(
      await call("POST", "/manejo/s-1/animals/a-1/set-aside", { list: "held", force: true })
    ).toEqual({ status: 404, body: { error: "lot_not_found" } });
  });
});
