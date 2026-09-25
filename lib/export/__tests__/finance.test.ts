import { describe, expect, it } from "vitest";
import {
  expensesExportTable,
  indicatorsExportTable,
  ledgerExportTable,
  lotsEconomicsExportTable,
} from "@/lib/export/datasets/finance";
import { withoutMoney } from "@/lib/export/table";
import type { Indicators } from "@/lib/domain/economics";
import type { LedgerRow } from "@/lib/domain/ledger";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import type { Expense } from "@/lib/types";

describe("expensesExportTable", () => {
  it("writes every despesa newest first, value as money", () => {
    const expenses: Expense[] = [
      { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 1200.5, notes: "Sal mineral" },
      { id: "e2", kind: "expense", date: "2026-08-10", category: "labor", amountBrl: 3000 },
    ];
    const table = expensesExportTable(expenses);
    expect(table.title).toBe("Despesas");
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Data", "date"],
      ["Categoria", undefined],
      ["Descrição", undefined],
      ["Valor (R$)", "money"],
    ]);
    expect(table.rows).toEqual([
      ["2026-08-10", "Mão de obra", null, 3000],
      ["2026-01-05", "Nutrição", "Sal mineral", 1200.5],
    ]);
  });
});

describe("expensesExportTable with receitas", () => {
  it("leaves the receitas out of the Despesas sheet", () => {
    const table = expensesExportTable([
      { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
      { id: "r1", kind: "revenue", date: "2026-02-05", category: "other", amountBrl: 900 },
    ]);
    expect(table.rows).toEqual([["2026-01-05", "Nutrição", null, 100]]);
  });
});

const baseRow: LedgerRow = {
  id: "e1",
  kind: "expense",
  date: "2026-08-10",
  dueDate: "2026-08-20",
  paidAt: null,
  status: "payable",
  group: "health",
  groupLabel: "Sanidade",
  account: "Vacinas",
  counterparty: "Agrovet Uberaba",
  document: "NF 4.812",
  lotId: "lot1",
  lotName: "Recria 2",
  amountBrl: 3240,
  notes: null,
  locked: false,
  headCount: null,
  expense: null,
};

describe("ledgerExportTable", () => {
  it("writes the Extrato's columns with dates as ISO and Valor as money", () => {
    const table = ledgerExportTable([baseRow]);
    expect(table.title).toBe("Extrato");
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Data", "date"],
      ["Vencimento", "date"],
      ["Pagamento", "date"],
      ["Tipo", undefined],
      ["Grupo", undefined],
      ["Conta", undefined],
      ["Pago para / Recebido de", undefined],
      ["Documento", undefined],
      ["Lote", undefined],
      ["Valor (R$)", "money"],
      ["Status", undefined],
    ]);
    expect(table.rows).toEqual([
      [
        "2026-08-10",
        "2026-08-20",
        null,
        "Despesa",
        "Sanidade",
        "Vacinas",
        "Agrovet Uberaba",
        "NF 4.812",
        "Recria 2",
        3240,
        "A pagar",
      ],
    ]);
  });

  it("keeps a receita's value positive and names it in Tipo and Status", () => {
    const receita: LedgerRow = {
      ...baseRow,
      id: "e2",
      kind: "revenue",
      paidAt: "2026-08-12",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: "Aluguel de pasto",
      lotId: null,
      lotName: null,
      amountBrl: 1800,
    };
    const [row] = ledgerExportTable([receita]).rows;
    expect(row[2]).toBe("2026-08-12");
    expect(row[3]).toBe("Receita");
    expect(row[8]).toBe("Fazenda");
    expect(row[9]).toBe(1800);
    expect(row[10]).toBe("Recebido");
  });

  it("names a derived venda and an overdue despesa", () => {
    const rows = ledgerExportTable([
      { ...baseRow, id: "m1", kind: "sale", status: "received", group: "revenue", groupLabel: "Receitas", locked: true },
      { ...baseRow, id: "e3", status: "overdue" },
    ]).rows;
    expect(rows.map((r) => [r[3], r[10]])).toEqual([
      ["Venda de gado", "Recebido"],
      ["Despesa", "Vencido"],
    ]);
  });

  it("drops Valor when money is hidden", () => {
    const table = withoutMoney(ledgerExportTable([baseRow]), false);
    expect(table.columns.map((c) => c.header)).not.toContain("Valor (R$)");
    expect(table.rows[0]).toHaveLength(10);
  });
});

const period = { start: "2025-09-01", end: "2026-08-31" };

