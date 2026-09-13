/**
 * The permission each herd API route asks for. Task 10 adds the completeness
 * check against the mounted app; this file starts with the pure rules.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import { herdApi } from "@/lib/api/app";
import { FLOORS, FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import {
  ROUTE_REQUIREMENTS,
  SESSION_ONLY_ROUTES,
  checkRequirement,
  routeKey,
} from "@/lib/api/permissions/routeRequirements";

describe("routeKey", () => {
  it("drops the trailing slash of a prefixed root route", () => {
    expect(routeKey("get", "/api/herd/")).toBe("GET /api/herd");
  });

  it("keeps any other path as it is", () => {
    expect(routeKey("POST", "/api/herd/manejo/:id/close")).toBe("POST /api/herd/manejo/:id/close");
  });
});

describe("checkRequirement", () => {
  it("lets any member read", () => {
    expect(checkRequirement({ read: true }, FLOORS)).toEqual({ ok: true });
  });

  it("checks a view requirement", () => {
    expect(checkRequirement({ view: "team" }, PRESETS.consultor)).toEqual({ ok: false, area: "team" });
    expect(checkRequirement({ view: "team" }, FULL_PERMISSIONS)).toEqual({ ok: true });
  });

  it("names the first area short of edit", () => {
    expect(
      checkRequirement({ edit: ["herd", "lots"] }, { ...PRESETS.vaqueiro, lots: "view" })
    ).toEqual({ ok: false, area: "lots" });
  });

  it("refuses a route with no requirement", () => {
    expect(checkRequirement(undefined, FULL_PERMISSIONS)).toEqual({ ok: false, area: null });
  });
});

describe("ROUTE_REQUIREMENTS", () => {
  it("keeps reads open and writes behind their area", () => {
    expect(ROUTE_REQUIREMENTS["GET /api/herd"]).toEqual({ read: true });
    expect(ROUTE_REQUIREMENTS["POST /api/herd/animals/import"]).toEqual({ edit: ["herd", "lots"] });
    expect(ROUTE_REQUIREMENTS["POST /api/herd/manejo/:id/carcass-yield"]).toEqual({
      edit: ["manejo", "finance"],
    });
    expect(ROUTE_REQUIREMENTS["PUT /api/herd/farm/headquarters"]).toEqual({ edit: ["lots"] });
    expect(ROUTE_REQUIREMENTS["GET /api/herd/farm/team"]).toEqual({ view: "team" });
  });

  it("asks Financeiro for what writes a semen purchase, and Reprodução for the bull", () => {
    expect(ROUTE_REQUIREMENTS["POST /api/herd/semen-bulls"]).toEqual({ edit: ["reproduction"] });
    expect(ROUTE_REQUIREMENTS["POST /api/herd/semen-bulls/:id/purchases"]).toEqual({
      edit: ["reproduction", "finance"],
    });
    expect(
      ROUTE_REQUIREMENTS["DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId"]
    ).toEqual({ edit: ["reproduction", "finance"] });
  });
});

describe("ROUTE_REQUIREMENTS against the mounted app", () => {
  const mounted = (herdApi as unknown as { routes: { method: string; path: string }[] }).routes.map(
    (route) => routeKey(route.method, route.path)
  );

  it("names a requirement for every farm-scoped route and for nothing else", () => {
    const farmScoped = mounted.filter((key) => !SESSION_ONLY_ROUTES.includes(key)).sort();
    expect(Object.keys(ROUTE_REQUIREMENTS).sort()).toEqual(farmScoped);
  });

  it("lists only session routes that exist", () => {
    for (const key of SESSION_ONLY_ROUTES) expect(mounted).toContain(key);
  });

  it("is pinned", () => {
    expect(ROUTE_REQUIREMENTS).toMatchSnapshot();
  });
});
