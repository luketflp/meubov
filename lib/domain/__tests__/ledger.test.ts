import { describe, expect, it } from "vitest";
import {
  cashSummary,
  effectiveDueDate,
  ledgerRows,
  pendingBills,
  type LedgerInputs,
  type LedgerRow,
} from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import type { Account, Expense, Lot, Movement } from "@/lib/types";
import { makeAnimal, makeManejoSession, makeTreatment } from "./fixtures";

const TODAY = "2026-09-24";
const PERIOD: Period = { start: "2026-07-01", end: "2026-09-30" };
const TREATMENT_ID = "treatment:2026-09-08:Vacina aftosa";

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "e",
  kind: "expense",
  date: "2026-09-01",
  category: "other",
  amountBrl: 100,
  ...overrides,
});

const lots: Lot[] = [
  { id: "lot-1", name: "Lote do Rio" },
  { id: "lot-2", name: "Engorda", deletedAt: "2026-09-21T12:00:00.000Z" },
];

const accounts: Account[] = [
  { id: "acc-sal", group: "nutrition", name: "Sal mineral" },
  { id: "acc-aluguel", group: "revenue", name: "Aluguel de pasto" },
];

const expenses: Expense[] = [
  expense({
    id: "e-paid-lot",
    date: "2026-09-10",
    category: "nutrition",
    amountBrl: 1200,
    paidAt: "2026-09-10",
    accountId: "acc-sal",
    lotId: "lot-1",
    counterparty: "Agrovét Casa do Campo",
    document: "NF 4.812",
  }),
  expense({
    id: "e-paid",
    date: "2026-08-05",
    category: "labor",
    amountBrl: 3000,
    paidAt: "2026-08-06",
    counterparty: "João Pereira",
    notes: "Salário de agosto",
  }),
  expense({
    id: "e-future",
    date: "2026-09-20",
    dueDate: "2026-10-10",
    category: "pasture",
    amountBrl: 800,
  }),
  expense({
    id: "e-overdue",
    date: "2026-09-05",
    dueDate: "2026-09-15",
    category: "admin",
    amountBrl: 500,
    counterparty: "Copel",
  }),
  expense({
    id: "r-received",
    kind: "revenue",
    date: "2026-09-12",
    amountBrl: 2000,
    paidAt: "2026-09-14",
    accountId: "acc-aluguel",
    counterparty: "Fazenda Vizinha",
  }),
  expense({
    id: "r-pending",
    kind: "revenue",
    date: "2026-09-18",
    dueDate: "2026-10-18",
    amountBrl: 700,
    counterparty: "Sítio Boa Vista",
  }),
  // Competência before the window, paid inside it: caixa only.
  expense({ id: "e-old", date: "2026-06-20", amountBrl: 400, paidAt: "2026-07-02" }),
];

const animals = [
  makeAnimal({ id: "a-101", earTag: "BR-101", lotId: "lot-1", active: false }),
  makeAnimal({ id: "a-102", earTag: "BR-102", lotId: "lot-1", active: false }),
  makeAnimal({ id: "a-201", earTag: "BR-201", lotId: "lot-2", category: "calf" }),
  makeAnimal({ id: "a-202", earTag: "BR-202", lotId: "lot-2", category: "calf" }),
];

const saleSession = makeManejoSession({
  id: "s-sale",
  name: "Venda",
  date: "2026-09-05",
  status: "closed",
  kind: "sale",
  weighing: true,
  counterparty: "Frigorífico Boi Bom",
  pricePerArroba: 300,
  carcassYieldPct: 52,
  animals: [
    // 500 kg × 52% ÷ 15 = 17,33 @ × R$ 300 = R$ 5.200; 450 kg → 15,6 @ → R$ 4.680
    { earTag: "BR-101", outcome: "done", weightKg: 500, amountBrl: 5200 },
    { earTag: "BR-102", outcome: "done", weightKg: 450, amountBrl: 4680 },
  ],
});

