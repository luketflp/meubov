import { describe, expect, it } from "vitest";
import {
  bankInventoryTable,
  bankStatementTable,
  bankSummaryTable,
  groupsCapitalTable,
  groupsExpenseTable,
  groupsRevenueTable,
  declarationTables,
  flowTable,
  headsLabel,
  technicalBullsTable,
  technicalLotsTable,
  withTotalsRow,
} from "@/components/reports/tables";
import type { BankReport } from "@/lib/reports/bank";
import type { StatementSection } from "@/lib/reports/bankStatement";
import type { GroupsReport } from "@/lib/reports/groups";
import type { BankAccount } from "@/lib/types";
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

const GROUPS: GroupsReport = {
  revenues: [
    { key: "venda-de-gado", label: "Venda de gado", amountBrl: 1000, accounts: [], locked: true },
    {
      key: "grp-receitas",
      label: "Receitas",
      amountBrl: 250,
      accounts: [
        { label: "Arrendamento", amountBrl: 200, locked: false },
        { label: "Sem conta", amountBrl: 50, locked: false },
      ],
    },
  ],
  revenueTotal: 1250,
  expenses: [
    {
      key: "grp-nutricao",
      label: "Nutrição",
      amountBrl: 300,
      accounts: [
        { label: "Ração e suplemento", amountBrl: 100, locked: false },
        { label: "Sal mineral", amountBrl: 200, locked: false },
      ],
    },
    { key: "grp-outros", label: "Outros", amountBrl: 100, accounts: [{ label: "Sem conta", amountBrl: 100, locked: false }] },
  ],
  expenseTotal: 400,
  balance: 850,
  flat: { revenue: true, expense: false },
  capital: [
    {
      key: "financing",
      label: "Financiamentos",
      inBrl: 5000,
      outBrl: 500,
      accounts: [
        { label: "Consórcio trator", inBrl: 0, outBrl: 500, locked: false },
        { label: "Custeio", inBrl: 5000, outBrl: 0, locked: false },
      ],
    },
  ],
};

