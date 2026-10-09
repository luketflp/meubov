/**
 * The plan-group routes behind the farm macro, auth and db mocked: a member
 * who only sees Financeiro writes nothing, a body the schema refuses never
 * reaches the use case, a PATCH never carries the tipo, and each refusal of a
 * use case answers its status.
 */
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, add, update, remove } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => Promise.resolve(state.membership),
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/api/domains/planGroups/useCases/Add.useCase", () => ({
  AddPlanGroupUseCase: class {
    run = add;
  },
}));
vi.mock("@/lib/api/domains/planGroups/useCases/Update.useCase", () => ({
  UpdatePlanGroupUseCase: class {
    run = update;
  },
}));
vi.mock("@/lib/api/domains/planGroups/useCases/Delete.useCase", () => ({
  DeletePlanGroupUseCase: class {
    run = remove;
  },
}));

import { planGroupsController } from "@/lib/api/domains/planGroups/planGroups.controller";

// The controller alone under the herd API's prefix: the farm macro reads the same ROUTE_REQUIREMENTS keys.
const api = new Elysia({ prefix: "/api/herd" }).use(planGroupsController);

const request = (method: string, path: string, body?: unknown) =>
  api.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const ARRENDAMENTO = {
  id: "g-arr",
  kind: "revenue",
  name: "Arrendamento de pasto",
  createdAt: "2026-10-09T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
});

describe("plan-group routes", () => {
  it("refuse every write to a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    for (const response of [
      await request("POST", "/plan-groups", { kind: "expense", name: "Máquinas e veículos" }),
      await request("PATCH", "/plan-groups/g-maq", { archived: true }),
      await request("DELETE", "/plan-groups/g-maq"),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    }
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuse a blank name, one over 40 characters, a missing tipo and a rendimento before the use case", async () => {
    for (const body of [
      { kind: "expense", name: "   " },
      { kind: "expense", name: "x".repeat(41) },
      { name: "Arrendamento" },
      { kind: "yield", name: "Rendimentos" },
    ]) {
      expect((await request("POST", "/plan-groups", body)).status).toBe(422);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("create a grupo under the tipo sent, and never pass a tipo on a patch", async () => {
    add.mockResolvedValue(ARRENDAMENTO);
    update.mockResolvedValue({ ...ARRENDAMENTO, name: "Vendas" });

    const created = await request("POST", "/plan-groups", { kind: "revenue", name: "Arrendamento de pasto" });
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual(ARRENDAMENTO);
    expect(add).toHaveBeenCalledWith({ farmId: 7, kind: "revenue", name: "Arrendamento de pasto" });

    const renamed = await request("PATCH", "/plan-groups/g-arr", { name: "Vendas", kind: "expense" });
    expect(renamed.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ farmId: 7, id: "g-arr", patch: { name: "Vendas" } });
  });

  it("answer 409 duplicate_name for a taken name, 404 off the farm and 409 in_use for a grupo in use", async () => {
    add.mockResolvedValue("duplicate");
    update.mockResolvedValue(null);
    remove.mockResolvedValue("in_use");

    const created = await request("POST", "/plan-groups", { kind: "revenue", name: "Nutrição" });
    expect(created.status).toBe(409);
    expect(await created.json()).toEqual({ error: "duplicate_name" });

    const renamed = await request("PATCH", "/plan-groups/g-9", { name: "Arrendamento" });
    expect(renamed.status).toBe(404);
    expect(await renamed.json()).toEqual({ error: "not_found" });

    const removed = await request("DELETE", "/plan-groups/g-maq");
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "in_use" });
  });

  it("answer the id of a deleted grupo", async () => {
    remove.mockResolvedValue("deleted");

    const response = await request("DELETE", "/plan-groups/g-maq");
    expect(await response.json()).toEqual({ id: "g-maq" });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, id: "g-maq" });
  });
});
