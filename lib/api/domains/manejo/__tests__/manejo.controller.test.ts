/**
 * How the manejo routes answer a refusal. A diagnosed cobertura names itself in
 * the 409 of an undo (`POST .../reopen`) and of a delete (`DELETE /manejo/:id`),
 * so the client can offer to clear that diagnosis; every other conflict keeps
 * its plain `{ error }`.
 *
 * The farm macro is stubbed to a fixed farm and the use cases to queued answers,
 * so only the controller's mapping runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { reopen, remove } = vi.hoisted(() => ({ reopen: vi.fn(), remove: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/plugins/farm", async () => {
  const { Elysia } = await import("elysia");
  return {
    farmPlugin: new Elysia({ name: "farm" }).macro({
      farm: { resolve: () => ({ farmId: 7 }) },
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

import { manejoController } from "../manejo.controller";

const call = async (method: string, path: string) => {
  const response = await manejoController.handle(
    new Request(`http://localhost${path}`, { method })
  );
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  reopen.mockReset();
  remove.mockReset();
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
