import { describe, expect, it } from "vitest";
import {
  cashSummary,
  EMPTY_FILTER,
  effectiveDueDate,
  filterLedger,
  ledgerRows,
  ledgerSummary,
  matchesStatusChoice,
  pendingBills,
  type LedgerFilter,
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
const filtered = (filter: Partial<LedgerFilter>) => ids(filterLedger(rows, { ...EMPTY_FILTER, ...filter }));

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
      date: "2026-09-10",
      dueDate: "2026-09-10",
      paidAt: "2026-09-10",
      status: "paid",
      group: "nutrition",
      groupLabel: "Nutrição",
      account: "Sal mineral",
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

  it("builds a venda from its manejo session", () => {
    expect(row("s-sale")).toEqual({
      id: "s-sale",
      kind: "sale",
      date: "2026-09-05",
      dueDate: "2026-09-05",
      paidAt: "2026-09-05",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: null,
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

  it("builds a compra as capital, with the live arrobas and a deleted lote's name", () => {
    expect(row("s-entry")).toMatchObject({
      kind: "purchase",
      status: "paid",
      group: "capital",
      groupLabel: "Capital",
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
      date: "2026-09-08",
      dueDate: "2026-09-08",
      paidAt: "2026-09-08",
      status: "paid",
      group: "health",
      groupLabel: "Sanidade",
      account: null,
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

describe("filterLedger", () => {
  it("returns every row with the empty filter", () => {
    expect(filterLedger(rows, EMPTY_FILTER)).toEqual(rows);
  });

  it("filters by tipo", () => {
    expect(filtered({ kind: "sale" })).toEqual(["s-sale", "mov-legacy"]);
    expect(filtered({ kind: "treatment" })).toEqual([TREATMENT_ID]);
  });

  it("filters by grupo", () => {
    expect(filtered({ group: "revenue" })).toEqual(["r-pending", "r-received", "s-sale", "mov-legacy"]);
    expect(filtered({ group: "capital" })).toEqual(["s-entry"]);
    expect(filtered({ group: "health" })).toEqual([TREATMENT_ID]);
  });

  it("filters by conta", () => {
    expect(filtered({ accountId: "acc-sal" })).toEqual(["e-paid-lot"]);
  });

  it("filters by lote, and by the farm's own rows", () => {
    expect(filtered({ lotId: "lot-1" })).toEqual(["e-paid-lot", "s-sale"]);
    expect(filtered({ lotId: "lot-2" })).toEqual(["s-entry"]);
    expect(filtered({ lotId: "farm" })).toEqual([
      "e-future",
      "r-pending",
      "r-received",
      TREATMENT_ID,
      "e-overdue",
      "e-paid",
      "mov-legacy",
    ]);
  });

  it("filters by status", () => {
    expect(filtered({ status: "overdue" })).toEqual(["e-overdue"]);
    expect(filtered({ status: "payable" })).toEqual(["e-future"]);
    expect(filtered({ status: "receivable" })).toEqual(["r-pending"]);
    expect(filtered({ status: "received" })).toEqual(["r-received", "s-sale", "mov-legacy"]);
  });

  it("searches ignoring case and accents", () => {
    expect(filtered({ search: "agrovet" })).toEqual(["e-paid-lot"]);
    expect(filtered({ search: "Agrovét" })).toEqual(["e-paid-lot"]);
    expect(filtered({ search: "  AGROVET " })).toEqual(["e-paid-lot"]);
  });

  it("searches conta, documento, notes and grupo", () => {
    expect(filtered({ search: "aluguel" })).toEqual(["r-received"]);
    expect(filtered({ search: "nf 4.812" })).toEqual(["e-paid-lot"]);
    expect(filtered({ search: "salario" })).toEqual(["e-paid"]);
    expect(filtered({ search: "manejo" })).toEqual(["s-sale", "s-entry"]);
    expect(filtered({ search: "sanidade" })).toEqual([TREATMENT_ID]);
  });

  it("combines filters", () => {
    expect(filtered({ kind: "expense", status: "paid" })).toEqual(["e-paid-lot", "e-paid"]);
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

describe("ledgerSummary", () => {
  it("adds up the rows given", () => {
    expect(ledgerSummary(rows)).toEqual({
      revenue: 18580, // receitas 2.700 + vendas 15.880
      coe: 5515, // despesas 5.500 + treatments 15
      sales: 15880,
      purchases: 8000,
      result: 13065,
    });
    expect(ledgerSummary([])).toEqual({ revenue: 0, coe: 0, sales: 0, purchases: 0, result: 0 });
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

describe("matchesStatusChoice", () => {
  it("counts the vencidas under a pagar and a receber by kind", () => {
    const lateBill = { kind: "expense", status: "overdue" } as const;
    const lateReceita = { kind: "revenue", status: "overdue" } as const;
    expect(matchesStatusChoice(lateBill, "payable")).toBe(true);
    expect(matchesStatusChoice(lateBill, "receivable")).toBe(false);
    expect(matchesStatusChoice(lateReceita, "receivable")).toBe(true);
    expect(matchesStatusChoice(lateReceita, "payable")).toBe(false);
    expect(matchesStatusChoice(lateReceita, "overdue")).toBe(true);
    expect(matchesStatusChoice({ kind: "expense", status: "payable" }, "overdue")).toBe(false);
    expect(matchesStatusChoice({ kind: "revenue", status: "received" }, "settled")).toBe(true);
  });
});