function indicatorsFixture(overrides: Partial<Indicators> = {}): Indicators {
  return {
    period,
    system: "ciclo_completo",
    heads: { start: 100, end: 110, avg: 105 },
    hectares: 200,
    revenue: 500_000,
    salesRevenue: 480_000,
    otherRevenue: 20_000,
    coe: 350_000,
    result: 150_000,
    resultPerHa: 750,
    marginPct: 30,
    costToRevenuePct: 70,
    capitalTurnover: 0.8,
    produced: {
      sold: 1500,
      bought: 300,
      inventoryStart: 1800,
      inventoryEnd: 1900,
      delta: 100,
      produced: 1300,
      unweighed: 0,
      headsSold: 90,
    },
    arrobasPerHa: 6.5,
    costPerArroba: 269.23,
    realizedPerArroba: 320,
    marginPerArroba: 40.77,
    outlayPerHeadMonth: 45.5,
    adg: { kgPerDay: 0.52, animals: 80 },
    offtakePct: 42,
    stocking: 1.1,
    calfPrice: 2800,
    exchange: { calvesPerSteer: 2.1, arrobasPerCalf: 9.3 },
    herdArrobas: 1900,
    herdValue: 589_000,
    inventoryDeltaBrl: 31_000,
    ...overrides,
  };
}

describe("indicatorsExportTable", () => {
  it("writes one row per indicator with the prior window and the reference", () => {
    const table = indicatorsExportTable(indicatorsFixture(), indicatorsFixture({ result: 90_000, costPerArroba: null }));
    expect(table.title).toBe("Indicadores");
    expect(table.columns.map((c) => c.header)).toEqual(["Indicador", "Valor", "Ano anterior", "Referência"]);
    expect(table.rows.map((r) => r[0])).toEqual([
      "Resultado do período (R$)",
      "Resultado por hectare (R$/ha)",
      "Margem (%)",
      "Custo ÷ receita (%)",
      "Custo da @ produzida (R$/@)",
      "Preço médio realizado (R$/@)",
      "Margem por @ (R$/@)",
      "@ produzidas",
      "@/ha/ano",
      "Desembolso por cabeça (R$/cab/mês)",
      "GMD (kg/dia)",
      "Taxa de desfrute (%)",
      "Lotação (UA/ha)",
      "Relação de troca (bezerros por boi)",
      "Valor do rebanho (R$)",
    ]);
    expect(table.rows[0]).toEqual(["Resultado do período (R$)", 150_000, 90_000, ""]);
    expect(table.rows[4].slice(0, 3)).toEqual(["Custo da @ produzida (R$/@)", 269.23, null]);
    expect(table.rows[4][3]).toContain("208");
    expect(table.rows[4][3]).toContain("165");
    expect(table.rows[14][3]).toBe("");
  });

  it("leaves Ano anterior empty without a prior window and keeps null values null", () => {
    const table = indicatorsExportTable(indicatorsFixture({ costPerArroba: null }), null);
    expect(table.rows.every((r) => r[2] === null)).toBe(true);
    expect(table.rows[4][1]).toBeNull();
  });
});

describe("lotsEconomicsExportTable", () => {
  const lot: LotEconomics = {
    lotId: "lot1",
    name: "Recria 2",
    heads: 88,
    directBrl: 12_000,
    sharedBrl: 30_000,
    totalBrl: 42_000,
    perHeadDay: 1.31,
    adg: 0.61,
    produced: 150,
    costPerArroba: 280,
    marginPerArroba: 30,
  };
  const farm: LotEconomics = { ...lot, lotId: null, name: "Fazenda toda", heads: 200, adg: null, produced: null, costPerArroba: null, marginPerArroba: null };

  it("writes one row per lote and a Fazenda row, money columns flagged", () => {
    const table = lotsEconomicsExportTable([lot], farm);
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Lote", undefined],
      ["Cabeças", "number"],
      ["Custo direto (R$)", "money"],
      ["Rateio (R$)", "money"],
      ["Custo total (R$)", "money"],
      ["R$/cab/dia", "money"],
      ["GMD (kg/dia)", "number"],
      ["@ produzidas", "number"],
      ["Custo/@ (R$)", "money"],
      ["Margem/@ (R$)", "money"],
    ]);
    expect(table.rows).toEqual([
      ["Recria 2", 88, 12_000, 30_000, 42_000, 1.31, 0.61, 150, 280, 30],
      ["Fazenda", 200, 12_000, 30_000, 42_000, 1.31, null, null, null, null],
    ]);
    expect(withoutMoney(table, false).columns.map((c) => c.header)).toEqual([
      "Lote",
      "Cabeças",
      "GMD (kg/dia)",
      "@ produzidas",
    ]);
  });
});
