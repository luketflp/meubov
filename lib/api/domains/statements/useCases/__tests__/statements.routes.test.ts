/**
 * The conciliação routes behind the farm macro, auth and db mocked: a member
 * who only sees Financeiro may read an import but decides no line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/lib/domain/permissions";

const { state, getSession, resolveLine, getImport } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  resolveLine: vi.fn(),
  getImport: vi.fn(),
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
vi.mock("@/lib/api/domains/statements/useCases/ResolveLine.useCase", () => ({
  ResolveLineUseCase: class {
    run = resolveLine;
  },
}));
vi.mock("@/lib/api/domains/statements/useCases/GetImport.useCase", () => ({
  GetImportUseCase: class {
    run = getImport;
  },
}));

import { herdApi } from "@/lib/api/app";

const call = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];
  resolveLine.mockReset();
  getImport.mockReset();
});

describe("conciliação routes for a member with Financeiro view", () => {
  it("read an import, and a 404 for another farm's", async () => {
    getImport.mockResolvedValue(null);
    const response = await call("GET", "/imports/imp-9");
    expect(response.status).toBe(404);
    expect(getImport).toHaveBeenCalledWith({ farmId: 7, id: "imp-9" });
  });

  it("decide no line", async () => {
    const response = await call("POST", "/statement-lines/l-1/ignore", { reason: "duplicada" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(resolveLine).not.toHaveBeenCalled();
  });
});