const entrySession = makeManejoSession({
  id: "s-entry",
  name: "Compra",
  date: "2026-08-20",
  status: "closed",
  kind: "entry",
  weighing: true,
  counterparty: "Fazenda Santa Rita",
  destinationLotId: "lot-2",
  totalAmountBrl: 8000,
  animals: [
    { earTag: "BR-201", outcome: "done", weightKg: 210, createdAnimal: true },
    { earTag: "BR-202", outcome: "done", weightKg: 240, createdAnimal: true },
  ],
});

const movements: Movement[] = [
  { id: "mov-legacy", type: "sale", date: "2026-07-15", quantity: 3, origin: "Lote A", destination: "Leilão Central", amountBrl: 6000 },
  { id: "s-entry", type: "purchase", date: "2026-08-20", quantity: 2, category: "calf", origin: "Fazenda Santa Rita", destination: "Engorda", amountBrl: 8000 },
  { id: "s-sale", type: "sale", date: "2026-09-05", quantity: 2, category: "steer", origin: "Lote do Rio", destination: "Frigorífico Boi Bom", amountBrl: 9880 },
  { id: "mov-unpriced", type: "sale", date: "2026-09-02", origin: "Lote A", destination: "Externo" },
  { id: "mov-transfer", type: "transfer", date: "2026-09-03", quantity: 5, origin: "Lote do Rio", destination: "Engorda" },
];

