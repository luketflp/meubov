import { describe, expect, it } from "vitest";
import { groupsReport } from "@/lib/reports/groups";
import type { LedgerInputs } from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import type { Expense, Movement } from "@/lib/types";
import { makeTreatment } from "@/lib/domain/__tests__/fixtures";

const TODAY = "2026-10-07";
const SEPTEMBER: Period = { start: "2026-09-01", end: "2026-09-30" };

const expense = (id: string, overrides: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-10",
  category: "other",
  amountBrl: 100,
  ...overrides,
});

const sale = (overrides: Partial<Movement>): Movement => ({
  id: "venda",
  type: "sale",
  date: "2026-09-18",
  origin: "Fazenda",
  destination: "Frigorífico",
  amountBrl: 138420,
  ...overrides,
});

const INPUTS: LedgerInputs = {
  expenses: [
    expense("aluguel", { kind: "revenue", amountBrl: 9600, accountId: "acc-aluguel", paidAt: "2026-09-25" }),
    expense("receita-sem-conta", { kind: "revenue", amountBrl: 50 }),
    expense("sal", { category: "nutrition", amountBrl: 5940, accountId: "acc-sal", paidAt: "2026-09-01" }),
    expense("racao", { category: "nutrition", amountBrl: 2536.4, accountId: "acc-racao" }),
    expense("energia", { category: "admin", amountBrl: 1783.98, accountId: "acc-energia", paidAt: "2026-09-10" }),
    expense("diesel", { category: "g-maq", amountBrl: 11820, accountId: "acc-diesel", paidAt: "2026-09-12" }),
    expense("outros", { category: "other", amountBrl: 187.83 }),
    // Dated in August, paid in September: caixa only.
    expense("encargos", { category: "labor", date: "2026-08-31", amountBrl: 6091.17, paidAt: "2026-09-15" }),
    // Dated in September, paid in October: competência only.
    expense("adubo", { category: "pasture", date: "2026-09-20", amountBrl: 3000, paidAt: "2026-10-02" }),
    expense("trator", { kind: "investment", flow: "out", amountBrl: 18900, accountId: "acc-maquinas", paidAt: "2026-09-10" }),
    expense("custeio", { kind: "financing", flow: "in", amountBrl: 60000, accountId: "acc-custeio", paidAt: "2026-09-12" }),
    expense("parcela", { kind: "financing", flow: "out", amountBrl: 3480.79, accountId: "acc-consorcio", paidAt: "2026-09-20" }),
    expense("lucro", { kind: "partners", flow: "out", amountBrl: 10000, paidAt: "2026-09-30" }),
    expense("rendimento", { kind: "yield", amountBrl: 312.5, paidAt: "2026-09-30" }),
  ],
  accounts: [
    { id: "acc-aluguel", group: "revenue", name: "Aluguel de pasto" },
    { id: "acc-sal", group: "nutrition", name: "Sal mineral" },
    { id: "acc-racao", group: "nutrition", name: "Ração e suplemento" },
    { id: "acc-energia", group: "admin", name: "Energia" },
    { id: "acc-diesel", group: "g-maq", name: "Diesel" },
    { id: "acc-maquinas", group: "investment", name: "Máquinas e implementos" },
    { id: "acc-custeio", group: "financing", name: "Custeio Sicredi" },
    { id: "acc-consorcio", group: "financing", name: "Consórcio trator" },
  ],
  movements: [
    sale({}),
    sale({ id: "compra", type: "purchase", date: "2026-09-20", amountBrl: 42600, origin: "Leilão", destination: "Fazenda" }),
  ],
  manejoSessions: [],
  animals: [],
  treatments: [
    makeTreatment({ id: "t1", name: "Vacina aftosa", date: "2026-09-08", status: "done", costBrl: 200 }),
    makeTreatment({ id: "t2", name: "Vacina aftosa", date: "2026-09-08", status: "done", costBrl: 234 }),
  ],
  lots: [],
  expenseGroups: [{ id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-01-01T00:00:00.000Z" }],
};

const accrual = groupsReport(INPUTS, SEPTEMBER, "accrual", TODAY);
const cash = groupsReport(INPUTS, SEPTEMBER, "cash", TODAY);
const lines = (xs: { label: string; amountBrl: number }[]) => xs.map((x) => [x.label, x.amountBrl]);

describe("groupsReport: receitas", () => {
  it("lists them by conta, alphabetical with Sem conta last, Venda de gado locked", () => {
    expect(lines(accrual.revenues)).toEqual([
      ["Aluguel de pasto", 9600],
      ["Venda de gado", 138420],
      ["Sem conta", 50],
    ]);
    expect(accrual.revenues.map((r) => r.locked)).toEqual([false, true, false]);
    expect(accrual.revenueTotal).toBe(148070);
  });
});

describe("groupsReport: despesas", () => {
  it("lists only the grupos with lines, alphabetical with Outros last, the farm's among them", () => {
    expect(accrual.expenses.map((g) => [g.label, g.amountBrl, g.custom])).toEqual([
      ["Administrativo", 1783.98, false],
      ["Máquinas e veículos", 11820, true],
      ["Nutrição", 8476.4, false],
      ["Pastagem", 3000, false],
      ["Sanidade", 434, false],
      ["Outros", 187.83, false],
    ]);
    expect(accrual.expenseTotal).toBe(25702.21);
  });

  it("opens each grupo into its contas, treatments and lines without conta last", () => {
    const group = (label: string) => accrual.expenses.find((g) => g.label === label)!;
    expect(lines(group("Nutrição").accounts)).toEqual([
      ["Ração e suplemento", 2536.4],
      ["Sal mineral", 5940],
    ]);
    expect(group("Sanidade").accounts).toEqual([{ label: "Tratamentos do calendário", amountBrl: 434, locked: true }]);
    expect(lines(group("Outros").accounts)).toEqual([["Sem conta", 187.83]]);
  });

  it("is the receitas minus the despesas, the capital rows left out", () => {
    expect(accrual.balance).toBe(122367.79);
  });
});

describe("groupsReport: caixa", () => {
  it("takes only what was paid or received in the window, by payment day", () => {
    expect(lines(cash.revenues)).toEqual([
      ["Aluguel de pasto", 9600],
      ["Venda de gado", 138420],
    ]);
    // Ração and Outros are pending, Adubo was paid in October, Encargos (August) in September.
    expect(cash.expenses.map((g) => [g.label, g.amountBrl])).toEqual([
      ["Administrativo", 1783.98],
      ["Mão de obra", 6091.17],
      ["Máquinas e veículos", 11820],
      ["Nutrição", 5940],
      ["Sanidade", 434],
    ]);
    expect(cash.balance).toBe(121950.85);
  });
});

describe("groupsReport: fora do resultado", () => {
  it("adds entradas and saídas per grupo and conta, compra de gado locked, rendimentos last", () => {
    expect(accrual.capital.map((g) => [g.label, g.inBrl, g.outBrl])).toEqual([
      ["Investimentos", 0, 61500],
      ["Financiamentos", 60000, 3480.79],
      ["Sócios", 0, 10000],
      ["Rendimentos", 312.5, 0],
    ]);
    expect(accrual.capital[0].accounts).toEqual([
      { label: "Compra de gado", inBrl: 0, outBrl: 42600, locked: true },
      { label: "Máquinas e implementos", inBrl: 0, outBrl: 18900, locked: false },
    ]);
    expect(accrual.capital[1].accounts.map((a) => a.label)).toEqual(["Consórcio trator", "Custeio Sicredi"]);
    expect(accrual.capital[2].accounts.map((a) => a.label)).toEqual(["Sem conta"]);
  });

  it("is empty for a window without capital rows", () => {
    expect(groupsReport(INPUTS, { start: "2026-07-01", end: "2026-07-31" }, "accrual", TODAY)).toMatchObject({
      revenues: [],
      expenses: [],
      capital: [],
      revenueTotal: 0,
      expenseTotal: 0,
      balance: 0,
    });
  });
});
