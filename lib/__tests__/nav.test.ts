import { Baby, Dna, Fence } from "lucide-react";
import { describe, expect, it } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute, visibleNav } from "@/lib/nav";

const nascimentos: NavItem = {
  label: "Nascimentos",
  href: "/nascimentos",
  icon: Baby,
  children: [{ label: "Reprodução", href: "/nascimentos/reproducao", icon: Dna }],
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
    expect(activeChild("/nascimentos/reproducao", nascimentos)).toEqual({
      label: "Reprodução",
      href: "/nascimentos/reproducao",
      icon: Dna,
    });
  });

  it("matches a sub-route of the child", () => {
    expect(activeChild("/nascimentos/reproducao/nova", nascimentos)?.href).toBe(
      "/nascimentos/reproducao"
    );
  });

  it("returns null on the parent's own route", () => {
    expect(activeChild("/nascimentos", nascimentos)).toBeNull();
  });

  it("returns null for an item without children", () => {
    expect(activeChild("/lots", lots)).toBeNull();
  });

  it("returns null when neither the parent nor a child matches", () => {
    expect(activeChild("/herd", nascimentos)).toBeNull();
  });
});

describe("NAV_ITEMS", () => {
  it("lists Reprodução under Nascimentos, with its own icon", () => {
    const item = NAV_ITEMS.find((i) => i.href === "/nascimentos");
    expect(item?.children).toEqual([
      { label: "Reprodução", href: "/nascimentos/reproducao", icon: Dna },
    ]);
  });
});

describe("visibleNav", () => {
  it("shows every item and Equipe to the Dono", () => {
    const items = visibleNav(NAV_ITEMS, FULL_PERMISSIONS);
    expect(items.map((item) => item.href)).toEqual(NAV_ITEMS.map((item) => item.href));
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
    ]);
  });

  it("hides Financeiro and Equipe from a vaqueiro", () => {
    const items = visibleNav(NAV_ITEMS, PRESETS.vaqueiro);
    expect(items.map((item) => item.href)).not.toContain("/finance");
    expect(items.find((item) => item.href === "/settings")?.children).toBeUndefined();
  });

  it("keeps Financeiro for a consultor, who sees values", () => {
    expect(visibleNav(NAV_ITEMS, PRESETS.consultor).map((item) => item.href)).toContain("/finance");
  });

  it("leaves children of an open area alone", () => {
    expect(
      visibleNav(NAV_ITEMS, PRESETS.consultor).find((item) => item.href === "/nascimentos")?.children
    ).toEqual([{ label: "Reprodução", href: "/nascimentos/reproducao", icon: Dna }]);
  });
});
