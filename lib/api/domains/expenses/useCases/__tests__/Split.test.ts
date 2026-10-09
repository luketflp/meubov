/**
 * splitExpense ("Parcelar"): one pending lançamento outside any série becomes
 * a parcelamento of N parcelas, split as a new one is. The first parcela is
 * the row itself (same id, so its anexos stay). The db stub echoes what is
 * written; an update echoes the locked row with the columns set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** The lançamento the use case locks. */
    row: {} as Record<string, unknown>,
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const rows = state.selectResults.shift() ?? [];
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        for: () => builder,
        then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
      };
      return builder;
    },
    insert: () => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(values) ? values : [values];
        state.inserts.push(rows);
        return { returning: () => Promise.resolve(rows) };
      },
    }),
    update: () => ({
      set: (columns: Record<string, unknown>) => {
        state.updates.push(columns);
        return { where: () => ({ returning: () => Promise.resolve([{ ...state.row, ...columns }]) }) };
      },
    }),
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(db)),
  };
  return { db };
});

import type { Expense } from "@/lib/types";

import { SplitExpenseUseCase } from "../Split.useCase";

/** A compra of a trator, R$ 1.000,00, still to pay. */
const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "investment",
  flow: "out",
  date: "2026-09-27",
  category: "grp-investimentos",
  amountBrl: 1000,
  notes: null,
  dueDate: "2026-09-27",
  paidAt: null,
  counterparty: "Agro Máquinas",
  document: "NF 912",
  accountId: "acc-maquinas",
  lotId: null,
  seriesId: null,
  seriesIndex: null,
  bankAccountId: null,
};

/** Queues the lançamento the use case locks, then its anexos' count. */
function given(row: Record<string, unknown>, attachments = 0) {
  state.row = row;
  state.selectResults = [[row], [{ total: attachments }]];
}

const split = (count: number, startsOn = "2026-10-10") =>
  new SplitExpenseUseCase().run({ farmId: 7, id: "e-1", count, frequency: "monthly", startsOn });

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.updates = [];
});

describe("splitExpense", () => {
  it("keeps the first id, splits the centavos as a new parcelamento and sums to the total", async () => {
    given(ROW, 2);

    const result = (await split(3)) as Expense[];

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({
      mode: "installments",
      frequency: "monthly",
      dayOfMonth: 10,
      startsOn: "2026-10-10",
      endsOn: null,
      count: 3,
      generatedCount: 3,
      amountBrl: 1000,
      kind: "investment",
      flow: "out",
      category: "grp-investimentos",
      accountId: "acc-maquinas",
      counterparty: "Agro Máquinas",
    });
    // The row becomes parcela 1 in place.
    expect(state.updates).toEqual([
      { dueDate: "2026-10-10", amountBrl: 333.33, seriesId: series.id, seriesIndex: 1 },
    ]);
    expect(rows.map((row) => [row.seriesIndex, row.date, row.dueDate, row.amountBrl])).toEqual([
      [2, "2026-09-27", "2026-11-10", 333.33],
      [3, "2026-09-27", "2026-12-10", 333.34],
    ]);
    expect(rows.every((row) => row.kind === "investment" && row.flow === "out" && row.document === "NF 912")).toBe(
      true
    );
    expect(result.map((e) => [e.id, `${e.seriesIndex}/${e.seriesCount}`])).toEqual([
      ["e-1", "1/3"],
      [rows[0].id, "2/3"],
      [rows[1].id, "3/3"],
    ]);
    expect(result[0].attachmentCount).toBe(2);
    expect(result.reduce((cents, e) => cents + Math.round(e.amountBrl * 100), 0)).toBe(100000);
  });

  it.each([1, 49])("refuses %i parcelas", async (count) => {
    given(ROW);
    expect(await split(count)).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
  });

  it("refuses more parcelas than centavos", async () => {
    given({ ...ROW, amountBrl: 0.02 });
    expect(await split(3)).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a paid lançamento", { paidAt: "2026-09-27", bankAccountId: "sicredi" }],
    ["a parcela of a série", { seriesId: "s-1", seriesIndex: 2 }],
    [
      "a rendimento",
      { kind: "yield", flow: null, category: null, accountId: null, dueDate: null, paidAt: "2026-09-27", bankAccountId: "cdb" },
    ],
  ])("refuses %s", async (_, patch) => {
    given({ ...ROW, ...patch });
    expect(await split(3)).toBe("not_splittable");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("refuses a first parcela before the lançamento's data", async () => {
    given(ROW);
    expect(await split(3, "2026-09-01")).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });

  it("is null for a lançamento of another farm", async () => {
    state.selectResults = [[]];
    expect(await split(3)).toBeNull();
  });
});
