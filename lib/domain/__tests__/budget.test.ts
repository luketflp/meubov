import { describe, expect, it } from "vitest";
import type { Account, Budget, Expense, ExpenseCategory, GroupKind, PlanGroup } from "@/lib/types";
import {
  budgetView,
  copyPlan,
  distribute,
  lineKey,
  monthsAddUp,
  previousShape,
  safraLabel,
  safraMonths,
  safraOf,
  safraRange,
  type BudgetInputs,
} from "@/lib/domain/budget";
import { makeTreatment } from "./fixtures";

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2025-01-01T00:00:00.000Z",
  ...(archivedAt && { archivedAt }),
});

/** The farm's grupos de despesa, and one of receita that the Orçamento never lists. */
const GROUPS: PlanGroup[] = [
  group("nutrition", "expense", "Nutrição"),
  group("pasture", "expense", "Pastagem"),
  group("labor", "expense", "Mão de obra"),
  group("health", "expense", "Sanidade"),
  group("breeding", "expense", "Reprodução"),
  group("admin", "expense", "Administrativo"),
  group("other", "expense", "Outros"),
  group("receitas", "revenue", "Receitas"),
];

/** Twelve months in safra order: the given ones, then zeros. */
const months = (...head: number[]): number[] => [...head, ...Array<number>(12 - head.length).fill(0)];

