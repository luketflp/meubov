/**
 * farmPlugin resolution: membership scoping plus the SUPERUSER_EMAILS bypass.
 *
 * The db mock is a chainable select stub: `from()` captures the table, and
 * `limit()` resolves with the farm_users or farm fixture depending on which
 * table the query targeted (farm_users is recognized by its userId column).
 */
import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, getSession, ensureFarmForUser } = vi.hoisted(() => ({
  state: {
    farmUsersRows: [] as Record<string, unknown>[],
    farmRows: [] as Record<string, unknown>[],
  },
  getSession: vi.fn(),
  ensureFarmForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/api/services/onboarding", () => ({ ensureFarmForUser }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      let table: Record<string, unknown> | undefined;
      const builder = {
        from(t: Record<string, unknown>) {
          table = t;
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit() {
          return Promise.resolve(
            table && "userId" in table ? state.farmUsersRows : state.farmRows
          );
        },
      };
      return builder;
    },
  },
}));

import { farmPlugin } from "@/lib/api/plugins/farm";

const SUPER_EMAIL = "super@meubov.test";
const app = new Elysia()
  .use(farmPlugin)
  .get(
    "/whoami",
    ({ user, farmId, farmRole, superuser }) => ({
      userId: user.id,
      farmId,
      farmRole,
      superuser,
    }),
    { farm: true }
  );

const whoami = (headers: Record<string, string> = {}) =>
  app.handle(new Request("http://localhost/whoami", { headers }));

function signIn(email: string) {
  getSession.mockResolvedValue({ user: { id: "user-1", email } });
}

describe("farmPlugin", () => {
  beforeEach(() => {
    vi.stubEnv("SUPERUSER_EMAILS", SUPER_EMAIL);
    state.farmUsersRows = [];
    state.farmRows = [];
    getSession.mockReset();
    ensureFarmForUser.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    const response = await whoami();
    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-integer x-farm-id", async () => {
    signIn(SUPER_EMAIL);
    const response = await whoami({ "x-farm-id": "abc" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_farm_id" });
  });

  it("keeps membership access working with a header (regression)", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member" }];
    const response = await whoami({ "x-farm-id": "7" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 7,
      farmRole: "member",
      superuser: false,
    });
  });

  it("returns 403 for a non-superuser without membership", async () => {
    signIn("user@meubov.test");
    state.farmRows = [{ id: 7 }];
    const response = await whoami({ "x-farm-id": "7" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_a_member" });
  });

  it("grants a superuser owner access to an existing farm without membership", async () => {
    signIn(SUPER_EMAIL);
    state.farmRows = [{ id: 42 }];
    const response = await whoami({ "x-farm-id": "42" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 42,
      farmRole: "owner",
      superuser: true,
    });
  });

  it("returns 404 for a superuser targeting a nonexistent farm", async () => {
    signIn(SUPER_EMAIL);
    const response = await whoami({ "x-farm-id": "999" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "farm_not_found" });
  });

  it("prefers the superuser's own membership when no header is sent", async () => {
    signIn(SUPER_EMAIL);
    state.farmUsersRows = [{ farmId: 7, role: "member" }];
    state.farmRows = [{ id: 1 }];
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 7,
      farmRole: "member",
      superuser: true,
    });
    expect(ensureFarmForUser).not.toHaveBeenCalled();
  });

  it("falls back to the first farm for a superuser with no membership", async () => {
    signIn(SUPER_EMAIL);
    state.farmRows = [{ id: 3 }];
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 3,
      farmRole: "owner",
      superuser: true,
    });
    expect(ensureFarmForUser).not.toHaveBeenCalled();
  });

  it("lazily creates a farm for a superuser when the database has none", async () => {
    signIn(SUPER_EMAIL);
    ensureFarmForUser.mockResolvedValue(99);
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 99,
      farmRole: "owner",
      superuser: true,
    });
    expect(ensureFarmForUser).toHaveBeenCalledWith("user-1");
  });
});
