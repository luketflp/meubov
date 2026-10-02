/**
 * POST /expenses/:id/split behind the farm macro, with auth and db mocked:
 * - a member who only sees Financeiro cannot parcelar;
 * - another farm's lançamento is a 404;
 * - a refusal is a 400 naming it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, split } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  split: vi.fn(),
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
vi.mock("@/lib/api/domains/expenses/useCases/Split.useCase", () => ({
  SplitExpenseUseCase: class {
    run = split;
  },
}));

import { herdApi } from "@/lib/api/app";

const BODY = { count: 3, frequency: "monthly", startsOn: "2026-10-10" };

const splitRequest = () =>
  herdApi.handle(
    new Request("http://localhost/api/herd/expenses/e-9/split", {
      method: "POST",
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: JSON.stringify(BODY),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  split.mockReset();
});

describe("POST /expenses/:id/split", () => {
  it("refuses a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];
    const response = await splitRequest();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(split).not.toHaveBeenCalled();
  });

  it("answers 404 for another farm's lançamento and 400 naming a refusal", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    split.mockResolvedValueOnce(null).mockResolvedValueOnce("not_splittable");

    expect((await splitRequest()).status).toBe(404);
    expect(split).toHaveBeenCalledWith({ farmId: 7, id: "e-9", ...BODY });
    const refused = await splitRequest();
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "not_splittable" });
  });
});
