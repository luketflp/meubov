/**
 * The grupos de despesa routes behind the farm macro, auth and db mocked: a
 * member who only sees Financeiro writes nothing, a name the schema refuses
 * never reaches the use case, and each refusal of a use case answers its status.
 */
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
vi.mock("@/lib/api/domains/expenseGroups/useCases/Add.useCase", () => ({
  AddExpenseGroupUseCase: class {
    run = add;
  },
}));
vi.mock("@/lib/api/domains/expenseGroups/useCases/Update.useCase", () => ({
  UpdateExpenseGroupUseCase: class {
    run = update;
  },
}));
vi.mock("@/lib/api/domains/expenseGroups/useCases/Delete.useCase", () => ({
  DeleteExpenseGroupUseCase: class {
    run = remove;
  },
}));

import { herdApi } from "@/lib/api/app";

const request = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
});

describe("grupos de despesa routes", () => {
  it("refuse every write to a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    for (const response of [
      await request("POST", "/expense-groups", { name: "Máquinas e veículos" }),
      await request("PATCH", "/expense-groups/g-maq", { archived: true }),
      await request("DELETE", "/expense-groups/g-maq"),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    }
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuse a blank name and one over 40 characters before the use case", async () => {
    for (const name of ["   ", "x".repeat(41)]) {
      expect((await request("POST", "/expense-groups", { name })).status).toBe(422);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("answer 409 duplicate_name for a taken name, 404 off the farm and 409 in_use for a grupo in use", async () => {
    add.mockResolvedValue("duplicate");
    update.mockResolvedValue(null);
    remove.mockResolvedValue("in_use");

    const created = await request("POST", "/expense-groups", { name: "Nutrição" });
    expect(created.status).toBe(409);
    expect(await created.json()).toEqual({ error: "duplicate_name" });
    expect(add).toHaveBeenCalledWith({ farmId: 7, name: "Nutrição" });

    const renamed = await request("PATCH", "/expense-groups/g-9", { name: "Arrendamento" });
    expect(renamed.status).toBe(404);
    expect(update).toHaveBeenCalledWith({ farmId: 7, id: "g-9", patch: { name: "Arrendamento" } });

    const removed = await request("DELETE", "/expense-groups/g-maq");
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "in_use" });
  });

  it("answer the id of a deleted grupo", async () => {
    remove.mockResolvedValue("deleted");

    const response = await request("DELETE", "/expense-groups/g-maq");
    expect(await response.json()).toEqual({ id: "g-maq" });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, id: "g-maq" });
  });
});
