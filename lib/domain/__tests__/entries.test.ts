import { describe, expect, it } from "vitest";
import {
  CAPITAL_GROUPS,
  ENTRY_KIND_LABEL,
  entryFlow,
  entryGroup,
  FLOW_LABEL,
  isCapitalKind,
  isCost,
  isInflow,
  isRevenue,
  mayPayFrom,
} from "@/lib/domain/entries";
import type { BankAccountKind, EntryFlow, EntryKind } from "@/lib/types";

const KINDS: EntryKind[] = ["expense", "revenue", "investment", "financing", "partners", "yield"];

describe("entryFlow and isInflow", () => {
  it("sends a despesa out and brings a receita and a rendimento in", () => {
    expect(entryFlow({ kind: "expense" })).toBe("out");
    expect(entryFlow({ kind: "revenue" })).toBe("in");
    expect(entryFlow({ kind: "yield" })).toBe("in");
  });

  it("follows the flow of an investimento, a financiamento and sócios", () => {
    for (const kind of CAPITAL_GROUPS) {
      expect(entryFlow({ kind, flow: "in" })).toBe("in");
      expect(entryFlow({ kind, flow: "out" })).toBe("out");
    }
  });

  it("takes a capital row without flow as out", () => {
    for (const kind of CAPITAL_GROUPS) {
      expect(entryFlow({ kind })).toBe("out");
      expect(entryFlow({ kind, flow: null })).toBe("out");
    }
  });

  it("ignores a flow on a despesa, a receita or a rendimento", () => {
    expect(entryFlow({ kind: "expense", flow: "in" })).toBe("out");
    expect(entryFlow({ kind: "revenue", flow: "out" })).toBe("in");
    expect(entryFlow({ kind: "yield", flow: "out" })).toBe("in");
  });

  it("says in exactly when the flow is in", () => {
    expect(KINDS.filter((kind) => isInflow({ kind, flow: "in" }))).toEqual([
      "revenue",
      "investment",
      "financing",
      "partners",
      "yield",
    ]);
    expect(KINDS.filter((kind) => isInflow({ kind }))).toEqual(["revenue", "yield"]);
  });
});

describe("isCost, isRevenue and isCapitalKind", () => {
  it("counts only a despesa as custo and only a receita as receita", () => {
    expect(KINDS.filter((kind) => isCost({ kind }))).toEqual(["expense"]);
    expect(KINDS.filter((kind) => isRevenue({ kind }))).toEqual(["revenue"]);
  });

  it("knows the three kinds outside the resultado that hold contas", () => {
    expect(CAPITAL_GROUPS).toEqual(["investment", "financing", "partners"]);
    expect(KINDS.filter(isCapitalKind)).toEqual(["investment", "financing", "partners"]);
  });
});

describe("entryGroup", () => {
  it("puts every kind but a rendimento in the grupo it carries", () => {
    expect(entryGroup({ kind: "expense", category: "g-nut" })).toBe("g-nut");
    expect(entryGroup({ kind: "revenue", category: "g-rec" })).toBe("g-rec");
    expect(entryGroup({ kind: "financing", category: "g-pro" })).toBe("g-pro");
  });

  it("gives a rendimento no grupo", () => {
    expect(entryGroup({ kind: "yield" })).toBeNull();
  });
});

describe("labels", () => {
  it("names each kind", () => {
    expect(KINDS.map((kind) => ENTRY_KIND_LABEL[kind])).toEqual([
      "Despesa",
      "Receita",
      "Investimento",
      "Financiamento",
      "Sócios",
      "Rendimento",
    ]);
  });

  it("names each movimento", () => {
    expect(FLOW_LABEL).toEqual({
      investment: { out: "Compra", in: "Venda do bem" },
      financing: { out: "Pagamento", in: "Liberação" },
      partners: { out: "Retirada", in: "Aporte" },
    });
  });
});

describe("mayPayFrom", () => {
  /** Every kind with each flow it can carry: capital kinds both ways and without flow. */
  const CASES: [EntryKind, EntryFlow | undefined][] = [
    ["expense", undefined],
    ["revenue", undefined],
    ["investment", "out"],
    ["investment", "in"],
    ["investment", undefined],
    ["financing", "out"],
    ["financing", "in"],
    ["partners", "out"],
    ["partners", "in"],
    ["yield", undefined],
  ];
  const allowed = (bank: BankAccountKind) =>
    CASES.filter(([kind, flow]) => mayPayFrom(bank, kind, flow)).map(([kind, flow]) =>
      flow ? `${kind}:${flow}` : kind
    );

  it("lets a conta corrente and the caixa take everything but a rendimento", () => {
    const all = CASES.filter(([kind]) => kind !== "yield").map(([kind, flow]) => (flow ? `${kind}:${flow}` : kind));
    expect(allowed("checking")).toEqual(all);
    expect(allowed("cash")).toEqual(all);
  });

  it("lets a cartão pay a despesa or the compra of an investimento, nothing else", () => {
    expect(allowed("card")).toEqual(["expense", "investment:out", "investment"]);
  });

  it("lets an aplicação take only its rendimento", () => {
    expect(allowed("investment")).toEqual(["yield"]);
  });

  it("reads a null flow as out", () => {
    expect(mayPayFrom("card", "investment", null)).toBe(true);
    expect(mayPayFrom("card", "partners", null)).toBe(false);
  });
});