const treatments = [
  makeTreatment({ id: "t-1", animalEarTag: "BR-101", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-2", animalEarTag: "BR-102", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-3", animalEarTag: "BR-201", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-4", animalEarTag: "BR-202", date: "2026-09-08", status: "done" }),
  makeTreatment({ id: "t-5", animalEarTag: "BR-101", date: "2026-09-28", status: "scheduled", costBrl: 5 }),
];

const input: LedgerInputs = {
  expenses,
  accounts,
  movements,
  manejoSessions: [saleSession, entrySession],
  animals,
  treatments,
  lots,
};

const rows = ledgerRows(input, PERIOD, TODAY);
const row = (id: string): LedgerRow => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};
const ids = (list: LedgerRow[]) => list.map((r) => r.id);

describe("ledgerRows", () => {
  it("lists the window's lançamentos, vendas, compras and treatment days, newest first", () => {
    // Same day: a venda comes before a despesa.
    expect(ids(rows)).toEqual([
      "e-future",
      "r-pending",
      "r-received",
      "e-paid-lot",
      TREATMENT_ID,
      "s-sale",
      "e-overdue",
      "s-entry",
      "e-paid",
      "mov-legacy",
    ]);
  });

  it("leaves out entries dated outside the window, unpriced movements, transfers and treatments without cost", () => {
    expect(ids(rows)).not.toContain("e-old");
    expect(ids(rows)).not.toContain("mov-unpriced");
    expect(ids(rows)).not.toContain("mov-transfer");
  });

  it("gives each row its status", () => {
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      "e-future": "payable",
      "r-pending": "receivable",
      "r-received": "received",
      "e-paid-lot": "paid",
      [TREATMENT_ID]: "paid",
      "s-sale": "received",
      "e-overdue": "overdue",
      "s-entry": "paid",
      "e-paid": "paid",
      "mov-legacy": "received",
    });
  });

  it("fills a lançamento from the expense, its conta and its lote", () => {
    expect(row("e-paid-lot")).toEqual({
      id: "e-paid-lot",
      kind: "expense",
      inflow: false,
      date: "2026-09-10",
      dueDate: "2026-09-10",
      paidAt: "2026-09-10",
      status: "paid",
      group: "nutrition",
      groupLabel: "Nutrição",
      account: "Sal mineral",
      bankAccountId: null,
      counterparty: "Agrovét Casa do Campo",
      document: "NF 4.812",
      lotId: "lot-1",
      lotName: "Lote do Rio",
      amountBrl: 1200,
      notes: null,
      locked: false,
      headCount: null,
      expense: expenses[0],
    });
    expect(row("r-received")).toMatchObject({
      kind: "revenue",
      group: "revenue",
      groupLabel: "Receitas",
      account: "Aluguel de pasto",
      lotId: null,
      lotName: null,
    });
    expect(row("e-overdue")).toMatchObject({ dueDate: "2026-09-15", paidAt: null });
    expect(row("e-paid")).toMatchObject({ account: null, notes: "Salário de agosto" });
  });

  it("carries the conta bancária of a paid lançamento and of a venda", () => {
    const rows = ledgerRows(
      {
        ...input,
        expenses: [{ ...expenses[0], bankAccountId: "sicredi" }],
        movements: [{ id: "legacy-sale", type: "sale", date: "2026-09-12", origin: "A", destination: "B", amountBrl: 10, bankAccountId: "bb" }],
      },
      PERIOD,
      TODAY
    );
    expect(rows.find((r) => r.id === "e-paid-lot")?.bankAccountId).toBe("sicredi");
    expect(rows.find((r) => r.id === "legacy-sale")?.bankAccountId).toBe("bb");
  });

  it("builds a venda from its manejo session", () => {
    expect(row("s-sale")).toEqual({
      id: "s-sale",
      kind: "sale",
      inflow: true,
      date: "2026-09-05",
      dueDate: "2026-09-05",
      paidAt: "2026-09-05",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: "Venda de gado",
      bankAccountId: null,
      counterparty: "Frigorífico Boi Bom",
      document: "manejo · 2 animais · 32,9 @",
      lotId: "lot-1",
      lotName: "Lote do Rio",
      amountBrl: 9880,
      notes: null,
      locked: true,
      headCount: 2,
      expense: null,
    });
  });

  it("builds a compra as capital under Investimentos, with the live arrobas and a deleted lote's name", () => {
    expect(row("s-entry")).toMatchObject({
      kind: "purchase",
      inflow: false,
      status: "paid",
      group: "capital",
      groupLabel: "Investimentos",
      account: "Compra de gado",
      counterparty: "Fazenda Santa Rita",
      document: "manejo · 2 animais · 15,0 @",
      lotId: "lot-2",
      lotName: "Engorda",
      amountBrl: 8000,
      headCount: 2,
      locked: true,
    });
  });

  it("builds a legacy venda from the movement alone", () => {
    expect(row("mov-legacy")).toMatchObject({
      kind: "sale",
      counterparty: "Leilão Central",
      document: null,
      lotId: null,
      lotName: null,
      headCount: 3,
      amountBrl: 6000,
      locked: true,
    });
  });

  it("drops the arrobas from the document when the venda has none", () => {
    const lotSale = makeManejoSession({
      id: "s-lot",
      date: "2026-09-09",
      status: "closed",
      kind: "sale",
      counterparty: "Vizinho",
      totalAmountBrl: 5000,
      animals: [{ earTag: "BR-101", outcome: "done" }],
    });
    const [only] = ledgerRows(
      {
        ...input,
        expenses: [],
        treatments: [],
        manejoSessions: [lotSale],
        movements: [{ id: "s-lot", type: "sale", date: "2026-09-09", quantity: 1, origin: "Lote do Rio", destination: "Vizinho", amountBrl: 5000 }],
      },
      PERIOD,
      TODAY
    );
    expect(only).toMatchObject({ document: "manejo · 1 animal", headCount: 1, lotId: "lot-1" });
  });

  it("sums a day's done treatments with cost into one Sanidade row", () => {
    expect(row(TREATMENT_ID)).toEqual({
      id: TREATMENT_ID,
      kind: "treatment",
      inflow: false,
      date: "2026-09-08",
      dueDate: "2026-09-08",
      paidAt: "2026-09-08",
      status: "paid",
      group: "health",
      groupLabel: "Sanidade",
      account: null,
      bankAccountId: null,
      counterparty: null,
      document: null,
      lotId: null,
      lotName: null,
      amountBrl: 15,
      notes: "Vacina aftosa",
      locked: true,
      headCount: 3,
      expense: null,
    });
  });
});

