import { describe, expect, it } from "vitest";
import { groupsReport } from "@/lib/reports/groups";
import type { LedgerInputs } from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import type { Expense, GroupKind, Movement, PlanGroup } from "@/lib/types";
import { makeTreatment } from "@/lib/domain/__tests__/fixtures";

const TODAY = "2026-10-07";
const SEPTEMBER: Period = { start: "2026-09-01", end: "2026-09-30" };

const group = (id: string, kind: GroupKind, name: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
});

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
    expense("aluguel", { kind: "revenue", category: "receitas", amountBrl: 9600, accountId: "acc-aluguel", paidAt: "2026-09-25" }),
    expense("receita-sem-conta", { kind: "revenue", category: "receitas", amountBrl: 50 }),
    expense("pasto", { kind: "revenue", category: "g-arr", amountBrl: 1200, accountId: "acc-pasto", paidAt: "2026-09-26" }),
    expense("sal", { category: "nutrition", amountBrl: 5940, accountId: "acc-sal", paidAt: "2026-09-01" }),
    expense("racao", { category: "nutrition", amountBrl: 2536.4, accountId: "acc-racao" }),
    expense("energia", { category: "admin", amountBrl: 1783.98, accountId: "acc-energia", paidAt: "2026-09-10" }),
    expense("diesel", { category: "g-maq", amountBrl: 11820, accountId: "acc-diesel", paidAt: "2026-09-12" }),
    expense("outros", { category: "other", amountBrl: 187.83 }),
    // Its grupo was removed: last, as "Grupo removido".
    expense("sumiu", { category: "g-gone", amountBrl: 10 }),
    // Dated in August, paid in September: caixa only.
    expense("encargos", { category: "labor", date: "2026-08-31", amountBrl: 6091.17, paidAt: "2026-09-15" }),
    // Dated in September, paid in October: competência only.
    expense("adubo", { category: "pasture", date: "2026-09-20", amountBrl: 3000, paidAt: "2026-10-02" }),
    expense("trator", { kind: "investment", category: "investimentos", flow: "out", amountBrl: 18900, accountId: "acc-maquinas", paidAt: "2026-09-10" }),
    expense("custeio", { kind: "financing", category: "financiamentos", flow: "in", amountBrl: 60000, accountId: "acc-custeio", paidAt: "2026-09-12" }),
    expense("parcela", { kind: "financing", category: "financiamentos", flow: "out", amountBrl: 3480.79, accountId: "acc-consorcio", paidAt: "2026-09-20" }),
    expense("lucro", { kind: "partners", category: "socios", flow: "out", amountBrl: 10000, paidAt: "2026-09-30" }),
    { id: "rendimento", kind: "yield", date: "2026-09-10", amountBrl: 312.5, paidAt: "2026-09-30" },
  ],
  accounts: [
    { id: "acc-aluguel", group: "receitas", name: "Aluguel de pasto" },
    { id: "acc-pasto", group: "g-arr", name: "Pasto do vizinho" },
    { id: "acc-sal", group: "nutrition", name: "Sal mineral" },
    { id: "acc-racao", group: "nutrition", name: "Ração e suplemento" },
    { id: "acc-energia", group: "admin", name: "Energia" },
    { id: "acc-diesel", group: "g-maq", name: "Diesel" },
    { id: "acc-maquinas", group: "investimentos", name: "Máquinas e implementos" },
    { id: "acc-custeio", group: "financiamentos", name: "Custeio Sicredi" },
    { id: "acc-consorcio", group: "financiamentos", name: "Consórcio trator" },
  ],
  movements: [
    sale({}),
    sale({ id: "compra", type: "purchase", date: "2026-09-20", amountBrl: 42600, origin: "Leilão", destination: "Fazenda" }),
  ],
  manejoSessions: [],
  animals: [],
  lots: [],
  planGroups: [
    group("receitas", "revenue", "Receitas"),
    group("g-arr", "revenue", "Arrendamentos"),
    group("nutrition", "expense", "Nutrição"),
    group("pasture", "expense", "Pastagem"),
    group("labor", "expense", "Mão de obra"),
    group("health", "expense", "Sanidade"),
    group("admin", "expense", "Administrativo"),
    group("other", "expense", "Outros"),
    group("g-maq", "expense", "Máquinas e veículos"),
    group("investimentos", "investment", "Investimentos"),
    group("financiamentos", "financing", "Financiamentos"),
    group("socios", "partners", "Sócios"),
  ],
};

const accrual = groupsReport(INPUTS, SEPTEMBER, "accrual", TODAY);
const cash = groupsReport(INPUTS, SEPTEMBER, "cash", TODAY);
const lines = (xs: { label: string; amountBrl: number }[]) => xs.map((x) => [x.label, x.amountBrl]);

