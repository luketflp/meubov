import { Dna, Fence, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute, visibleNav } from "@/lib/nav";

const settings: NavItem = {
  label: "Configurações",
  href: "/settings",
  icon: Settings,
  children: [{ label: "Equipe", href: "/settings/equipe", area: "team" }],
};

const lots: NavItem = { label: "Lotes", href: "/lots", icon: Fence };

describe("isActiveRoute", () => {
  it("matches the exact route", () => {
    expect(isActiveRoute("/herd", "/herd")).toBe(true);
  });

  it("matches a sub-route", () => {
    expect(isActiveRoute("/herd/123", "/herd")).toBe(true);
  });

  it("ignores a route that only shares a prefix", () => {
    expect(isActiveRoute("/herdsman", "/herd")).toBe(false);
  });

  it("ignores an unrelated route", () => {
    expect(isActiveRoute("/lots", "/herd")).toBe(false);
  });
});

describe("activeChild", () => {
  it("returns the child whose route matches", () => {
    expect(activeChild("/settings/equipe", settings)).toEqual({
      label: "Equipe",
      href: "/settings/equipe",
      area: "team",
    });
  });

  it("matches a sub-route of the child", () => {
    expect(activeChild("/settings/equipe/convite", settings)?.href).toBe("/settings/equipe");
  });

  it("returns null on the parent's own route", () => {
    expect(activeChild("/settings", settings)).toBeNull();
  });

  it("returns null for an item without children", () => {
    expect(activeChild("/lots", lots)).toBeNull();
  });

  it("returns null when neither the parent nor a child matches", () => {
    expect(activeChild("/herd", settings)).toBeNull();
  });
});

describe("NAV_ITEMS", () => {
  it("lists Reprodução as an item of its own, right after Nascimentos", () => {
    const index = NAV_ITEMS.findIndex((i) => i.href === "/nascimentos");
    expect(NAV_ITEMS[index]?.children).toBeUndefined();
    expect(NAV_ITEMS[index + 1]).toEqual({ label: "Reprodução", href: "/reproducao", icon: Dna });
  });
});

describe("visibleNav", () => {
  it("shows every item, Equipe and Plano de contas to the Dono", () => {
    const items = visibleNav(NAV_ITEMS, FULL_PERMISSIONS);
    expect(items.map((item) => item.href)).toEqual(NAV_ITEMS.map((item) => item.href));
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
      { label: "Plano de contas", href: "/settings/plano-de-contas", area: "finance" },
    ]);
  });

  it("hides Financeiro and Equipe from a vaqueiro", () => {
    const items = visibleNav(NAV_ITEMS, PRESETS.vaqueiro);
    expect(items.map((item) => item.href)).not.toContain("/finance");
    // Fazendas belongs to the account, not to the open farm: nobody is gated out.
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Fazendas", href: "/settings/fazendas" },
    ]);
  });

  it("keeps Financeiro and Plano de contas for a consultor, who sees values", () => {
    const items = visibleNav(NAV_ITEMS, PRESETS.consultor);
    expect(items.map((item) => item.href)).toContain("/finance");
    expect(items.find((item) => item.href === "/settings")?.children?.map((c) => c.href)).toContain(
      "/settings/plano-de-contas"
    );
  });

  it("leaves an item without an area alone", () => {
    expect(visibleNav(NAV_ITEMS, PRESETS.vaqueiro).map((item) => item.href)).toContain("/reproducao");
  });
});