describe("cashSummary", () => {
  it("counts caixa by payment day and pending bills of any date", () => {
    expect(cashSummary(input, PERIOD, TODAY)).toEqual({
      received: 17880, // receita 2.000 + vendas 9.880 + 6.000
      receivable: 700,
      receivableCount: 1,
      paid: 12615, // 1.200 + 3.000 + 400 (dated June, paid July) + treatments 15 + compra 8.000
      payable: 1300,
      payableCount: 2,
      overdueCount: 1,
      balance: 5265,
    });
  });

  it("counts a priced compra de gado in the window as pago", () => {
    const base = cashSummary({ ...input, movements: [] }, PERIOD, TODAY);
    const purchase = (overrides: Partial<Movement>): Movement => ({
      id: "p",
      type: "purchase",
      date: "2026-09-10",
      origin: "Fazenda Santa Rita",
      destination: "Engorda",
      amountBrl: 3000,
      ...overrides,
    });
    const priced = cashSummary({ ...input, movements: [purchase({})] }, PERIOD, TODAY);
    expect(priced.paid).toBe(base.paid + 3000);
    expect(priced.balance).toBe(base.balance - 3000);
    const ignored = cashSummary(
      {
        ...input,
        movements: [purchase({ amountBrl: undefined }), purchase({ date: "2026-06-30" })],
      },
      PERIOD,
      TODAY
    );
    expect(ignored).toEqual(base);
  });

  it("counts only despesas as vencidas, not a late receita", () => {
    const lateRevenue = expense({ id: "r-late", kind: "revenue", date: "2026-08-01", dueDate: "2026-08-31" });
    const summary = cashSummary({ ...input, expenses: [...expenses, lateRevenue] }, PERIOD, TODAY);
    expect(summary.overdueCount).toBe(1);
    expect(summary.receivableCount).toBe(2);
  });
});

describe("pendingBills", () => {
  it("splits pending lançamentos, oldest vencimento first", () => {
    const { payables, receivables } = pendingBills(expenses, TODAY);
    expect(payables.map((e) => e.id)).toEqual(["e-overdue", "e-future"]);
    expect(receivables.map((e) => e.id)).toEqual(["r-pending"]);
  });
});

describe("effectiveDueDate", () => {
  it("is the vencimento, or the date when there is none", () => {
    expect(effectiveDueDate(expense({ date: "2026-08-05" }))).toBe("2026-08-05");
    expect(effectiveDueDate(expense({ date: "2026-09-05", dueDate: "2026-09-15" }))).toBe("2026-09-15");
  });
});

