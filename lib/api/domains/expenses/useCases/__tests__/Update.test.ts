/**
 * updateExpense: edits a lançamento of the farm. Only the fields sent change,
 * null clears an optional one, and the vencimento may not be before the data.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set and answer from their own
 * queue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows each `update().returning()` resolves to, in call order. */
    updateResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    for: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function updateBuilder() {
  const builder = {
    set(columns: Record<string, unknown>) {
      state.updates.push(columns);
      return builder;
    },
    where: () => builder,
    returning: () => Promise.resolve(state.updateResults.shift() ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => {
  const db = {
    select: selectBuilder,
    update: updateBuilder,
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(db)),
  };
  return { db };
});

import type { Expense } from "@/lib/types";

import { UpdateExpenseUseCase, type ExpensePatchInput } from "../Update.useCase";

const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  flow: null,
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 500,
  notes: null,
  dueDate: "2026-09-20",
  paidAt: null,
  counterparty: "Agro Sul",
  document: "NF 4.812",
  accountId: "acc-1",
  lotId: null,
  bankAccountId: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updateResults = [];
  state.updates = [];
});

describe("updateExpense", () => {
  it("marks a lançamento as paid", async () => {
    state.selectResults = [[ROW]];
    state.updateResults = [[{ ...ROW, paidAt: "2026-09-24" }]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { paidAt: "2026-09-24" },
    });

    expect(state.updates).toEqual([{ paidAt: "2026-09-24" }]);
    expect(result).toMatchObject({ id: "e-1", kind: "expense", paidAt: "2026-09-24" });
  });

  it("clears an optional field sent as null", async () => {
    state.selectResults = [[ROW]];
    state.updateResults = [[{ ...ROW, counterparty: null, dueDate: null }]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { counterparty: null, dueDate: null },
    });

    expect(state.updates).toEqual([{ counterparty: null, dueDate: null }]);
    // toExpense maps a null column to undefined (orNothing), so the key is there but empty.
    const cleared = result as Expense;
    expect(cleared.counterparty).toBeUndefined();
    expect(cleared.dueDate).toBeUndefined();
  });

  it("refuses a vencimento before the data", async () => {
    state.selectResults = [[ROW]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { dueDate: "2026-09-01" },
    });

    expect(result).toBe("due_before_date");
    expect(state.updates).toEqual([]);
  });

  it("refuses a new data after the stored vencimento", async () => {
    state.selectResults = [[ROW]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { date: "2026-09-30" },
    });

    expect(result).toBe("due_before_date");
    expect(state.updates).toEqual([]);
  });

  it("never forwards an undeclared column such as farmId", async () => {
    state.selectResults = [[ROW]];
    state.updateResults = [[{ ...ROW, paidAt: "2026-09-24" }]];

    await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { paidAt: "2026-09-24", farmId: 999 } as ExpensePatchInput,
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).not.toHaveProperty("farmId");
    expect(state.updates[0]).toEqual({ paidAt: "2026-09-24" });
  });

  it("answers null for a lançamento of another farm", async () => {
    state.selectResults = [[]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 8,
      id: "e-1",
      patch: { paidAt: "2026-09-24" },
    });

    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});

describe("updateExpense — what the kind needs", () => {
  const run = (patch: ExpensePatchInput) => new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch });

  it("refuses a new kind while the conta still belongs to the old group", async () => {
    state.selectResults = [[ROW], [{ group: "nutrition" }]];
    expect(await run({ kind: "investment" })).toBe("invalid_account");

    const benfeitoria = { ...ROW, kind: "investment", flow: "out", category: "other", accountId: "acc-benf" };
    state.selectResults = [[benfeitoria], [{ group: "investment" }]];
    expect(await run({ kind: "expense" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("turns a despesa into an investimento: the conta's group, no grupo, no lote, a saída", async () => {
    state.selectResults = [[{ ...ROW, lotId: "lot-1" }], [{ group: "investment" }]];
    state.updateResults = [[{ ...ROW, kind: "investment", flow: "out", category: "other", accountId: "acc-benf" }]];

    const result = await run({ kind: "investment", accountId: "acc-benf", category: "nutrition", lotId: "lot-1" });

    expect(state.updates[0]).toMatchObject({
      kind: "investment",
      flow: "out",
      category: "other",
      lotId: null,
      accountId: "acc-benf",
    });
    expect(result).toMatchObject({ kind: "investment", flow: "out" });
  });

  it("checks Pago por against a new movimento: an aporte never enters a cartão", async () => {
    const retirada = {
      ...ROW,
      kind: "partners",
      flow: "out",
      category: "other",
      accountId: "acc-socios",
      paidAt: "2026-09-12",
      bankAccountId: "cartao",
    };
    state.selectResults = [[retirada], [{ group: "partners" }], [{ kind: "card", archivedAt: null }]];

    expect(await run({ flow: "in" })).toBe("invalid_bank_account");
    expect(state.updates).toEqual([]);
  });

  it("keeps a rendimento paid on its data", async () => {
    const rendimento = {
      ...ROW,
      kind: "yield",
      category: "other",
      dueDate: null,
      paidAt: "2026-09-10",
      accountId: null,
      bankAccountId: "cdb",
    };
    state.selectResults = [[rendimento]];
    state.updateResults = [[{ ...rendimento, date: "2026-09-30", paidAt: "2026-09-30" }]];

    await run({ date: "2026-09-30", paidAt: null });

    expect(state.updates[0]).toMatchObject({ date: "2026-09-30", paidAt: "2026-09-30", dueDate: null });
  });
});
