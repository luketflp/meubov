/**
 * "Pago por" on a lançamento: kept only while it is paid, checked against the
 * farm's contas, cleared when it is unpaid.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { AddExpenseUseCase } from "../Add.useCase";
import { UpdateExpenseUseCase } from "../Update.useCase";

const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-10",
  category: "grp-nutricao",
  amountBrl: 4850,
  notes: null,
  dueDate: null,
  paidAt: "2026-09-18",
  counterparty: null,
  document: null,
  accountId: null,
  lotId: null,
  seriesId: null,
  seriesIndex: null,
  bankAccountId: "sicredi",
};

const entry = { farmId: 7, date: "2026-09-18", category: "grp-nutricao", amountBrl: 4850 };
/** A plan_groups row of the farm, as the grupo check reads it before "Pago por". */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");
const RECEITAS = grupo("grp-receitas", "revenue");

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.returning = [];
});

describe("AddExpenseUseCase with Pago por", () => {
  it("keeps the conta of a paid lançamento", async () => {
    state.selectResults = [[NUTRICAO], [{ kind: "checking", archivedAt: null }]];
    state.returning = [[ROW]];
    const created = await new AddExpenseUseCase().run({ ...entry, paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(state.inserts[0]).toMatchObject({ paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(created).toMatchObject({ bankAccountId: "sicredi" });
  });

  it("drops the conta of a pending lançamento without asking", async () => {
    state.selectResults = [[NUTRICAO]];
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
    await new AddExpenseUseCase().run({ ...entry, bankAccountId: "sicredi" });
    expect(state.inserts[0]).toMatchObject({ paidAt: null, bankAccountId: null });
  });

  it("refuses a conta of another farm and a cartão for a receita", async () => {
    state.selectResults = [[NUTRICAO], []];
    expect(await new AddExpenseUseCase().run({ ...entry, paidAt: "2026-09-18", bankAccountId: "other" })).toBe(
      "invalid_bank_account"
    );
    state.selectResults = [[RECEITAS], [{ kind: "card", archivedAt: null }]];
    const receita = { ...entry, kind: "revenue" as const, category: "grp-receitas" };
    expect(await new AddExpenseUseCase().run({ ...receita, paidAt: "2026-09-18", bankAccountId: "card" })).toBe(
      "invalid_bank_account"
    );
    expect(state.inserts).toEqual([]);
  });
});

describe("UpdateExpenseUseCase with Pago por", () => {
  it("clears the conta when the lançamento is unpaid", async () => {
    state.selectResults = [[ROW]];
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { paidAt: null } });
    expect(state.updates).toEqual([{ paidAt: null, bankAccountId: null }]);
  });

  it("marks paid with the conta chosen", async () => {
    state.selectResults = [[{ ...ROW, paidAt: null, bankAccountId: null }], [{ kind: "cash", archivedAt: null }]];
    state.returning = [[ROW]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { paidAt: "2026-09-29", bankAccountId: "caixa" } });
    expect(state.updates).toEqual([{ paidAt: "2026-09-29", bankAccountId: "caixa" }]);
  });

  it("saves a row whose conta is unchanged, even archived, without checking it", async () => {
    state.selectResults = [[ROW]];
    state.returning = [[{ ...ROW, notes: "x" }]];
    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { notes: "x", bankAccountId: "sicredi" },
    });
    expect(result).toMatchObject({ notes: "x" });
  });

  it("checks the conta the row keeps when the kind changes: no receita on a cartão", async () => {
    // The row, the receita grupo sent with the new kind, then the cartão it keeps.
    state.selectResults = [[{ ...ROW, bankAccountId: "card" }], [RECEITAS], [{ kind: "card", archivedAt: "2026-09-01" }]];
    const patch = { kind: "revenue" as const, category: "grp-receitas" };
    expect(await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch })).toBe("invalid_bank_account");
    expect(state.updates).toEqual([]);
  });
});

describe("UpdateExpenseUseCase and a paired linha", () => {
  const LINE = { id: "l-1", bankAccountId: "sicredi", amountBrl: -4850 };

  it("unpairs the linha when the lançamento is unpaid", async () => {
    state.selectResults = [[ROW], [LINE]];
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { paidAt: null } });
    expect(state.updates).toEqual([{ paidAt: null, bankAccountId: null }, { expenseId: null }]);
  });

  it("unpairs it when the value changes and keeps it when the edit still agrees", async () => {
    state.selectResults = [[ROW], [LINE]];
    state.returning = [[{ ...ROW, amountBrl: 4900 }]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { amountBrl: 4900 } });
    expect(state.updates).toEqual([{ amountBrl: 4900 }, { expenseId: null }]);

    state.updates = [];
    state.selectResults = [[ROW], [LINE]];
    state.returning = [[ROW]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { amountBrl: 4850 } });
    expect(state.updates).toEqual([{ amountBrl: 4850 }]);
  });
});