describe("money outside the resultado", () => {
  const capitalAccounts: Account[] = [
    ...accounts,
    { id: "acc-maq", group: "investment", name: "Máquinas e implementos" },
    { id: "acc-pronaf", group: "financing", name: "Pronaf custeio" },
    { id: "acc-lucro", group: "partners", name: "Distribuição de lucro" },
  ];
  const capital: Expense[] = [
    expense({ id: "c-trator", kind: "investment", flow: "out", date: "2026-09-10", amountBrl: 50000, paidAt: "2026-09-10", accountId: "acc-maq" }),
    expense({ id: "c-sucata", kind: "investment", flow: "in", date: "2026-09-11", amountBrl: 2000, paidAt: "2026-09-11", accountId: "acc-maq" }),
    // Pending, due after today: a receber.
    expense({ id: "c-liberacao", kind: "financing", flow: "in", date: "2026-09-20", dueDate: "2026-10-05", amountBrl: 80000, accountId: "acc-pronaf" }),
    // Pending, past due: vencida.
    expense({ id: "c-parcela", kind: "financing", flow: "out", date: "2026-09-05", dueDate: "2026-09-15", amountBrl: 4000, accountId: "acc-pronaf" }),
    expense({ id: "c-retirada", kind: "partners", flow: "out", date: "2026-09-12", amountBrl: 6000, paidAt: "2026-09-12", accountId: "acc-lucro" }),
    expense({ id: "c-aporte", kind: "partners", flow: "in", date: "2026-09-13", amountBrl: 10000, paidAt: "2026-09-13", accountId: "acc-lucro" }),
    // No flow: a compra (money out), pending and past its date.
    expense({ id: "c-sem-flow", kind: "investment", date: "2026-09-14", amountBrl: 700, accountId: "acc-maq" }),
    expense({ id: "c-rendimento", kind: "yield", date: "2026-09-22", amountBrl: 312.5, paidAt: "2026-09-22", bankAccountId: "aplic" }),
  ];
  const capitalInput: LedgerInputs = { ...input, expenses: capital, accounts: capitalAccounts, movements: [], treatments: [] };
  const capitalRows = ledgerRows(capitalInput, PERIOD, TODAY);

  it("gives each row its grupo, its conta, its direction and a status by direction", () => {
    expect(capitalRows.map((r) => [r.id, r.kind, r.inflow, r.group, r.groupLabel, r.account, r.status])).toEqual([
      ["c-rendimento", "yield", true, "capital", "Rendimento", null, "received"],
      ["c-liberacao", "financing", true, "financing", "Financiamentos", "Pronaf custeio", "receivable"],
      ["c-sem-flow", "investment", false, "investment", "Investimentos", "Máquinas e implementos", "overdue"],
      ["c-aporte", "partners", true, "partners", "Sócios", "Distribuição de lucro", "received"],
      ["c-retirada", "partners", false, "partners", "Sócios", "Distribuição de lucro", "paid"],
      ["c-sucata", "investment", true, "investment", "Investimentos", "Máquinas e implementos", "received"],
      ["c-trator", "investment", false, "investment", "Investimentos", "Máquinas e implementos", "paid"],
      ["c-parcela", "financing", false, "financing", "Financiamentos", "Pronaf custeio", "overdue"],
    ]);
  });

  it("orders the new kinds after the despesas on the same day", () => {
    const day = "2026-09-10";
    const sameDay = ledgerRows(
      {
        ...capitalInput,
        expenses: [
          expense({ id: "a-yield", kind: "yield", date: day, paidAt: day }),
          expense({ id: "b-partners", kind: "partners", flow: "out", date: day }),
          expense({ id: "c-financing", kind: "financing", flow: "out", date: day }),
          expense({ id: "d-investment", kind: "investment", flow: "out", date: day }),
          expense({ id: "e-expense", date: day }),
          expense({ id: "f-revenue", kind: "revenue", date: day }),
        ],
        movements: [{ id: "g-purchase", type: "purchase", date: day, origin: "A", destination: "B", amountBrl: 10 }],
      },
      PERIOD,
      TODAY
    );
    expect(ids(sameDay)).toEqual(["f-revenue", "e-expense", "d-investment", "c-financing", "b-partners", "a-yield", "g-purchase"]);
  });

  it("takes every kind in the caixa and in a pagar / a receber by direction", () => {
    expect(cashSummary(capitalInput, PERIOD, TODAY)).toEqual({
      received: 12312.5, // venda do bem 2.000 + aporte 10.000 + rendimento 312,50
      receivable: 80000, // liberação pendente
      receivableCount: 1,
      paid: 56000, // trator 50.000 + retirada 6.000
      payable: 4700, // parcela 4.000 + compra sem movimento 700
      payableCount: 2,
      overdueCount: 2,
      balance: -43687.5,
    });
  });

  it("splits the pending ones into payables and receivables, oldest vencimento first", () => {
    const { payables, receivables } = pendingBills(capital, TODAY);
    expect(payables.map((e) => e.id)).toEqual(["c-sem-flow", "c-parcela"]);
    expect(receivables.map((e) => e.id)).toEqual(["c-liberacao"]);
  });

  it("changes none of the resultado's rows", () => {
    const together = ledgerRows({ ...input, expenses: [...expenses, ...capital], accounts: capitalAccounts }, PERIOD, TODAY);
    expect(together).toHaveLength(rows.length + capital.length);
    expect(together.filter((r) => !r.id.startsWith("c-"))).toEqual(rows);
  });
});
