import { describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORIES,
  clashesWithFixedGroup,
  despesaGroups,
  groupLabel,
  isBuiltinCategory,
  isDespesaGroup,
} from "@/lib/domain/groups";
import type { ExpenseGroup } from "@/lib/types";

const group = (overrides: Partial<ExpenseGroup>): ExpenseGroup => ({
  id: "g-1",
  name: "Máquinas e veículos",
  createdAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

const MAQUINAS = group({});
const ARRENDAMENTO = group({ id: "g-2", name: "Arrendamento", createdAt: "2026-09-15T12:00:00.000Z" });
const FRETE = group({
  id: "g-3",
  name: "Frete",
  createdAt: "2026-10-02T12:00:00.000Z",
  archivedAt: "2026-10-03T12:00:00.000Z",
});
const BENS = group({ id: "g-4", name: "Bens de terceiros" }); // same createdAt as MAQUINAS

const BUILTIN_LABELS = ["Nutrição", "Pastagem", "Mão de obra", "Sanidade", "Reprodução", "Administrativo", "Outros"];

describe("BUILTIN_CATEGORIES", () => {
  it("is the seven grupos the app ships with, in screen order", () => {
    expect(BUILTIN_CATEGORIES).toEqual(["nutrition", "pasture", "labor", "health", "breeding", "admin", "other"]);
  });
});

describe("isBuiltinCategory", () => {
  it("is true only for the seven keys", () => {
    expect(BUILTIN_CATEGORIES.every(isBuiltinCategory)).toBe(true);
    expect(isBuiltinCategory("revenue")).toBe(false);
    expect(isBuiltinCategory("g-1")).toBe(false);
  });
});

describe("isDespesaGroup", () => {
  it("takes a built-in key or a farm grupo id", () => {
    expect(isDespesaGroup("health")).toBe(true);
    expect(isDespesaGroup("g-1")).toBe(true);
  });

  it("leaves out Receitas, the three outside the resultado, the tree's Despesas and the ledger's capital", () => {
    for (const key of ["revenue", "investment", "financing", "partners", "expenses", "capital"]) {
      expect(isDespesaGroup(key)).toBe(false);
    }
  });
});

describe("despesaGroups", () => {
  it("lists the seven first, then the farm's by creation, ties by name, archived ones left out", () => {
    const list = despesaGroups([MAQUINAS, FRETE, BENS, ARRENDAMENTO]);
    expect(list.slice(0, 7)).toEqual(
      BUILTIN_CATEGORIES.map((key, i) => ({ key, label: BUILTIN_LABELS[i], custom: false, archived: false }))
    );
    expect(list.slice(7)).toEqual([
      { key: "g-2", label: "Arrendamento", custom: true, archived: false },
      { key: "g-4", label: "Bens de terceiros", custom: true, archived: false },
      { key: "g-1", label: "Máquinas e veículos", custom: true, archived: false },
    ]);
  });

  it("brings the archived ones back when asked", () => {
    expect(despesaGroups([FRETE, MAQUINAS], { archived: true }).slice(7)).toEqual([
      { key: "g-1", label: "Máquinas e veículos", custom: true, archived: false },
      { key: "g-3", label: "Frete", custom: true, archived: true },
    ]);
  });

  it("keeps the archived grupo a lançamento already sits in, and no other", () => {
    const archived = group({ id: "g-5", name: "Cercas", archivedAt: "2026-10-04T12:00:00.000Z" });
    expect(despesaGroups([FRETE, archived], { keep: "g-3" }).slice(7).map((g) => g.key)).toEqual(["g-3"]);
    expect(despesaGroups([FRETE], { keep: "nutrition" })).toHaveLength(7);
  });

  it("is only the seven for a farm without grupos, and leaves the input order alone", () => {
    expect(despesaGroups([])).toHaveLength(7);
    const input = [MAQUINAS, ARRENDAMENTO];
    despesaGroups(input);
    expect(input).toEqual([MAQUINAS, ARRENDAMENTO]);
  });
});

describe("groupLabel", () => {
  it("names a built-in, Receitas and the three outside the resultado", () => {
    expect(groupLabel("nutrition", [])).toBe("Nutrição");
    expect(groupLabel("other", [])).toBe("Outros");
    expect(groupLabel("revenue", [])).toBe("Receitas");
    expect(groupLabel("investment", [])).toBe("Investimentos");
    expect(groupLabel("financing", [])).toBe("Financiamentos");
    expect(groupLabel("partners", [])).toBe("Sócios");
  });

  it("names a farm grupo by its name, archived too", () => {
    expect(groupLabel("g-1", [MAQUINAS, FRETE])).toBe("Máquinas e veículos");
    expect(groupLabel("g-3", [MAQUINAS, FRETE])).toBe("Frete");
  });

  it("reads Grupo removido when the key resolves to nothing", () => {
    expect(groupLabel("g-9", [MAQUINAS])).toBe("Grupo removido");
    expect(groupLabel("g-1", [])).toBe("Grupo removido");
  });
});

describe("clashesWithFixedGroup", () => {
  it("refuses a built-in or top grupo label in any case, spaces around ignored", () => {
    expect(clashesWithFixedGroup("Nutrição")).toBe(true);
    expect(clashesWithFixedGroup("  nutrição ")).toBe(true);
    expect(clashesWithFixedGroup("MÃO DE OBRA")).toBe(true);
    expect(clashesWithFixedGroup("RECEITAS")).toBe(true);
    expect(clashesWithFixedGroup("investimentos")).toBe(true);
    expect(clashesWithFixedGroup("Sócios")).toBe(true);
  });

  it("takes any other name", () => {
    expect(clashesWithFixedGroup("Máquinas e veículos")).toBe(false);
    expect(clashesWithFixedGroup("Nutrição animal")).toBe(false);
  });
});
