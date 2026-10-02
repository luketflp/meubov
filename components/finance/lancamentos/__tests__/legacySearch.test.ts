import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/types";
import { legacyNode, nodeParam, type PlanInputs } from "@/lib/domain/planTree";
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

  it("turns grupo=capital and tipo=treatment into the nó legacyNode picks", () => {
    // planTree.test pins which nó each one is; here, that the redirect carries it.
    for (const old of [{ grupo: "capital" }, { tipo: "treatment" }]) {
      const node = legacyNode(old);
      expect(node).not.toBeNull();
      expect(query(old)).toEqual({ conta: nodeParam(node!) });
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

const sal: Account = { id: "acc-1", group: "nutrition", name: "Sal mineral" };
const inputs: PlanInputs = {
  expenses: [],
  accounts: [sal],
  movements: [],
  manejoSessions: [],
  animals: [],
  treatments: [],
  lots: [],
  bankAccounts: [],
  transfers: [],
};
const period = { start: "2025-10-01", end: "2026-09-30" };
const TODAY = "2026-09-30";

describe("resolveNode", () => {
  it("falls back to todos when conta is absent, malformed or gone", () => {
    for (const param of [null, "", "nope", "banco:", "grupo:nope", "conta:deleted"]) {
      const resolved = resolveNode(param, inputs, period, TODAY);
      expect(resolved.picked).toBeNull();
      expect(resolved.node).toEqual({ type: "all" });
      expect(resolved.summary.figures).toHaveLength(4);
    }
  });

  it("picks a group and a conta that exist", () => {
    expect(resolveNode("despesas", inputs, period, TODAY).picked).toEqual({ type: "group", group: "expenses" });
    const conta = resolveNode("conta:acc-1", inputs, period, TODAY);
    expect(conta.picked).toEqual({ type: "account", id: "acc-1" });
    expect(conta.node).toEqual({ type: "account", id: "acc-1" });
    expect(conta.summary.title).toBe("Sal mineral");
  });
});