describe("groups tables", () => {
  it("gives Venda de gado and each receita grupo its share of the receita", () => {
    const { table, totals, subRows } = groupsRevenueTable(GROUPS, false);
    expect(table.columns[0].header).toBe("Grupo");
    expect(table.rows).toEqual([
      ["Venda de gado", 1000, 80],
      ["Receitas", 250, 20],
    ]);
    expect(totals).toEqual(["Total de receitas", 1250, 100]);
    expect(subRows).toBeUndefined();
  });

  it("lists the contas of the only receita grupo without its header, Venda de gado on its own", () => {
    const { table, subRows } = groupsRevenueTable(GROUPS, true);
    expect(table.columns[0].header).toBe("Grupo / conta");
    expect(table.rows).toEqual([
      ["Venda de gado", 1000, 80],
      ["Arrendamento", 200, 16],
      ["Sem conta", 50, 4],
    ]);
    expect([...(subRows ?? [])]).toEqual([]);
  });

  it("opens each receita grupo under its header when there are two", () => {
    const servicos = {
      key: "grp-servicos",
      label: "Serviços",
      amountBrl: 250,
      accounts: [{ label: "Sem conta", amountBrl: 250, locked: false }],
    };
    const report = { ...GROUPS, revenues: [...GROUPS.revenues, servicos], revenueTotal: 1500, flat: { revenue: false, expense: false } };
    const { table, subRows } = groupsRevenueTable(report, true);
    expect(table.rows.map((r) => r[0])).toEqual(["Venda de gado", "Receitas", "Arrendamento", "Sem conta", "Serviços", "Sem conta"]);
    expect([...(subRows ?? [])]).toEqual([2, 3, 5]);
  });

  it("lists the grupos with their share of the despesas and of the receita", () => {
    const { table, totals, subRows } = groupsExpenseTable(GROUPS, false);
    expect(table.rows).toEqual([
      ["Nutrição", 300, 75, 24],
      ["Outros", 100, 25, 8],
    ]);
    expect(totals).toEqual(["Total de despesas", 400, 100, 32]);
    expect(subRows).toBeUndefined();
  });

  it("opens each grupo into its contas, marking them as sub-rows", () => {
    const { table, subRows } = groupsExpenseTable(GROUPS, true);
    expect(table.columns[0].header).toBe("Grupo / conta");
    expect(table.rows.map((r) => r[0])).toEqual(["Nutrição", "Ração e suplemento", "Sal mineral", "Outros", "Sem conta"]);
    expect([...(subRows ?? [])]).toEqual([1, 2, 4]);
  });

  it("lists the contas of the only despesa grupo without its header", () => {
    const report = { ...GROUPS, expenses: [GROUPS.expenses[0]], expenseTotal: 300, flat: { revenue: true, expense: true } };
    const { table, subRows } = groupsExpenseTable(report, true);
    expect(table.rows.map((r) => r[0])).toEqual(["Ração e suplemento", "Sal mineral"]);
    expect([...(subRows ?? [])]).toEqual([]);
  });

  it("keeps the grupo header while the farm has other despesa grupos, even when only one has lines", () => {
    const report = { ...GROUPS, expenses: [GROUPS.expenses[0]], expenseTotal: 300 };
    const { table, subRows } = groupsExpenseTable(report, true);
    expect(table.rows.map((r) => r[0])).toEqual(["Nutrição", "Ração e suplemento", "Sal mineral"]);
    expect([...(subRows ?? [])]).toEqual([1, 2]);
  });

  it("has no share of the receita when there was none", () => {
    const { table } = groupsExpenseTable({ ...GROUPS, revenues: [], revenueTotal: 0 }, false);
    expect(table.rows[0][3]).toBeNull();
  });

  it("writes entradas, saídas and líquido outside the resultado", () => {
    const { table, totals, subRows } = groupsCapitalTable(GROUPS);
    expect(table.rows).toEqual([
      ["Financiamentos", 5000, 500, 4500],
      ["Consórcio trator", null, 500, -500],
      ["Custeio", 5000, null, 5000],
    ]);
    expect(totals).toEqual(["Total", 5000, 500, 4500]);
    expect([...(subRows ?? [])]).toEqual([1, 2]);
  });
});

const account = (id: string, kind: BankAccount["kind"], label?: string): BankAccount => ({
  id,
  kind,
  name: id,
  label,
  openingBalanceBrl: 0,
  openingDate: "2026-01-01",
  isMain: false,
  pendingLines: 0,
});

const SECTIONS: StatementSection[] = [
  {
    bank: account("Sicredi", "checking", "c/c 12.345-6"),
    opening: 1000.1,
    ins: 500.2,
    outs: 200,
    closing: 1300.3,
    lines: [
      {
        id: "e1",
        paidAt: "2026-09-05",
        issuedAt: "2026-08-28",
        dueDate: "2026-09-05",
        document: "NF 1",
        counterparty: "Agro",
        history: "Sal",
        planAccount: "Nutrição › Sal mineral",
        locked: false,
        amountBrl: -200,
        balance: 800.1,
      },
    ],
  },
  { bank: account("Caixa", "cash"), opening: 50.2, ins: 0, outs: 0, closing: 50.2, lines: [] },
  { bank: account("Cartão", "card"), opening: -300, ins: 300, outs: 100, closing: -100, lines: [] },
];

describe("bank statement tables", () => {
  it("sums the contas but the cartões as Saldo em contas", () => {
    const { table, totals } = bankSummaryTable(SECTIONS);
    expect(table.rows.map((r) => r[0])).toEqual(["Sicredi · c/c 12.345-6", "Caixa", "Cartão"]);
    expect(totals).toEqual(["Saldo em contas (sem cartões)", 1050.3, 500.2, 200, 1350.5]);
  });

  it("writes every line with its conta for the spreadsheet", () => {
    expect(bankStatementTable(SECTIONS).rows).toEqual([
      ["Sicredi · c/c 12.345-6", "2026-09-05", "2026-08-28", "2026-09-05", "NF 1", "Agro", "Sal", "Nutrição › Sal mineral", -200, 800.1],
    ]);
  });
});
