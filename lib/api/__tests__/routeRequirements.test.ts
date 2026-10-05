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

  it("keeps lançamentos and the plano de contas behind Financeiro edit", () => {
    for (const key of [
      "PATCH /api/herd/expenses/:id",
      "POST /api/herd/expenses/:id/split",
      "POST /api/herd/accounts",
      "PATCH /api/herd/accounts/:id",
      "DELETE /api/herd/accounts/:id",
      "POST /api/herd/accounts/defaults",
      "POST /api/herd/expense-groups",
      "PATCH /api/herd/expense-groups/:id",
      "DELETE /api/herd/expense-groups/:id",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });

  it("keeps contas bancárias, transferências and the conta of a venda behind Financeiro edit", () => {
    for (const key of [
      "POST /api/herd/bank-accounts",
      "PATCH /api/herd/bank-accounts/:id",
      "DELETE /api/herd/bank-accounts/:id",
      "POST /api/herd/bank-accounts/:id/archive",
      "POST /api/herd/transfers",
      "PATCH /api/herd/transfers/:id",
      "DELETE /api/herd/transfers/:id",
      "PATCH /api/herd/movements/:id/bank-account",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });

  it("lets Financeiro view read an extrato and keeps every decision on it behind Financeiro edit", () => {
    expect(ROUTE_REQUIREMENTS["GET /api/herd/imports/:id"]).toEqual({ view: "finance" });
    for (const key of [
      "POST /api/herd/bank-accounts/:id/imports",
      "POST /api/herd/imports/:id/confirm-high",
      "POST /api/herd/statement-lines/:id/match",
      "POST /api/herd/statement-lines/:id/create",
      "POST /api/herd/statement-lines/:id/transfer",
      "POST /api/herd/statement-lines/:id/ignore",
      "POST /api/herd/statement-lines/:id/undo",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });

  it("lets Financeiro view read anexos and keeps their writes behind Financeiro edit", () => {
    for (const key of [
      "GET /api/herd/attachments/status",
      "GET /api/herd/attachments/:id",
      "GET /api/herd/expenses/:id/attachments",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ view: "finance" });
    }
    for (const key of [
      "POST /api/herd/attachments/upload-token",
      "DELETE /api/herd/attachments/:id",
      "POST /api/herd/expenses/:id/attachments",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
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
