/**
 * The contas bancárias routes behind the farm macro, auth and db mocked: a
 * member who only sees Financeiro writes nothing, and another farm's conta is
 * a 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, archive } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  archive: vi.fn(),
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
vi.mock("@/lib/api/domains/bankAccounts/useCases/ArchiveBankAccount.useCase", () => ({
  ArchiveBankAccountUseCase: class {
    run = archive;
  },
}));

import { herdApi } from "@/lib/api/app";

const archiveRequest = () =>
  herdApi.handle(
    new Request("http://localhost/api/herd/bank-accounts/b-9/archive", {
      method: "POST",
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  archive.mockReset();
});

describe("contas bancárias routes", () => {
  it("refuse a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];
    const response = await archiveRequest();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(archive).not.toHaveBeenCalled();
  });

  it("answer 404 for a conta of another farm", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    archive.mockResolvedValue(null);
    const response = await archiveRequest();
    expect(response.status).toBe(404);
    expect(archive).toHaveBeenCalledWith({ farmId: 7, id: "b-9", archived: true });
  });
});
