/**
 * addExpense: registers a lançamento with its vencimento, pagamento, conta and
 * lote. A despesa by default; a vencimento before the data is refused. The
 * kinds fora do resultado take a conta do plano of their group and a
 * movimento; a rendimento takes its aplicação and is paid on its data.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the conta do plano, then "Pago por"), inserts record
 * the row and echo it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every `insert().values()` row. */
    inserts: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

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

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { AddExpenseUseCase } from "../Add.useCase";

const ENTRY = { farmId: 7, date: "2026-09-10", category: "nutrition" as const, amountBrl: 500 };
const add = (input: Parameters<AddExpenseUseCase["run"]>[0]) => new AddExpenseUseCase().run(input);

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addExpense", () => {
  it("writes every new column, a despesa by default", async () => {
    state.selectResults = [[{ group: "nutrition" }]];

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
      flow: null,
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

describe("addExpense — fora do resultado", () => {
  it("refuses an investimento without conta, or with a conta of another group or farm", async () => {
    const compra = { ...ENTRY, kind: "investment" as const, amountBrl: 38000 };
    expect(await add(compra)).toBe("invalid_account");
    state.selectResults = [[{ group: "financing" }]];
    expect(await add({ ...compra, accountId: "acc-pronaf" })).toBe("invalid_account");
    state.selectResults = [[]];
    expect(await add({ ...compra, accountId: "acc-of-another-farm" })).toBe("invalid_account");
    expect(state.inserts).toEqual([]);
  });

  it("stores a capital lançamento sent without movimento as a saída, without grupo or lote", async () => {
    state.selectResults = [[{ group: "partners" }]];

    await add({ ...ENTRY, kind: "partners", accountId: "acc-retiradas", lotId: "lot-1" });

    expect(state.inserts[0]).toMatchObject({
      kind: "partners",
      flow: "out",
      category: "other",
      lotId: null,
      accountId: "acc-retiradas",
    });
  });

  it("keeps a despesa or a receita out of the contas fora do resultado", async () => {
    state.selectResults = [[{ group: "investment" }]];
    expect(await add({ ...ENTRY, accountId: "acc-benfeitorias" })).toBe("invalid_account");
    state.selectResults = [[{ group: "partners" }]];
    expect(await add({ ...ENTRY, kind: "revenue", category: "other", accountId: "acc-aportes" })).toBe(
      "invalid_account"
    );
    expect(state.inserts).toEqual([]);
  });

  it("lets a cartão pay a compra, never a retirada or a venda do bem", async () => {
    const paidByCard = { paidAt: "2026-09-10", bankAccountId: "cartao" };
    const card = [{ kind: "card", archivedAt: null }];
    state.selectResults = [[{ group: "partners" }], card];
    expect(await add({ ...ENTRY, kind: "partners", accountId: "acc-retiradas", ...paidByCard })).toBe(
      "invalid_bank_account"
    );
    state.selectResults = [[{ group: "investment" }], card];
    expect(
      await add({ ...ENTRY, kind: "investment", flow: "in", accountId: "acc-maquinas", ...paidByCard })
    ).toBe("invalid_bank_account");
    expect(state.inserts).toEqual([]);

    state.selectResults = [[{ group: "investment" }], card];
    expect(await add({ ...ENTRY, kind: "investment", accountId: "acc-maquinas", ...paidByCard })).toMatchObject({
      kind: "investment",
      flow: "out",
      bankAccountId: "cartao",
    });
  });

  it("keeps a rendimento in its aplicação, paid on its data, and refuses it anywhere else", async () => {
    const rendimento = { ...ENTRY, kind: "yield" as const, amountBrl: 812.4 };
    state.selectResults = [[{ kind: "investment", archivedAt: null }]];
    await add({ ...rendimento, dueDate: "2026-09-30", lotId: "lot-1", bankAccountId: "cdb" });
    expect(state.inserts[0]).toMatchObject({
      kind: "yield",
      flow: null,
      category: "other",
      dueDate: null,
      paidAt: "2026-09-10",
      accountId: null,
      lotId: null,
      bankAccountId: "cdb",
    });

    state.selectResults = [[{ kind: "checking", archivedAt: null }]];
    expect(await add({ ...rendimento, bankAccountId: "sicredi" })).toBe("invalid_bank_account");
    expect(await add(rendimento)).toBe("invalid_bank_account");
    expect(await add({ ...rendimento, accountId: "acc-1", bankAccountId: "cdb" })).toBe("invalid_account");
    expect(state.inserts).toHaveLength(1);
  });
});
