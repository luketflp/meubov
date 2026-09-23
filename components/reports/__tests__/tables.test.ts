import { describe, expect, it } from "vitest";
import {
  bankInventoryTable,
  declarationTables,
  flowTable,
  headsLabel,
  technicalBullsTable,
  technicalLotsTable,
  withTotalsRow,
} from "@/components/reports/tables";
import type { BankReport } from "@/lib/reports/bank";
import type { DeclarationFlow, HerdDeclaration } from "@/lib/reports/declaration";
import type { TechnicalReport } from "@/lib/reports/technical";

const FLOW: DeclarationFlow = {
  start: 10,
  births: 3,
  purchases: 2,
  sales: 4,
  deaths: 1,
  others: 0,
  adjustment: 0,
  end: 10,
};

describe("flowTable", () => {
  it("lists the movimentação and ends on the saldo", () => {
    const { table, totals } = flowTable(FLOW, "2026-01-01", "2026-09-22", "Movimentação");
    expect(table.rows).toEqual([
      ["Saldo em 01/01/2026", 10],
      ["+ Nascimentos", 3],
      ["+ Compras", 2],
      ["− Vendas", 4],
      ["− Mortes", 1],
      ["− Outras baixas", 0],
    ]);
    expect(totals).toEqual(["= Saldo em 22/09/2026", 10]);
  });

  it("adds the ajuste line only when it is not zero", () => {
    const { table } = flowTable({ ...FLOW, adjustment: -2, end: 8 }, "2026-01-01", "2026-09-22", "M");
    expect(table.rows.at(-1)).toEqual(["± Ajuste (cadastros sem entrada)", -2]);
  });
});

describe("declarationTables", () => {
  it("totals the bands and the categories by sex", () => {
    const declaration: HerdDeclaration = {
      baseDate: "2026-09-22",
      since: "2026-01-01",
      bands: [
        { label: "0 a 12 meses", males: 2, females: 3 },
        { label: "Acima de 36 meses", males: 1, females: 4 },
      ],
      byCategory: [
        { category: "calf", males: 2, females: 3 },
        { category: "cow", males: 0, females: 4 },
      ],
      flow: FLOW,
      undated: 0,
    };
    const { bands, categories } = declarationTables(declaration);
    expect(bands.table.rows[0]).toEqual(["0 a 12 meses", 2, 3, 5]);
    expect(bands.totals).toEqual(["Total", 3, 7, 10]);
    expect(categories.table.rows.map((r) => r[0])).toEqual(["Bezerros", "Vacas"]);
  });
});

describe("bankInventoryTable", () => {
  it("prices only the unweighed and averages the weighed heads", () => {
    const report: BankReport = {
      rows: [
        { category: "cow", heads: 3, weighed: 2, avgKg: 450, arrobas: 30, unweighed: 1, headPrice: 4000, valueBrl: 13000 },
        { category: "steer", heads: 2, weighed: 2, avgKg: 500, arrobas: 34, unweighed: 0, headPrice: 9, valueBrl: 10200 },
      ],
      totals: { heads: 5, weighed: 4, liveKg: 1900, arrobas: 64, valueBrl: 23200 },
      flow: FLOW,
      lots: [],
    };
    const { table, totals } = bankInventoryTable(report);
    expect(table.rows[0][6]).toBe(4000);
    expect(table.rows[1][6]).toBeNull();
    expect(totals).toEqual(["Total", 5, 4, 475, 64, 1, null, 23200]);
  });
});

const TECH: TechnicalReport = {
  season: { exposed: 0, diagnosed: 0, pregnant: 0, open: 0, awaiting: 0, ratePct: null },
  byBull: [
    { name: "Estopim", type: "IATF", covered: 10, diagnosed: 10, pregnant: 7, ratePct: 70 },
    { name: "Repasse", type: "Monta natural", covered: 6, diagnosed: 5, pregnant: 5, ratePct: 100 },
  ],
  calvings: { expected: 0, born: 0, next30: 0, overdue: 0 },
  lots: [
    { lotName: "A", weighed: 3, startKg: 200, endKg: 260, days: 100, adg: 0.6 },
    { lotName: "B", weighed: 1, startKg: 300, endKg: 340, days: 100, adg: 0.4 },
  ],
  sanitary: [],
};

describe("technical tables", () => {
  it("totals the bulls with the overall rate", () => {
    expect(technicalBullsTable(TECH).totals).toEqual(["Total", "", 16, 15, 12, 80]);
  });

  it("weights the herd GMD by the animals weighed", () => {
    const totals = technicalLotsTable(TECH).totals ?? [];
    expect(totals[1]).toBe(4);
    expect(totals[5]).toBeCloseTo(0.55);
  });
});

describe("withTotalsRow", () => {
  it("appends the totals as a last row", () => {
    const totaled = flowTable(FLOW, "2026-01-01", "2026-09-22", "M");
    const table = withTotalsRow(totaled);
    expect(table.rows).toHaveLength(totaled.table.rows.length + 1);
    expect(table.rows.at(-1)).toEqual(["= Saldo em 22/09/2026", 10]);
  });
});

describe("headsLabel", () => {
  it("agrees with the count", () => {
    expect(headsLabel(1)).toBe("1 cabeça");
    expect(headsLabel(24)).toBe("24 cabeças");
  });
});
