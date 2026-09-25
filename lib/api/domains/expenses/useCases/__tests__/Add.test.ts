/**
 * addExpense: registers a lançamento with its vencimento, pagamento, conta and
 * lote. A despesa by default; a vencimento before the data is refused.
 *
 * Same chainable db stub as the other use-case tests: inserts record the row
 * and echo it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Every `insert().values()` row. */
    inserts: [] as Record<string, unknown>[],
  },
}));

function insertBuilder() {
  return {
    values: (row: Record<string, unknown>) => ({
      returning: () => {
        state.inserts.push(row);
        return Promise.resolve([row]);
      },
    }),
  };
}

vi.mock("@/lib/db", () => ({ db: { insert: insertBuilder } }));

import { AddExpenseUseCase } from "../Add.useCase";

beforeEach(() => {
  state.inserts = [];
});

describe("addExpense", () => {
  it("writes every new column, a despesa by default", async () => {
    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "nutrition",
      amountBrl: 500,
      notes: "Sal",
      dueDate: "2026-09-20",
      counterparty: "Agro Sul",
      document: "NF 4.812",
      accountId: "acc-1",
      lotId: "lot-1",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      farmId: 7,
      kind: "expense",
      date: "2026-09-10",
      category: "nutrition",
      amountBrl: 500,
      notes: "Sal",
      dueDate: "2026-09-20",
      paidAt: null,
      counterparty: "Agro Sul",
      document: "NF 4.812",
      accountId: "acc-1",
      lotId: "lot-1",
    });
    expect(result).toMatchObject({ kind: "expense", dueDate: "2026-09-20" });
  });

  it("writes absent optionals as null", async () => {
    await new AddExpenseUseCase().run({
      farmId: 7,
      kind: "revenue",
      date: "2026-09-10",
      category: "other",
      amountBrl: 800,
    });

    expect(state.inserts[0]).toMatchObject({
      kind: "revenue",
      dueDate: null,
      paidAt: null,
      counterparty: null,
      document: null,
      accountId: null,
      lotId: null,
    });
  });

  it("refuses a vencimento before the data and inserts nothing", async () => {
    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "nutrition",
      amountBrl: 500,
      dueDate: "2026-09-01",
    });

    expect(result).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });
});