describe("safra months", () => {
  it("starts in outubro: Safra 2025/26 runs 01/10/2025 to 30/09/2026", () => {
    expect(safraOf("2025-10-01", 10)).toBe(2025);
    expect(safraOf("2025-09-30", 10)).toBe(2024);
    expect(safraOf("2026-09-30", 10)).toBe(2025);
    expect(safraMonths(2025, 10).map((m) => m.label)).toEqual([
      "out/25", "nov/25", "dez/25", "jan/26", "fev/26", "mar/26",
      "abr/26", "mai/26", "jun/26", "jul/26", "ago/26", "set/26",
    ]);
    expect(safraMonths(2025, 10)[3]).toEqual({ year: 2026, month: 1, label: "jan/26", key: "2026-01" });
    expect(safraLabel(2025, 10)).toBe("Safra 2025/26");
    expect(safraRange(2025, 10)).toEqual({ start: "2025-10-01", end: "2026-09-30" });
  });

  it("starts in janeiro: the calendar year, labelled Safra 2026", () => {
    expect(safraOf("2026-01-01", 1)).toBe(2026);
    expect(safraOf("2026-12-31", 1)).toBe(2026);
    expect(safraMonths(2026, 1).map((m) => m.key)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);
    expect(safraLabel(2026, 1)).toBe("Safra 2026");
    expect(safraRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("starts in dezembro: Safra 2026/27 runs dez/26 to nov/27", () => {
    expect(safraOf("2026-11-30", 12)).toBe(2025);
    expect(safraOf("2026-12-01", 12)).toBe(2026);
    const ms = safraMonths(2026, 12);
    expect([ms[0].label, ms[1].label, ms[11].label]).toEqual(["dez/26", "jan/27", "nov/27"]);
    expect(safraLabel(2026, 12)).toBe("Safra 2026/27");
    expect(safraRange(2026, 12)).toEqual({ start: "2026-12-01", end: "2027-11-30" });
  });

  it("ends on a leap 29 February", () => {
    expect(safraRange(2027, 3)).toEqual({ start: "2027-03-01", end: "2028-02-29" });
    expect(safraRange(2026, 3).end).toBe("2027-02-28");
    expect(safraMonths(2027, 3)[11]).toEqual({ year: 2028, month: 2, label: "fev/28", key: "2028-02" });
    expect(safraOf("2028-02-29", 3)).toBe(2027);
    expect(safraOf("2028-03-01", 3)).toBe(2028);
  });
});

describe("distribute and monthsAddUp", () => {
  it("equal: floored to the centavo, the remainder on the last month", () => {
    const out = distribute(100, "equal");
    expect(out).toEqual([...Array<number>(11).fill(8.33), 8.37]);
    expect(monthsAddUp(out, 100)).toBe(true);
    expect(distribute(1200, "equal")).toEqual(Array<number>(12).fill(100));
  });

  it("previous: proportional to the shape, a zero month stays zero", () => {
    expect(distribute(1000, "previous", months(2, 0, 1, 1))).toEqual(months(500, 0, 250, 250));
    // The remainder still lands on the last month.
    const out = distribute(100, "previous", months(1, 1, 1));
    expect(out).toEqual([33.33, 33.33, 33.33, 0, 0, 0, 0, 0, 0, 0, 0, 0.01]);
    expect(monthsAddUp(out, 100)).toBe(true);
  });

  it("previous falls back to equal when the shape is all zero or missing", () => {
    expect(distribute(100, "previous", months())).toEqual(distribute(100, "equal"));
    expect(distribute(100, "previous")).toEqual(distribute(100, "equal"));
  });

  it("refuses typed months that do not add up, or not twelve of them", () => {
    expect(monthsAddUp(Array<number>(12).fill(8.33), 100)).toBe(false);
    expect(monthsAddUp(Array<number>(11).fill(10), 110)).toBe(false);
    expect(monthsAddUp(months(0.1, 0.2), 0.3)).toBe(true);
  });
});

describe("lineKey", () => {
  it("is the category, or category:conta", () => {
    expect(lineKey("nutrition")).toBe("nutrition");
    expect(lineKey("nutrition", null)).toBe("nutrition");
    expect(lineKey("nutrition", "nut-sal")).toBe("nutrition:nut-sal");
  });
});

// One farm, safra starting in outubro, today in fevereiro of safra 2025/26
// (index 4). Nutrição is budgeted on the grupo and on two of its three contas,
// Administrativo on the grupo only; Sanidade has a despesa and no orçado.
const TODAY = "2026-02-15";

/** One row: a calendar month ("2025-10") of a line. */
const row = (category: ExpenseCategory, month: string, amountBrl: number, patch: Partial<Budget> = {}): Budget => ({
  id: `${category}:${patch.accountId ?? ""}:${month}`,
  category,
  month: `${month}-01`,
  amountBrl,
  distribution: "equal",
  ...patch,
});
/** The 12 rows of a line in a safra starting in outubro (2025 unless said); amounts in safra order (out → set). */
const budgetLine = (
  category: ExpenseCategory,
  amounts: number | number[],
  patch: Partial<Budget> = {},
  safra = 2025
): Budget[] =>
  safraMonths(safra, 10).map((m, i) =>
    row(category, m.key, typeof amounts === "number" ? amounts : amounts[i], patch)
  );

const expense = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2025-10-10",
  category: "nutrition",
  amountBrl: 100,
  ...patch,
});

const accounts: Account[] = [
  { id: "nut-sal", group: "nutrition", name: "Sal mineral" },
  { id: "nut-racao", group: "nutrition", name: "Ração e suplemento" },
  { id: "nut-sil", group: "nutrition", name: "Silagem" },
];

const BUDGETS: Budget[] = [
  ...budgetLine("nutrition", 1000),
  ...budgetLine("nutrition", 400, { accountId: "nut-sal" }),
  ...budgetLine("nutrition", 500, { accountId: "nut-racao" }),
  ...budgetLine("admin", 500),
];

const INPUTS: BudgetInputs = {
  budgets: BUDGETS,
  accounts,
  expenses: [
    expense("sal-out", { accountId: "nut-sal", date: "2025-10-10", amountBrl: 350, paidAt: "2025-10-12" }),
    expense("racao-nov", { accountId: "nut-racao", date: "2025-11-05", amountBrl: 600 }), // pendente
    expense("nut-jan", { date: "2026-01-20", amountBrl: 1200, paidAt: "2026-01-20" }), // no conta
    expense("sal-fev", { accountId: "nut-sal", date: "2026-02-03", amountBrl: 400 }),
    // Parcelas still ahead of today: previsto, not realizado.
    expense("racao-p2", { accountId: "nut-racao", date: "2026-02-25", amountBrl: 300, seriesId: "racao", seriesIndex: 2, seriesCount: 3 }),
    expense("racao-p3", { accountId: "nut-racao", date: "2026-03-25", amountBrl: 300, seriesId: "racao", seriesIndex: 3, seriesCount: 3 }),
    expense("adm-dez", { category: "admin", date: "2025-12-15", amountBrl: 2000 }),
    expense("adm-fev", { category: "admin", date: "2026-02-10", amountBrl: 1000 }),
    // Safra 2024/25: the "previous" shape of Nutrição.
    expense("sal-2024", { accountId: "nut-sal", date: "2024-10-15", amountBrl: 600 }),
    expense("nut-2024", { date: "2025-09-30", amountBrl: 999 }),
    // Never realizado.
    expense("trator", { kind: "investment", flow: "out", category: "other", date: "2025-12-01", amountBrl: 50000 }),
    expense("aluguel", { kind: "revenue", category: "receitas", date: "2026-01-10", amountBrl: 8000 }),
    expense("vac", { category: "health", date: "2025-11-20", amountBrl: 150 }),
  ],
  planGroups: GROUPS,
};

const view = budgetView(INPUTS, 2025, 10, TODAY);
const budgetGroup = (category: ExpenseCategory) => view.groups.find((g) => g.category === category)!;
const nutrition = budgetGroup("nutrition");
const conta = (id: string) => nutrition.accounts.find((a) => a.accountId === id)!;

describe("budgetView: realizado", () => {
  it("counts despesas by date, paid or not, up to today only", () => {
    expect(view.todayIndex).toBe(4);
    // out 350 paid, nov 600 pendente, jan 1200 without conta, fev 400; the
    // parcela of 25/02 is after today and 30/09/2025 is the safra before.
    expect(nutrition.realized).toEqual(months(350, 600, 0, 1200, 400));
    expect(nutrition.realizedToDate).toBe(2550);
  });

  it("counts a conta's own despesas only", () => {
    expect(conta("nut-sal").realized).toEqual(months(350, 0, 0, 0, 400));
    expect(conta("nut-racao").realized).toEqual(months(0, 600));
  });

  it("lists a grupo with despesas and no orçado", () => {
    const health = budgetGroup("health");
    expect(health.realized).toEqual(months(0, 150));
    expect([health.hasBudget, health.usedPct, health.tone]).toEqual([false, null, "none"]);
  });

  it("never counts a tratamento's cost, even when the farm's data carries it", () => {
    // The store's data has the tratamentos; handed in whole, they still count for nothing.
    const withTreatments = { ...INPUTS, treatments: [makeTreatment({ date: "2025-12-01", status: "done", costBrl: 999 })] };
    expect(budgetView(withTreatments, 2025, 10, TODAY)).toEqual(view);
  });

  it("never counts an investimento or a receita, nor lists a grupo of receita", () => {
    expect(view.groups.map((g) => g.key)).toEqual(["admin", "nutrition", "health"]);
  });
});

describe("budgetView: orçado of a grupo and its contas", () => {
  it("takes the grupo's own line and flags contas that add up to something else", () => {
    expect(nutrition.budgeted).toEqual(Array<number>(12).fill(1000));
    expect([nutrition.budgetedTotal, nutrition.budgetedToDate]).toEqual([12000, 5000]);
    expect([nutrition.ownRows, nutrition.hasBudget, nutrition.distribution]).toEqual([true, true, "equal"]);
    expect(nutrition.accountsSum).toBe(10800);
    expect(budgetGroup("admin").accountsSum).toBeNull();
  });

  it("lists contas with a budget or realizado, by name", () => {
    expect(nutrition.accounts.map((a) => a.label)).toEqual(["Ração e suplemento", "Sal mineral"]);
    expect(conta("nut-sal").budgetedTotal).toBe(4800);
    const withSilagem = budgetView(
      { ...INPUTS, expenses: [...INPUTS.expenses, expense("sil", { accountId: "nut-sil", amountBrl: 10 })] },
      2025, 10, TODAY
    ).groups.find((g) => g.key === "nutrition")!;
    const silagem = withSilagem.accounts.find((a) => a.accountId === "nut-sil")!;
    expect([silagem.hasBudget, silagem.realizedToDate, silagem.tone]).toEqual([false, 10, "none"]);
  });

  it("sums the contas when the grupo has no line of its own", () => {
    const g = budgetView(
      { ...INPUTS, budgets: BUDGETS.filter((b) => !(b.category === "nutrition" && b.accountId === undefined)) },
      2025, 10, TODAY
    ).groups.find((g) => g.key === "nutrition")!;
    expect(g.budgeted).toEqual(Array<number>(12).fill(900));
    expect([g.budgetedTotal, g.ownRows, g.hasBudget, g.distribution, g.accountsSum]).toEqual([10800, false, true, null, null]);
  });

  it("leaves accountsSum out when the contas match the grupo", () => {
    const budgets = [...budgetLine("nutrition", 900), ...BUDGETS.filter((b) => b.accountId !== undefined)];
    expect(budgetView({ ...INPUTS, budgets }, 2025, 10, TODAY).groups.find((g) => g.key === "nutrition")!.accountsSum).toBeNull();
  });

  it("places each row on its calendar month", () => {
    const g = budgetView(
      { budgets: [row("pasture", "2025-10", 700), row("pasture", "2026-09", 300)], expenses: [], accounts: [], planGroups: GROUPS },
      2025, 10, TODAY
    ).groups[0];
    expect(g.budgeted).toEqual([700, ...Array<number>(10).fill(0), 300]);
  });

  it("reads only the rows of its own safra", () => {
    const budgets = [...BUDGETS, ...budgetLine("admin", 700, {}, 2026)];
    const admin = budgetView({ ...INPUTS, budgets }, 2025, 10, TODAY).groups.find((g) => g.key === "admin")!;
    expect(admin.budgetedTotal).toBe(6000);
  });

  it("spreads saved months over two safras when the safra starts elsewhere", () => {
    // Administrativo of out/25–set/26, read with the safra starting in janeiro.
    const inputs: BudgetInputs = { budgets: budgetLine("admin", 500), expenses: [], accounts: [], planGroups: GROUPS };
    expect(budgetView(inputs, 2025, 1, TODAY).groups[0].budgeted).toEqual([...Array<number>(9).fill(0), 500, 500, 500]);
    expect(budgetView(inputs, 2026, 1, TODAY).groups[0].budgeted).toEqual([...Array<number>(9).fill(500), 0, 0, 0]);
  });
});

describe("budgetView: previsto até o fim", () => {
  it("takes, from today's month on, the larger of each month's orçado and its despesas already generated", () => {
    // 2150 past + fev max(1000, 400 + 300) + mar max(1000, parcela 300) + 6 × 1000.
    expect(nutrition.forecast).toBe(10150);
    expect(conta("nut-racao").forecast).toBe(600 + 500 + 500 + 6 * 500);
    // Administrativo spent 1000 in fev over a 500 orçado.
    expect(budgetGroup("admin").forecast).toBe(2000 + 1000 + 7 * 500);
    // A parcela of 2000 in abril goes over that month's 500.
    const parcela = budgetView(
      { ...INPUTS, expenses: [...INPUTS.expenses, expense("adm-abr", { category: "admin", date: "2026-04-10", amountBrl: 2000 })] },
      2025, 10, TODAY
    ).groups.find((g) => g.key === "admin")!;
    expect(parcela.forecast).toBe(2000 + 1000 + 500 + 2000 + 5 * 500);
  });

  it("keeps a grupo or conta with neither orçado nor realizado whose despesas are still ahead", () => {
    // Salário as a recorrência from março, Mão de obra without orçado; Silagem bought in abril.
    const salario = safraMonths(2025, 10)
      .slice(5)
      .map((m, i) =>
        expense(`salario-${m.key}`, {
          category: "labor",
          date: `${m.key}-05`,
          amountBrl: 2000,
          seriesId: "salario",
          seriesIndex: i + 1,
          seriesFrequency: "monthly",
        })
      );
    const silagem = expense("sil-abr", { accountId: "nut-sil", date: "2026-04-10", amountBrl: 50 });
    const ahead = budgetView({ ...INPUTS, expenses: [...INPUTS.expenses, ...salario, silagem] }, 2025, 10, TODAY);
    const labor = ahead.groups.find((g) => g.category === "labor")!;
    expect([labor.hasBudget, labor.realizedToDate, labor.usedPct, labor.tone]).toEqual([false, 0, null, "none"]);
    expect(labor.forecast).toBe(7 * 2000);
    const sil = ahead.groups.find((g) => g.key === "nutrition")!.accounts.find((a) => a.accountId === "nut-sil")!;
    expect([sil.hasBudget, sil.realizedToDate, sil.forecast]).toEqual([false, 0, 50]);
  });

  it("is the orçado before the safra starts", () => {
    const next = budgetView({ ...INPUTS, budgets: budgetLine("admin", 700, {}, 2026) }, 2026, 10, TODAY);
    const admin = next.groups[0];
    expect(next.todayIndex).toBe(-1);
    expect(next.groups.map((g) => g.key)).toEqual(["admin"]);
    expect([admin.realizedToDate, admin.budgetedToDate, admin.usedPct, admin.tone]).toEqual([0, 0, null, "none"]);
    expect(admin.realized).toEqual(months());
    expect(admin.forecast).toBe(8400);
  });

  it("is the realizado once the safra is over", () => {
    const past = budgetView(INPUTS, 2025, 10, "2026-10-02");
    expect(past.todayIndex).toBe(12);
    for (const g of past.groups) {
      for (const l of [g, ...g.accounts]) expect(l.forecast).toBe(l.realizedToDate);
    }
    const g = past.groups.find((g) => g.key === "nutrition")!;
    expect([g.realizedToDate, g.budgetedToDate, g.usedPct]).toEqual([3150, 12000, 26.25]);
  });
});

describe("budgetView: % usado and its tone", () => {
  // Pastagem budgeted R$ 3,00 (or `budget`) in outubro; today in outubro.
  const pastureView = (spent: number, budget = 3) =>
    budgetView(
      {
        budgets: [row("pasture", "2025-10", budget)],
        expenses: [expense("p", { category: "pasture", date: "2025-10-01", amountBrl: spent })],
        accounts: [],
        planGroups: GROUPS,
      },
      2025, 10, "2025-10-20"
    );
  const pasture = (spent: number, budget = 3) => pastureView(spent, budget).groups[0];

  it("is brand up to 90 %, attention up to 100 %, overdue above", () => {
    expect(pasture(2.7).usedPct).toBe(90);
    expect(pasture(3).usedPct).toBe(100);
    expect([2.7, 3, 3.03].map((v) => pasture(v).tone)).toEqual(["brand", "attention", "overdue"]);
  });

  it("takes the tone from the % as shown, rounded to the integer", () => {
    // Of R$ 10,00: 90,4 % reads "90 %", 100,4 % reads "100 %".
    expect([pasture(9.04, 10).usedPct, pasture(10.04, 10).usedPct]).toEqual([90.4, 100.4]);
    expect([9.04, 9.05, 10.04, 10.05].map((v) => pasture(v, 10).tone)).toEqual([
      "brand",
      "attention",
      "attention",
      "overdue",
    ]);
    expect(pastureView(10.04, 10).totals.tone).toBe("attention");
    expect(pastureView(10.04, 10).over).toEqual([]);
    expect(pastureView(10.05, 10).over).toEqual([{ label: "Pastagem", usedPct: 100.5 }]);
  });

  it("is none without orçado up to today's month", () => {
    const g = budgetView(
      { ...INPUTS, budgets: [row("nutrition", "2025-12", 500)] },
      2025, 10, "2025-10-20"
    ).groups.find((g) => g.key === "nutrition")!;
    expect([g.hasBudget, g.budgetedToDate, g.realizedToDate, g.usedPct, g.tone]).toEqual([true, 0, 350, null, "none"]);
  });
});

describe("budgetView: totals and grupos over", () => {
  it("adds up the grupos with a budget only", () => {
    // Sanidade's 150 in novembro has no orçado: its row shows it, the totals do not.
    expect(view.totals.budgeted).toEqual(Array<number>(12).fill(1500));
    expect(view.totals.realized).toEqual(months(350, 600, 2000, 1200, 1400));
    expect(view.totals).toMatchObject({
      budgetedTotal: 18000,
      budgetedToDate: 7500,
      realizedToDate: 5550,
      forecast: 10150 + 6500,
      usedPct: 74,
      tone: "brand",
    });
    expect(view.over).toEqual([{ label: "Administrativo", usedPct: 120 }]);
  });

  it("is not above the orçado for what grupos without one spent", () => {
    // Pastagem and Administrativo budgeted 100 each; Sanidade has no orçado.
    const two = budgetView(
      {
        budgets: [row("pasture", "2025-10", 100), row("admin", "2025-10", 100)],
        expenses: [
          expense("p", { category: "pasture", amountBrl: 90 }),
          expense("a", { category: "admin", amountBrl: 95 }),
          expense("vac", { category: "health", date: "2025-10-05", amountBrl: 500 }),
        ],
        accounts: [],
        planGroups: GROUPS,
      },
      2025, 10, "2025-10-20"
    );
    expect(two.groups.map((g) => [g.key, g.tone])).toEqual([["admin", "attention"], ["pasture", "brand"], ["health", "none"]]);
    expect(two.totals).toMatchObject({ budgetedToDate: 200, realizedToDate: 185, usedPct: 92.5, tone: "attention" });
  });

  it("lists at most three grupos over 100 %, worst first", () => {
    const spent: [ExpenseCategory, number][] = [["nutrition", 150], ["pasture", 110], ["labor", 300], ["admin", 200]];
    const over = budgetView(
      {
        budgets: spent.map(([category]) => row(category, "2025-10", 100)),
        expenses: spent.map(([category, amountBrl]) => expense(category, { category, amountBrl })),
        accounts: [],
        planGroups: GROUPS,
      },
      2025, 10, "2025-10-20"
    ).over;
    expect(over).toEqual([
      { label: "Mão de obra", usedPct: 300 },
      { label: "Administrativo", usedPct: 200 },
      { label: "Nutrição", usedPct: 150 },
    ]);
  });
});

describe("budgetView with archived grupos", () => {
  const groups: PlanGroup[] = [
    group("g-maq", "expense", "Máquinas e veículos"),
    group("g-arr", "expense", "Arrendamento", "2026-01-05T00:00:00.000Z"),
    group("g-old", "expense", "Grupo velho", "2025-06-01T00:00:00.000Z"),
  ];
  const farm: BudgetInputs = {
    budgets: [...budgetLine("g-maq", 200), ...budgetLine("g-arr", 1000)],
    expenses: [
      expense("diesel", { category: "g-maq", accountId: "maq-diesel", amountBrl: 150 }),
      expense("renda", { category: "g-arr", amountBrl: 1000 }),
    ],
    accounts: [{ id: "maq-diesel", group: "g-maq", name: "Diesel" }],
    planGroups: groups,
  };

  it("lists them by name, an archived one while it has orçado or despesas in the safra", () => {
    const farmView = budgetView(farm, 2025, 10, TODAY);
    expect(farmView.groups.map((g) => [g.key, g.label, g.budgetedTotal, g.realizedToDate])).toEqual([
      ["g-arr", "Arrendamento", 12000, 1000],
      ["g-maq", "Máquinas e veículos", 2400, 150],
    ]);
    expect(farmView.groups[1].accounts.map((a) => [a.label, a.realizedToDate])).toEqual([["Diesel", 150]]);
    expect(budgetView({ ...farm, budgets: [] }, 2025, 10, TODAY).groups.map((g) => g.key)).toEqual(["g-arr", "g-maq"]);
    expect(budgetView({ ...farm, budgets: [], expenses: [] }, 2025, 10, TODAY).groups).toEqual([]);
  });

  it("leaves an archived grupo out of the copy into the next safra", () => {
    expect(copyPlan(farm, 2025, 2026, "budgeted", 0, 10, TODAY)).toEqual({
      lines: [{ category: "g-maq", accountId: null, months: Array<number>(12).fill(200) }],
      skipped: 0,
    });
    expect(copyPlan(farm, 2025, 2026, "realized", 0, 10, TODAY).lines.map((l) => l.category)).toEqual(["g-maq"]);
  });
});

describe("previousShape", () => {
  it("is the safra before's realizado of the line", () => {
    expect(previousShape(INPUTS, "nutrition", 2025, 10, TODAY)).toEqual([600, ...Array<number>(10).fill(0), 999]);
    expect(previousShape(INPUTS, "nutrition:nut-sal", 2025, 10, TODAY)).toEqual(months(600));
    expect(previousShape(INPUTS, "admin", 2025, 10, TODAY)).toEqual(months());
  });

  it("feeds distribute", () => {
    const shape = previousShape(INPUTS, "nutrition", 2025, 10, TODAY);
    expect(distribute(3198, "previous", shape)).toEqual([1200, ...Array<number>(10).fill(0), 1998]);
  });
});

describe("copyPlan", () => {
  // Safra 2026/27 already has Administrativo and Sal mineral.
  const target: BudgetInputs = {
    ...INPUTS,
    budgets: [
      ...BUDGETS,
      ...budgetLine("admin", 700, {}, 2026),
      ...budgetLine("nutrition", 450, { accountId: "nut-sal" }, 2026),
    ],
  };
  /** Safra 2026/27 with Administrativo only. */
  const onlyAdmin: BudgetInputs = { ...INPUTS, budgets: [...BUDGETS, ...budgetLine("admin", 700, {}, 2026)] };

  it("copies the orçado lines without budget in the target, with the %", () => {
    const { lines, skipped } = copyPlan(onlyAdmin, 2025, 2026, "budgeted", 5, 10, TODAY);
    expect(skipped).toBe(1);
    expect(lines).toEqual([
      { category: "nutrition", accountId: null, months: Array<number>(12).fill(1050) },
      { category: "nutrition", accountId: "nut-racao", months: Array<number>(12).fill(525) },
      { category: "nutrition", accountId: "nut-sal", months: Array<number>(12).fill(420) },
    ]);
  });

  it("never writes a grupo line over a grupo budgeted through its contas", () => {
    // Nutrição has rows in 2026 through Sal mineral only: its own line stays out, orçado or realizado.
    const budgeted = copyPlan(target, 2025, 2026, "budgeted", 5, 10, TODAY);
    expect(budgeted.skipped).toBe(3);
    expect(budgeted.lines).toEqual([
      { category: "nutrition", accountId: "nut-racao", months: Array<number>(12).fill(525) },
    ]);
    const realized = copyPlan(target, 2025, 2026, "realized", 0, 10, TODAY);
    expect(realized.skipped).toBe(2);
    expect(realized.lines.map((l) => l.category)).toEqual(["health"]);
  });

  it("rounds each month to the centavo", () => {
    const inputs: BudgetInputs = { budgets: budgetLine("pasture", distribute(100, "equal")), expenses: [], accounts: [], planGroups: GROUPS };
    expect(copyPlan(inputs, 2025, 2026, "budgeted", 5, 10, TODAY).lines[0].months).toEqual([
      ...Array<number>(11).fill(8.75),
      8.79,
    ]);
  });

  it("copies the realizado as grupo lines only", () => {
    const { lines, skipped } = copyPlan(onlyAdmin, 2025, 2026, "realized", 0, 10, TODAY);
    expect(skipped).toBe(1);
    expect(lines).toEqual([
      { category: "nutrition", accountId: null, months: months(350, 600, 0, 1200, 400) },
      { category: "health", accountId: null, months: months(0, 150) },
    ]);
  });
});