describe("groupsReport: receitas", () => {
  it("puts Venda de gado first as a locked line, then the receitas by grupo, by name", () => {
    expect(accrual.revenues.map((g) => [g.key, g.label, g.amountBrl, g.locked ?? false])).toEqual([
      ["venda-de-gado", "Venda de gado", 138420, true],
      ["g-arr", "Arrendamentos", 1200, false],
      ["receitas", "Receitas", 9650, false],
    ]);
    expect(accrual.revenues[0].accounts).toEqual([]);
    expect(accrual.revenueTotal).toBe(149270);
  });

  it("opens each grupo of receita into its contas, lines without conta last", () => {
    expect(lines(accrual.revenues[2].accounts)).toEqual([
      ["Aluguel de pasto", 9600],
      ["Sem conta", 50],
    ]);
  });

  it("leaves Venda de gado out when nothing was sold", () => {
    const noSale = groupsReport({ ...INPUTS, movements: [] }, SEPTEMBER, "accrual", TODAY);
    expect(noSale.revenues.map((g) => g.key)).toEqual(["g-arr", "receitas"]);
  });
});

describe("groupsReport: despesas", () => {
  it("lists only the grupos with lines, by name, a removed one last", () => {
    expect(accrual.expenses.map((g) => [g.label, g.amountBrl])).toEqual([
      ["Administrativo", 1783.98],
      ["Máquinas e veículos", 11820],
      ["Nutrição", 8476.4],
      ["Outros", 187.83],
      ["Pastagem", 3000],
      ["Grupo removido", 10],
    ]);
    expect(accrual.expenseTotal).toBe(25278.21);
  });

  it("opens each grupo into its contas, lines without conta last", () => {
    const group = (label: string) => accrual.expenses.find((g) => g.label === label)!;
    expect(lines(group("Nutrição").accounts)).toEqual([
      ["Ração e suplemento", 2536.4],
      ["Sal mineral", 5940],
    ]);
    expect(lines(group("Outros").accounts)).toEqual([["Sem conta", 187.83]]);
  });

  it("is the receitas minus the despesas, the capital rows left out", () => {
    expect(accrual.balance).toBe(123991.79);
  });

  it("counts no tratamento, even when the farm's data carries it", () => {
    // The store's data has the tratamentos; handed in whole, they still make no line.
    const withTreatments = {
      ...INPUTS,
      treatments: [makeTreatment({ name: "Vacina aftosa", date: "2026-09-08", status: "done", costBrl: 434 })],
    };
    expect(groupsReport(withTreatments, SEPTEMBER, "accrual", TODAY)).toEqual(accrual);
  });
});

describe("groupsReport: a tipo with one grupo", () => {
  const without = (id: string) => ({
    ...INPUTS,
    planGroups: INPUTS.planGroups.filter((g) => g.id !== id),
  });
  const report = (inputs: typeof INPUTS) => groupsReport(inputs, SEPTEMBER, "accrual", TODAY);

  it("flags a tipo only when it shows a single grupo: the active ones plus the ones with lines", () => {
    expect(accrual.flat).toEqual({ revenue: false, expense: false });
    // Arrendamentos archived but with a line in the window: still two grupos on the page.
    const archived = {
      ...INPUTS,
      planGroups: INPUTS.planGroups.map((g) => (g.id === "g-arr" ? { ...g, archivedAt: "2026-01-01T00:00:00.000Z" } : g)),
    };
    expect(report(archived).flat.revenue).toBe(false);
    // Removed, its line reads "Grupo removido": still two.
    expect(report(without("g-arr")).flat.revenue).toBe(false);
    // Removed with no line left: Receitas alone.
    const alone = {
      ...without("g-arr"),
      expenses: INPUTS.expenses.filter((e) => e.category !== "g-arr"),
      accounts: INPUTS.accounts.filter((a) => a.group !== "g-arr"),
    };
    expect(report(alone).flat).toEqual({ revenue: true, expense: false });
  });
});

describe("groupsReport: caixa", () => {
  it("takes only what was paid or received in the window, by payment day", () => {
    expect(lines(cash.revenues)).toEqual([
      ["Venda de gado", 138420],
      ["Arrendamentos", 1200],
      ["Receitas", 9600],
    ]);
    // Ração and Outros are pending, Adubo was paid in October, Encargos (August) in September.
    expect(cash.expenses.map((g) => [g.label, g.amountBrl])).toEqual([
      ["Administrativo", 1783.98],
      ["Mão de obra", 6091.17],
      ["Máquinas e veículos", 11820],
      ["Nutrição", 5940],
    ]);
    expect(cash.balance).toBe(123584.85);
  });
});

describe("groupsReport: fora do resultado", () => {
  it("adds entradas and saídas per tipo and conta, compra de gado locked, rendimentos last", () => {
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

  it("is empty for a window without lines", () => {
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
