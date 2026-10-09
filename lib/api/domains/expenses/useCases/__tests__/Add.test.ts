/**
 * addExpense: registers a lançamento with its vencimento, pagamento, conta and
 * lote. A despesa by default; a vencimento before the data is refused. The
 * kinds fora do resultado take a conta do plano of their group and a
 * movimento; a rendimento takes its aplicação and is paid on its data.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the grupo, the conta do plano, then "Pago por"),
 * inserts record the row and echo it. The grupo rules themselves are
 * entryRules.test.ts's.
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

const ENTRY = { farmId: 7, date: "2026-09-10", category: "grp-nutricao", amountBrl: 500 };
/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");
const add = (input: Parameters<AddExpenseUseCase["run"]>[0]) => new AddExpenseUseCase().run(input);

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addExpense", () => {
  it("writes every new column, a despesa by default", async () => {
    state.selectResults = [[NUTRICAO], [{ group: "grp-nutricao" }]];

    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "grp-nutricao",
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
      category: "grp-nutricao",
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

  it("writes a receita in its grupo, absent optionals as null", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")]];

    await new AddExpenseUseCase().run({
      farmId: 7,
      kind: "revenue",
      date: "2026-09-10",
      category: "grp-receitas",
      amountBrl: 800,
    });

    expect(state.inserts[0]).toMatchObject({
      kind: "revenue",
      category: "grp-receitas",
      dueDate: null,
      paidAt: null,
      counterparty: null,
      document: null,
      accountId: null,
      lotId: null,
    });
  });

  it("refuses a receita sent without grupo and inserts nothing", async () => {
    expect(await add({ ...ENTRY, kind: "revenue", category: undefined })).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a vencimento before the data and inserts nothing", async () => {
    state.selectResults = [[NUTRICAO]];

    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "grp-nutricao",
      amountBrl: 500,
      dueDate: "2026-09-01",
    });

    expect(result).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });
});

describe("addExpense — fora do resultado", () => {
  const INVESTIMENTOS = grupo("grp-investimentos", "investment");
  const compra = { ...ENTRY, kind: "investment" as const, category: "grp-investimentos", amountBrl: 38000 };

  it("refuses an investimento without conta, or with a conta of another grupo or farm", async () => {
    state.selectResults = [[INVESTIMENTOS]];
    expect(await add(compra)).toBe("invalid_account");
    state.selectResults = [[INVESTIMENTOS], [{ group: "grp-financiamentos" }]];
    expect(await add({ ...compra, accountId: "acc-pronaf" })).toBe("invalid_account");
    state.selectResults = [[INVESTIMENTOS], []];
    expect(await add({ ...compra, accountId: "acc-of-another-farm" })).toBe("invalid_account");
    expect(state.inserts).toEqual([]);
  });

  it("stores a capital lançamento sent without movimento as a saída, in its grupo, without lote", async () => {
    state.selectResults = [[grupo("grp-socios", "partners")], [{ group: "grp-socios" }]];

    await add({ ...ENTRY, kind: "partners", category: "grp-socios", accountId: "acc-retiradas", lotId: "lot-1" });

    expect(state.inserts[0]).toMatchObject({
      kind: "partners",
      flow: "out",
      category: "grp-socios",
      lotId: null,
      accountId: "acc-retiradas",
    });
  });

  it("lets a cartão pay a compra, never a retirada or a venda do bem", async () => {
    const paidByCard = { paidAt: "2026-09-10", bankAccountId: "cartao" };
    const card = [{ kind: "card", archivedAt: null }];
    const retirada = { ...ENTRY, kind: "partners" as const, category: "grp-socios", accountId: "acc-retiradas" };
    state.selectResults = [[grupo("grp-socios", "partners")], [{ group: "grp-socios" }], card];
    expect(await add({ ...retirada, ...paidByCard })).toBe("invalid_bank_account");
    state.selectResults = [[INVESTIMENTOS], [{ group: "grp-investimentos" }], card];
    expect(await add({ ...compra, flow: "in", accountId: "acc-maquinas", ...paidByCard })).toBe(
      "invalid_bank_account"
    );
    expect(state.inserts).toEqual([]);

    state.selectResults = [[INVESTIMENTOS], [{ group: "grp-investimentos" }], card];
    expect(await add({ ...compra, accountId: "acc-maquinas", ...paidByCard })).toMatchObject({
      kind: "investment",
      flow: "out",
      bankAccountId: "cartao",
    });
  });

  it("keeps a rendimento in its aplicação, paid on its data, without grupo, and refuses it anywhere else", async () => {
    const rendimento = { ...ENTRY, kind: "yield" as const, amountBrl: 812.4 };
    // Only "Pago por" is read: a rendimento asks no grupo, even when the form sends one.
    state.selectResults = [[{ kind: "investment", archivedAt: null }]];
    await add({ ...rendimento, dueDate: "2026-09-30", lotId: "lot-1", bankAccountId: "cdb" });
    expect(state.inserts[0]).toMatchObject({
      kind: "yield",
      flow: null,
      category: null,
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
