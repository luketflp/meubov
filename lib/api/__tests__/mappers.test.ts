/** toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20"). */
import { describe, expect, it } from "vitest";

import { toExpense } from "@/lib/api/mappers";
import type { ExpenseRow, ExpenseSeriesRow } from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-27",
  category: "nutrition",
  amountBrl: 4000,
  notes: null,
  dueDate: "2026-11-10",
  paidAt: null,
  counterparty: null,
  document: null,
  accountId: null,
  lotId: null,
  seriesId: "s-1",
  seriesIndex: 2,
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
  category: "nutrition",
  amountBrl: 12000,
  accountId: null,
  lotId: null,
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
});
