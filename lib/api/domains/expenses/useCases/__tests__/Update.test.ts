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
  category: "grp-nutricao",
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

/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });

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

  it("refuses a new kind while the grupo or the conta is still the old one", async () => {
    // The row, then its grupo: a despesa grupo cannot hold an investimento.
    state.selectResults = [[ROW], [grupo("grp-nutricao", "expense")]];
    expect(await run({ kind: "investment" })).toBe("invalid_category");

    const benfeitoria = { ...ROW, kind: "investment", flow: "out", category: "grp-investimentos" };
    // The row, the grupo sent, then the conta it keeps: still of Investimentos.
    state.selectResults = [[benfeitoria], [grupo("grp-nutricao", "expense")], [{ group: "grp-investimentos" }]];
    expect(await run({ kind: "expense", category: "grp-nutricao" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("turns a despesa into an investimento: its grupo and conta, no lote, a saída", async () => {
    const investimento = { kind: "investment", flow: "out", category: "grp-investimentos", accountId: "acc-benf" };
    state.selectResults = [
      [{ ...ROW, lotId: "lot-1" }],
      [grupo("grp-investimentos", "investment")],
      [{ group: "grp-investimentos" }],
    ];
    state.updateResults = [[{ ...ROW, ...investimento }]];

    const result = await run({ kind: "investment", accountId: "acc-benf", category: "grp-investimentos", lotId: "lot-1" });

    expect(state.updates[0]).toMatchObject({
      kind: "investment",
      flow: "out",
      category: "grp-investimentos",
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
      category: "grp-socios",
      accountId: "acc-socios",
      paidAt: "2026-09-12",
      bankAccountId: "cartao",
    };
    state.selectResults = [
      [retirada],
      [grupo("grp-socios", "partners")],
      [{ group: "grp-socios" }],
      [{ kind: "card", archivedAt: null }],
    ];

    expect(await run({ flow: "in" })).toBe("invalid_bank_account");
    expect(state.updates).toEqual([]);
  });

  it("keeps a rendimento paid on its data, without grupo", async () => {
    const rendimento = {
      ...ROW,
      kind: "yield",
      category: null,
      dueDate: null,
      paidAt: "2026-09-10",
      accountId: null,
      bankAccountId: "cdb",
    };
    state.selectResults = [[rendimento]];
    state.updateResults = [[{ ...rendimento, date: "2026-09-30", paidAt: "2026-09-30" }]];

    const result = await run({ date: "2026-09-30", paidAt: null });

    expect(state.updates[0]).toMatchObject({
      date: "2026-09-30",
      paidAt: "2026-09-30",
      dueDate: null,
      category: null,
    });
    expect(result).toMatchObject({ kind: "yield" });
    expect((result as Expense).category).toBeUndefined();
  });
});

describe("updateExpense — grupo", () => {
  const run = (patch: ExpensePatchInput) => new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch });

  it("checks a grupo sent alone: not one of the farm's, or not the conta's", async () => {
    // The row, then the grupo sent: no grupo of this farm by that id.
    state.selectResults = [[ROW], []];
    expect(await run({ category: "grp-of-another-farm" })).toBe("invalid_category");
    // The row, the grupo sent, then its conta: still a conta of Nutrição.
    state.selectResults = [[ROW], [grupo("grp-administrativo", "expense")], [{ group: "grp-nutricao" }]];
    expect(await run({ category: "grp-administrativo" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("saves the edit of an old lançamento whose grupo is archived", async () => {
    const old = { ...ROW, category: "grp-arrend", accountId: "acc-pasto-vizinho" };
    // The row, its grupo (found whatever archived_at says), its conta.
    state.selectResults = [
      [old],
      [{ ...grupo("grp-arrend", "expense"), archivedAt: new Date("2026-08-01T00:00:00Z") }],
      [{ group: "grp-arrend" }],
    ];
    state.updateResults = [[{ ...old, notes: "Parcela de setembro" }]];

    // The form sends every field back, grupo and conta included.
    const result = await run({ category: "grp-arrend", accountId: "acc-pasto-vizinho", notes: "Parcela de setembro" });

    expect(state.updates[0]).toMatchObject({
      category: "grp-arrend",
      accountId: "acc-pasto-vizinho",
      notes: "Parcela de setembro",
    });
    expect(result).toMatchObject({ category: "grp-arrend", notes: "Parcela de setembro" });
  });
});
