import { describe, expect, it } from "vitest";
import type { Account, PlanGroup } from "@/lib/types";
import type { PlanInputs } from "@/lib/domain/planTree";
import { legacySearch, resolveNode } from "@/components/finance/lancamentos/legacySearch";

const query = (old: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(new URLSearchParams(legacySearch(old)));

describe("legacySearch", () => {
  it("keeps the window, the search and the lote, and drops the page", () => {
    expect(query({ de: "2025-10-01", ate: "2026-09-30", q: "nutron", lote: "lot-1", pagina: "3" })).toEqual({
      de: "2025-10-01",
      ate: "2026-09-30",
      q: "nutron",
      lote: "lot-1",
    });
  });

  it("turns a pending status into pendentes and drops the others", () => {
    for (const status of ["payable", "receivable", "overdue"]) {
      expect(query({ status })).toEqual({ status: "pendentes" });
    }
    for (const status of ["settled", "all", "nope"]) {
      expect(query({ status })).toEqual({});
    }
  });

  it("turns an old conta do plano into its nó", () => {
    expect(query({ conta: "acc-1" })).toEqual({ conta: "conta:acc-1" });
  });

  it("turns an old tipo into its tipo or automatic line", () => {
    expect(query({ tipo: "expense" })).toEqual({ conta: "despesas" });
    expect(query({ tipo: "revenue" })).toEqual({ conta: "receitas" });
    expect(query({ tipo: "sale" })).toEqual({ conta: "venda-de-gado" });
    expect(query({ tipo: "purchase" })).toEqual({ conta: "compra-de-gado" });
  });

  it("drops the old grupo keys and tipo=treatment: they name nothing now", () => {
    for (const old of [{ grupo: "capital" }, { grupo: "nutrition" }, { grupo: "revenue" }, { tipo: "treatment" }]) {
      expect(query(old)).toEqual({});
    }
  });

  it("leaves the nó out for unknown values and gives nothing for an empty query", () => {
    expect(query({ tipo: "nope", grupo: "nope" })).toEqual({});
    expect(legacySearch({})).toBe("");
  });

  it("reads the first value of a repeated key", () => {
    expect(query({ q: ["boi", "vaca"] })).toEqual({ q: "boi" });
  });
});

const NUTRICAO: PlanGroup = { id: "grp-nutricao", kind: "expense", name: "Nutrição", createdAt: "2026-01-01T00:00:00.000Z" };
const sal: Account = { id: "acc-1", group: NUTRICAO.id, name: "Sal mineral" };
const inputs: PlanInputs = {
  expenses: [],
  accounts: [sal],
  movements: [],
  manejoSessions: [],
  animals: [],
  lots: [],
  bankAccounts: [],
  transfers: [],
  planGroups: [NUTRICAO],
};
const period = { start: "2025-10-01", end: "2026-09-30" };
const TODAY = "2026-09-30";

describe("resolveNode", () => {
  it("falls back to todos when conta is absent, malformed or gone", () => {
    for (const param of [null, "", "nope", "banco:", "grupo:", "conta:deleted"]) {
      const resolved = resolveNode(param, inputs, period, TODAY);
      expect(resolved.picked).toBeNull();
      expect(resolved.node).toEqual({ type: "all" });
      expect(resolved.summary.figures).toHaveLength(4);
    }
  });

  it("picks a tipo, a grupo and a conta that exist", () => {
    expect(resolveNode("despesas", inputs, period, TODAY).picked).toEqual({ type: "kind", kind: "expense" });
    const grupo = resolveNode(`grupo:${NUTRICAO.id}`, inputs, period, TODAY);
    expect(grupo.picked).toEqual({ type: "group", id: NUTRICAO.id });
    expect(grupo.summary).toMatchObject({ crumb: "Despesas", title: "Nutrição" });
    const conta = resolveNode("conta:acc-1", inputs, period, TODAY);
    expect(conta.picked).toEqual({ type: "account", id: "acc-1" });
    expect(conta.node).toEqual({ type: "account", id: "acc-1" });
    expect(conta.summary.title).toBe("Sal mineral");
  });

  it("opens a grupo id that names no grupo as an empty Grupo removido", () => {
    const gone = resolveNode("grupo:nope", inputs, period, TODAY);
    expect(gone.picked).toEqual({ type: "group", id: "nope" });
    expect(gone.summary.title).toBe("Grupo removido");
  });
});
