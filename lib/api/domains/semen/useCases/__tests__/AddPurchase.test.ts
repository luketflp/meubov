/**
 * addSemenPurchase: registers a purchase of doses of a bull of the farm, and
 * the Reprodução expense it becomes, in one transaction.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the table and the row and echo it.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every `insert().values()` call, in order. */
    inserts: [] as { table: string; row: Record<string, unknown> }[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function insertBuilder(table: Table) {
  return {
    values: (row: Record<string, unknown>) => {
      state.inserts.push({ table: getTableName(table), row });
      return { returning: () => Promise.resolve([row]) };
    },
  };
}

vi.mock("@/lib/db", () => {
  const handle = { select: selectBuilder, insert: insertBuilder };
  return {
    db: {
      ...handle,
      transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(handle)),
    },
  };
});

import { AddPurchaseUseCase } from "../AddPurchase.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addSemenPurchase", () => {
  it("answers not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[]];

    const result = await new AddPurchaseUseCase().run({
      farmId: 7,
      bullId: "bull-of-another-farm",
      input: { date: "2026-08-20", doses: 20, totalBrl: 800 },
    });

    expect(result).toBe("not_found");
    expect(state.inserts).toEqual([]);
  });

  it("writes the expense, then the purchase pointing at it", async () => {
    state.selectResults = [[{ id: "bull-1", name: "Tufão da Serra" }]];

    const result = await new AddPurchaseUseCase().run({
      farmId: 7,
      bullId: "bull-1",
      input: { date: "2026-08-20", doses: 1, totalBrl: 42.5, seller: "   " },
    });

    expect(state.inserts.map((insert) => insert.table)).toEqual(["expenses", "semen_purchases"]);
    const [expense, purchase] = state.inserts.map((insert) => insert.row);
    expect(expense).toMatchObject({
      farmId: 7,
      date: "2026-08-20",
      category: "breeding",
      amountBrl: 42.5,
      notes: "Sêmen — Tufão da Serra, 1 dose",
    });
    expect(purchase).toMatchObject({
      bullId: "bull-1",
      date: "2026-08-20",
      doses: 1,
      totalBrl: 42.5,
      seller: null,
      expenseId: expense.id,
    });
    expect(result).toEqual({
      purchase: {
        id: purchase.id,
        date: "2026-08-20",
        doses: 1,
        totalBrl: 42.5,
        expenseId: expense.id,
      },
      expense: {
        id: expense.id,
        date: "2026-08-20",
        category: "breeding",
        amountBrl: 42.5,
        notes: "Sêmen — Tufão da Serra, 1 dose",
      },
    });
  });
});
