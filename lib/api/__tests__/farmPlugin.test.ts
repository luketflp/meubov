/**
 * farmPlugin resolution: membership scoping, the SUPERUSER_EMAILS bypass, the
 * route's permission requirement and the pending-convite stop.
 *
 * The db mock is a chainable select stub: `from()` captures the table, and
 * `limit()` resolves with the farm_invites, farm_users or farm fixture
 * depending on which table the query targeted (recognized by a column only
 * that table has). The test app mounts under /api/herd so its routes hit real
 * keys of ROUTE_REQUIREMENTS.
 */
import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, ensureFarmForUser } = vi.hoisted(() => ({
  state: {
    farmUsersRows: [] as Record<string, unknown>[],
    farmRows: [] as Record<string, unknown>[],
    inviteRows: [] as Record<string, unknown>[],
  },
  getSession: vi.fn(),
  ensureFarmForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/api/domains/farm/useCases/EnsureForUser.useCase", () => ({
  EnsureFarmForUserUseCase: class {
    run = ({ userId }: { userId: string }) => ensureFarmForUser(userId);
  },
}));
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
          if (table && "expiresAt" in table) return Promise.resolve(state.inviteRows);
          if (table && "userId" in table) return Promise.resolve(state.farmUsersRows);
          return Promise.resolve(state.farmRows);
        },
      };
      return builder;
    },
  },
}));

import { farmPlugin } from "@/lib/api/plugins/farm";

const SUPER_EMAIL = "super@meubov.test";
const app = new Elysia({ prefix: "/api/herd" })
  .use(farmPlugin)
  .get(
    "/health",
    ({ user, farmId, farmRole, superuser }) => ({
      userId: user.id,
      farmId,
      farmRole,
      superuser,
    }),
    { farm: true }
  )
  .get("/farms", ({ preset, permissions }) => ({ preset, permissions }), { farm: true })
  .post("/animals", () => ({ ok: true }), { farm: true })
  .get("/unlisted", () => ({ ok: true }), { farm: true });

const call = (path: string, init: RequestInit = {}) =>
  app.handle(new Request(`http://localhost/api/herd${path}`, init));

const whoami = (headers: Record<string, string> = {}) => call("/health", { headers });

function signIn(email: string) {
  getSession.mockResolvedValue({ user: { id: "user-1", email } });
}

describe("farmPlugin", () => {
  beforeEach(() => {
    vi.stubEnv("SUPERUSER_EMAILS", SUPER_EMAIL);
    state.farmUsersRows = [];
    state.farmRows = [];
    state.inviteRows = [];
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
    state.farmUsersRows = [{ role: "member", preset: null, permissions: null }];
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
    state.farmUsersRows = [{ farmId: 7, role: "member", preset: null, permissions: null }];
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

  it("lazily creates a farm for a user with no membership and no convite", async () => {
    signIn("user@meubov.test");
    ensureFarmForUser.mockResolvedValue(12);
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 12,
      farmRole: "owner",
      superuser: false,
    });
  });

  it("stops a user with a pending convite before any farm is created", async () => {
    signIn("user@meubov.test");
    state.inviteRows = [{ id: 5 }];
    const response = await whoami();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "pending_invites" });
    expect(ensureFarmForUser).not.toHaveBeenCalled();
  });

  it("puts a member's stored preset and levels on the context", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: "consultor", permissions: PRESETS.consultor }];
    const response = await call("/farms", { headers: { "x-farm-id": "7" } });
    expect(await response.json()).toEqual({ preset: "consultor", permissions: PRESETS.consultor });
  });

  it("gives the Dono every area", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "owner", preset: null, permissions: null }];
    const response = await call("/farms", { headers: { "x-farm-id": "7" } });
    expect(await response.json()).toEqual({ preset: null, permissions: FULL_PERMISSIONS });
  });

  it("refuses an edit route to a member below its level", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: "consultor", permissions: PRESETS.consultor }];
    const response = await call("/animals", { method: "POST", headers: { "x-farm-id": "7" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "herd" });
  });

  it("lets a member with the level through", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: "vaqueiro", permissions: PRESETS.vaqueiro }];
    const response = await call("/animals", { method: "POST", headers: { "x-farm-id": "7" } });
    expect(response.status).toBe(200);
  });

  it("refuses a route missing from the requirements table", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "owner", preset: null, permissions: null }];
    const response = await call("/unlisted", { headers: { "x-farm-id": "7" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: null });
  });
});
