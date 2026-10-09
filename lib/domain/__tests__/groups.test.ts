import { describe, expect, it } from "vitest";
import {
  byGroupName,
  DEFAULT_GROUPS,
  GROUP_KIND_LABEL,
  GROUP_KINDS,
  groupKind,
  groupLabel,
  groupsOf,
} from "@/lib/domain/groups";
import { makePlanGroup as group } from "@/lib/domain/__tests__/fixtures";

const NUTRICAO = group({ id: "g-nut", name: "Nutrição" });
const MAO_DE_OBRA = group({ id: "g-mao", name: "Mão de obra" });
const MAQUINAS = group({ id: "g-maq", name: "Máquinas e veículos" });
const ARRENDAMENTO = group({ id: "g-arr", name: "Arrendamento" });
const FRETE = group({ id: "g-fre", name: "Frete", archivedAt: "2026-10-03T12:00:00.000Z" });
const RECEITAS = group({ id: "g-rec", kind: "revenue", name: "Receitas" });
const PRONAF = group({ id: "g-pro", kind: "financing", name: "Pronaf" });

describe("GROUP_KINDS and GROUP_KIND_LABEL", () => {
  it("lists the five tipos in screen order, each with its label", () => {
    expect(GROUP_KINDS.map((kind) => GROUP_KIND_LABEL[kind])).toEqual([
      "Receitas",
      "Despesas",
      "Investimentos",
      "Financiamentos",
      "Sócios",
    ]);
  });
});

describe("DEFAULT_GROUPS", () => {
  it("is the eleven a farm starts with, every tipo covered, no name twice in any case", () => {
    expect(DEFAULT_GROUPS).toHaveLength(11);
    expect(DEFAULT_GROUPS.filter((g) => g.kind === "expense").map((g) => g.name)).toEqual([
      "Nutrição",
      "Pastagem",
      "Mão de obra",
      "Sanidade",
      "Reprodução",
      "Administrativo",
      "Outros",
    ]);
    expect(new Set(DEFAULT_GROUPS.map((g) => g.kind))).toEqual(new Set(GROUP_KINDS));
    expect(new Set(DEFAULT_GROUPS.map((g) => g.name.toLowerCase())).size).toBe(11);
  });
});

describe("groupsOf", () => {
  const ALL = [NUTRICAO, MAQUINAS, RECEITAS, FRETE, MAO_DE_OBRA, PRONAF, ARRENDAMENTO];

  it("lists the active grupos of one tipo in pt-BR alphabetical order, no grupo special", () => {
    expect(groupsOf(ALL, "expense").map((g) => g.name)).toEqual([
      "Arrendamento",
      "Mão de obra",
      "Máquinas e veículos",
      "Nutrição",
    ]);
    expect(groupsOf(ALL, "revenue")).toEqual([RECEITAS]);
    expect(groupsOf(ALL, "partners")).toEqual([]);
  });

  it("brings the archived ones back when asked", () => {
    expect(groupsOf(ALL, "expense", { archived: true }).map((g) => g.id)).toEqual([
      "g-arr",
      "g-fre",
      "g-mao",
      "g-maq",
      "g-nut",
    ]);
  });

  it("keeps the archived grupo a row already sits in, and no other", () => {
    const cercas = group({ id: "g-cer", name: "Cercas", archivedAt: "2026-10-04T12:00:00.000Z" });
    expect(groupsOf([FRETE, cercas], "expense", { keep: "g-fre" }).map((g) => g.id)).toEqual(["g-fre"]);
    expect(groupsOf([FRETE], "revenue", { keep: "g-fre" })).toEqual([]);
  });

  it("leaves the input order alone", () => {
    const input = [NUTRICAO, ARRENDAMENTO];
    groupsOf(input, "expense");
    expect(input).toEqual([NUTRICAO, ARRENDAMENTO]);
  });
});

describe("byGroupName", () => {
  it("sorts accented names where a pt-BR reader expects them", () => {
    expect([MAQUINAS, NUTRICAO, MAO_DE_OBRA].sort(byGroupName).map((g) => g.name)).toEqual([
      "Mão de obra",
      "Máquinas e veículos",
      "Nutrição",
    ]);
  });
});

describe("groupLabel and groupKind", () => {
  it("name a grupo and its tipo, archived too", () => {
    expect(groupLabel("g-fre", [NUTRICAO, FRETE])).toBe("Frete");
    expect(groupLabel("g-rec", [RECEITAS])).toBe("Receitas");
    expect(groupKind("g-pro", [PRONAF])).toBe("financing");
    expect(groupKind("g-fre", [FRETE])).toBe("expense");
  });

  it("read Grupo removido and null when the id names nothing, an old key included", () => {
    expect(groupLabel("g-9", [NUTRICAO])).toBe("Grupo removido");
    expect(groupLabel("nutrition", [NUTRICAO])).toBe("Grupo removido");
    expect(groupKind("g-9", [NUTRICAO])).toBeNull();
    expect(groupKind("g-nut", [])).toBeNull();
  });
});
