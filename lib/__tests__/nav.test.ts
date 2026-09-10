import { Baby, Fence } from "lucide-react";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute } from "@/lib/nav";

const nascimentos: NavItem = {
  label: "Nascimentos",
  href: "/nascimentos",
  icon: Baby,
  children: [{ label: "Coberturas", href: "/nascimentos/coberturas" }],
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
    expect(activeChild("/nascimentos/coberturas", nascimentos)).toEqual({
      label: "Coberturas",
      href: "/nascimentos/coberturas",
    });
  });

  it("matches a sub-route of the child", () => {
    expect(activeChild("/nascimentos/coberturas/nova", nascimentos)?.href).toBe(
      "/nascimentos/coberturas"
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
  it("lists Coberturas under Nascimentos", () => {
    const item = NAV_ITEMS.find((i) => i.href === "/nascimentos");
    expect(item?.children).toEqual([
      { label: "Coberturas", href: "/nascimentos/coberturas" },
    ]);
  });
});
