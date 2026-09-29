/**
 * The anexo routes behind the farm macro, auth and db mocked: a member who
 * only sees Financeiro may list and open anexos but gets no upload token.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, issue } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  issue: vi.fn(),
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
vi.mock("@/lib/api/domains/attachments/useCases/IssueUploadToken.useCase", () => ({
  IssueUploadTokenUseCase: class {
    run = issue;
  },
}));

import { herdApi } from "@/lib/api/app";

const tokenRequest = () =>
  herdApi.handle(
    new Request("http://localhost/api/herd/attachments/upload-token", {
      method: "POST",
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: { pathname: "farms/7/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.jpg", clientPayload: null, multipart: false },
      }),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  issue.mockReset();
  issue.mockResolvedValue({ clientToken: "vercel_blob_client_x" });
});

describe("upload token", () => {
  it("is refused without Financeiro edit, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    const response = await tokenRequest();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(issue).not.toHaveBeenCalled();
  });

  it("answers in the shape @vercel/blob/client reads", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];

    const response = await tokenRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "blob.generate-client-token",
      clientToken: "vercel_blob_client_x",
    });
    expect(issue).toHaveBeenCalledWith({ farmId: 7, pathname: "farms/7/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.jpg" });
  });
});
