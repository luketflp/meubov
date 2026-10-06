/**
 * toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20").
 * toAccount: a financiamento carries its saldo inicial.
 * toExpenseGroup: a farm grupo with its dates in ISO, archivedAt only once archived.
 * toBankAccount: "conciliado até" and the pending count come from its linhas.
 * toBudget: a month of a grupo's or a conta's line, without the farm and audit columns.
 * toFarmData: the início da safra travels with the farm.
 */
import { describe, expect, it } from "vitest";

import { toAccount, toBankAccount, toBudget, toExpense, toExpenseGroup, toFarmData } from "@/lib/api/mappers";
import type {
  BankAccountRow,
  BudgetRow,
  ExpenseGroupRow,
  ExpenseRow,
  ExpenseSeriesRow,
  FarmAccountRow,
  FarmRow,
} from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  flow: null,
  date: "2026-09-27",
  category: "nutrition",
  amountBrl: 4000,
  notes: null,
  dueDate: "2026-11-10",
  paidAt: null,
  history: null,
  counterparty: null,
  document: null,
  accountId: null,
  lotId: null,
  seriesId: "s-1",
  seriesIndex: 2,
  bankAccountId: null,
};

const SERIES: ExpenseSeriesRow = {
  id: "s-1",
  farmId: 7,
  mode: "installments",
  frequency: "monthly",
  dayOfMonth: 10,
  startsOn: "2026-10-10",
  endsOn: null,
  count: 3,
  generatedCount: 3,
  kind: "expense",
  flow: null,
  category: "nutrition",
  amountBrl: 12000,
  accountId: null,
  lotId: null,
  history: null,
  counterparty: null,
  document: null,
  notes: null,
  createdAt: new Date("2026-09-27T12:00:00Z"),
};

describe("toExpense", () => {
  it("gives a parcela its position and count", () => {
    const expense = toExpense(ROW, SERIES, 2);
    expect(expense).toMatchObject({ seriesId: "s-1", seriesIndex: 2, seriesCount: 3, attachmentCount: 2 });
    expect(expense.seriesFrequency).toBeUndefined();
  });

  it("gives an ocorrência its frequency and day, never a count", () => {
    const expense = toExpense(ROW, { ...SERIES, mode: "recurring", count: null, dayOfMonth: 20 });
    expect(expense).toMatchObject({ seriesFrequency: "monthly", seriesDay: 20, attachmentCount: 0 });
    expect(expense.seriesCount).toBeUndefined();
  });

  it("leaves a lançamento typed once without série fields", () => {
    const expense = toExpense({ ...ROW, seriesId: null, seriesIndex: null });
    expect(expense.seriesId).toBeUndefined();
    expect(expense.seriesIndex).toBeUndefined();
    expect(expense.attachmentCount).toBe(0);
  });

  it("carries the movimento of a capital row and leaves it out elsewhere", () => {
    expect(toExpense({ ...ROW, kind: "financing", flow: "in" })).toMatchObject({ kind: "financing", flow: "in" });
    expect(toExpense(ROW).flow).toBeUndefined();
  });
});

const ACCOUNT: FarmAccountRow = {
  id: "acc-1",
  farmId: 7,
  group: "financing",
  name: "Pronaf Sicredi",
  archivedAt: null,
  openingBalanceBrl: 120000,
  openingDate: "2026-06-30",
};

describe("toAccount", () => {
  it("carries the saldo inicial of a financiamento, and nothing when there is none", () => {
    expect(toAccount(ACCOUNT)).toMatchObject({ openingBalanceBrl: 120000, openingDate: "2026-06-30" });
    const plain = toAccount({ ...ACCOUNT, group: "nutrition", openingBalanceBrl: null, openingDate: null });
    expect(plain.openingBalanceBrl).toBeUndefined();
    expect(plain.openingDate).toBeUndefined();
  });
});

describe("toExpenseGroup", () => {
  it("dates the grupo in ISO and leaves archivedAt out while it is active", () => {
    const row: ExpenseGroupRow = {
      id: "g-1",
      farmId: 7,
      name: "Máquinas e veículos",
      archivedAt: null,
      createdAt: new Date("2026-10-01T12:00:00Z"),
    };
    expect(toExpenseGroup(row)).toEqual({
      id: "g-1",
      name: "Máquinas e veículos",
      createdAt: "2026-10-01T12:00:00.000Z",
    });
    expect(toExpenseGroup({ ...row, archivedAt: new Date("2026-10-03T09:00:00Z") }).archivedAt).toBe(
      "2026-10-03T09:00:00.000Z"
    );
  });
});

const BANK: BankAccountRow = {
  id: "b-1",
  farmId: 7,
  kind: "checking",
  name: "Sicredi",
  label: "c/c 12.345-6",
  openingBalanceBrl: 1000,
  openingDate: "2026-08-31",
  isMain: true,
  closingDay: null,
  dueDay: null,
  paysFromId: null,
  csvMapping: null,
  archivedAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

const LINES = {
  pending: 0,
  firstDate: "2026-09-01",
  firstPendingDate: null,
  lastDate: "2026-09-20",
  pendingImportId: null,
  lastImportId: "imp-2",
};

describe("toBankAccount", () => {
  it("is conciliado up to the last linha when nothing waits", () => {
    expect(toBankAccount(BANK, LINES)).toMatchObject({
      pendingLines: 0,
      reconciledUntil: "2026-09-20",
      lastImportId: "imp-2",
      label: "c/c 12.345-6",
      isMain: true,
    });
  });

  it("stops the day before the oldest pending linha and names its import", () => {
    const account = toBankAccount(BANK, {
      ...LINES,
      pending: 12,
      firstPendingDate: "2026-09-16",
      pendingImportId: "imp-1",
    });
    expect(account).toMatchObject({ pendingLines: 12, reconciledUntil: "2026-09-15", pendingImportId: "imp-1" });
  });

  it("says nothing when the very first linha still waits, or there is no extrato", () => {
    expect(toBankAccount(BANK, { ...LINES, pending: 3, firstPendingDate: "2026-09-01" }).reconciledUntil).toBeUndefined();
    expect(toBankAccount(BANK)).toMatchObject({ pendingLines: 0 });
    expect(toBankAccount(BANK).reconciledUntil).toBeUndefined();
  });
});

const BUDGET: BudgetRow = {
  id: "bud-1",
  farmId: 7,
  category: "nutrition",
  accountId: "acc-1",
  month: "2025-10-01",
  amountBrl: 8333.33,
  distribution: "equal",
  updatedAt: new Date("2026-10-02T12:00:00Z"),
  updatedBy: "u-lucas",
};

describe("toBudget", () => {
  it("carries a conta's month and leaves the farm and audit columns behind", () => {
    expect(toBudget(BUDGET)).toEqual({
      id: "bud-1",
      category: "nutrition",
      accountId: "acc-1",
      month: "2025-10-01",
      amountBrl: 8333.33,
      distribution: "equal",
    });
  });

  it("gives a grupo's own line no conta", () => {
    expect(toBudget({ ...BUDGET, accountId: null }).accountId).toBeUndefined();
  });
});

const FARM: FarmRow = {
  id: 7,
  name: "Fazenda Boa Vista",
  municipality: "Uberaba - MG",
  stateRegistration: "",
  manager: "Lucas",
  headquartersLat: null,
  headquartersLng: null,
  headquartersZoom: null,
  deletedAt: null,
  safraStartMonth: 7,
};

describe("toFarmData", () => {
  it("carries the início da safra", () => {
    expect(toFarmData(FARM)).toMatchObject({ name: "Fazenda Boa Vista", safraStartMonth: 7 });
  });
});
