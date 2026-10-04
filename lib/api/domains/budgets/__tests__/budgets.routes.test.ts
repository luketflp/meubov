/**
 * The orçamento routes behind the farm macro, auth and db mocked:
 * - a member who only sees Financeiro reads a safra and writes nothing;
 * - a member without Financeiro does not even read it;
 * - PUT takes eleven months as far as the use case, which names the refusal,
 *   and sends who saved the line;
 * - DELETE reads the line from the query;
 * - a start month another session moved is a 409 on every write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, list, put, remove, copy } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
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
vi.mock("@/lib/api/domains/budgets/useCases/ListBudgets.useCase", () => ({
  ListBudgetsUseCase: class {
    run = list;
  },
}));
vi.mock("@/lib/api/domains/budgets/useCases/PutBudgetLine.useCase", () => ({
  PutBudgetLineUseCase: class {
    run = put;
  },
}));
vi.mock("@/lib/api/domains/budgets/useCases/DeleteBudgetLine.useCase", () => ({
  DeleteBudgetLineUseCase: class {
    run = remove;
  },
}));
vi.mock("@/lib/api/domains/budgets/useCases/CopyBudgets.useCase", () => ({
  CopyBudgetsUseCase: class {
    run = copy;
  },
}));

import { herdApi } from "@/lib/api/app";

const LINE = { safra: 2025, startMonth: 10, category: "nutrition", months: Array(11).fill(100), distribution: "manual" };
const COPY = { from: 2024, to: 2025, startMonth: 10, source: "budgeted", adjustPct: 0 };

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
  list.mockResolvedValue([]);
});

describe("budgets routes", () => {
  it("lets Financeiro view read a safra and refuses every write, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    const read = await request("GET", "/budgets?safra=2025");
    expect(read.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ farmId: 7, safra: 2025 });

    for (const response of [
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&startMonth=10&category=nutrition"),
      await request("POST", "/budgets/copy", COPY),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    }
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it("keeps the orçamento from a member without Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.vaqueiro }];

    const response = await request("GET", "/budgets?safra=2025");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(list).not.toHaveBeenCalled();
  });

  it("answers months_mismatch as a 400 and saves under the caller's id", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    put.mockResolvedValue("months_mismatch");

    const response = await request("PUT", "/budgets", LINE);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "months_mismatch" });
    expect(put).toHaveBeenCalledWith({ farmId: 7, userId: "user-1", ...LINE });
  });

  it("removes the line named in the query, with the empty body Eden sends", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    remove.mockResolvedValue(12);

    const response = await request("DELETE", "/budgets?safra=2025&startMonth=10&category=admin", {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: 12 });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, safra: 2025, startMonth: 10, category: "admin" });
  });

  it("answers start_month_changed as a 409 on every write", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    for (const useCase of [put, remove, copy]) useCase.mockResolvedValue("start_month_changed");

    for (const response of [
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&startMonth=10&category=admin", {}),
      await request("POST", "/budgets/copy", COPY),
    ]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "start_month_changed" });
    }
  });
});
