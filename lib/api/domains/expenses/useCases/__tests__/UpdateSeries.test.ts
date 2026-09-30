/**
 * updateSeries: "Esta e as próximas" and "Todas" rewrite the unpaid rows of
 * the série in scope and its template; paid rows never change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";

import { UpdateSeriesUseCase } from "../UpdateSeries.useCase";

const row = (index: number, paidAt: string | null, dueDate: string) => ({
  id: `e-${index}`,
  farmId: 7,
  kind: "expense",
  date: dueDate,
  category: "admin",
  amountBrl: 1280,
  notes: null,
  dueDate,
  paidAt,
  counterparty: "Cemig",
  document: null,
  accountId: "acc-energia",
  lotId: null,
  seriesId: "s-1",
  seriesIndex: index,
});

// Energia, todo dia 20: 1 paid, 2 open (edited), 3 paid ahead of time, 4 open.
const ROWS = [
  row(1, "2026-09-20", "2026-09-20"),
  row(2, null, "2026-10-20"),
  row(3, "2026-10-01", "2026-11-20"),
  row(4, null, "2026-12-20"),
];

const SERIES = {
  id: "s-1",
  farmId: 7,
  mode: "recurring",
  frequency: "monthly",
  dayOfMonth: 20,
  startsOn: "2026-09-20",
  endsOn: null,
  count: null,
  generatedCount: 4,
  amountBrl: 1280,
};

/** Ids an `inArray`/`eq` where of the n-th recorded condition binds. */
const params = (n: number) => renderSql(state.wheres[n] as SQL).params;

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
  state.wheres = [];
});

describe("updateSeries", () => {
  it("Esta e as próximas: rewrites the unpaid rows from this one on, never a paid one", async () => {
    // The row, the série, the row again (its own update), its linhas do extrato (none), the siblings.
    state.selectResults = [[ROWS[1]], [SERIES], [ROWS[1]], [], ROWS];
    state.returning = [[{ ...ROWS[1], amountBrl: 1350 }]];

    const result = await new UpdateSeriesUseCase().run({
      farmId: 7,
      id: "e-2",
      patch: { amountBrl: 1350 },
      scope: "following",
    });

    expect(result).toMatchObject({ id: "e-2", amountBrl: 1350 });
    // The row, the série template, then the siblings in scope.
    expect(state.updates).toEqual([{ amountBrl: 1350 }, { amountBrl: 1350 }, { amountBrl: 1350 }]);
    const siblings = params(state.wheres.length - 1);
    expect(siblings).toContain("e-4");
    expect(siblings).not.toContain("e-1");
    expect(siblings).not.toContain("e-3");
  });

  it("Todas: reaches every unpaid row, still no paid one", async () => {
    state.selectResults = [[ROWS[3]], [SERIES], [ROWS[3]], ROWS];
    state.returning = [[ROWS[3]]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-4", patch: { counterparty: "Cemig SA" }, scope: "all" });

    const siblings = params(state.wheres.length - 1);
    expect(siblings).toContain("e-2");
    expect(siblings).not.toContain("e-1");
    expect(siblings).not.toContain("e-3");
  });

  it("moves the day of a recorrência and re-dates the unpaid rows by position", async () => {
    state.selectResults = [[ROWS[1]], [SERIES], [ROWS[1]], ROWS];
    state.returning = [[{ ...ROWS[1], dueDate: "2026-10-25", date: "2026-10-25" }]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-2", patch: { dueDate: "2026-10-25" }, scope: "following" });

    expect(state.updates[0]).toEqual({ dueDate: "2026-10-25", date: "2026-10-25" });
    expect(state.updates[1]).toEqual({ startsOn: "2026-09-25", dayOfMonth: 25 });
    // Only row 4 follows (row 3 is paid): 2026-12-25.
    expect(state.updates.slice(2)).toEqual([{ date: "2026-12-25", dueDate: "2026-12-25" }]);
  });

  it("keeps the série's day when the vencimento sent is the one the row already has", async () => {
    // Todo dia 31: the February row falls on the 28th; editing it must not drift the série to 28.
    const feb = { ...row(5, null, "2027-02-28") };
    const series31 = { ...SERIES, dayOfMonth: 31, startsOn: "2026-10-31" };
    state.selectResults = [[feb], [series31], [feb], [], [feb]];
    state.returning = [[{ ...feb, amountBrl: 1300 }]];

    await new UpdateSeriesUseCase().run({
      farmId: 7,
      id: "e-5",
      patch: { dueDate: "2027-02-28", amountBrl: 1300 },
      scope: "following",
    });

    expect(state.updates[0]).toEqual({ dueDate: "2027-02-28", amountBrl: 1300 });
    expect(state.updates[1]).toEqual({ amountBrl: 1300 });
  });

  it("never re-splits a parcelamento's value", async () => {
    const parcela = { ...ROWS[1], amountBrl: 4000 };
    state.selectResults = [[parcela], [{ ...SERIES, mode: "installments", count: 4 }], [parcela], [], ROWS];
    state.returning = [[{ ...parcela, amountBrl: 4100 }]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-2", patch: { amountBrl: 4100, notes: "3x no boleto" }, scope: "following" });

    expect(state.updates).toEqual([
      { amountBrl: 4100, notes: "3x no boleto" },
      { notes: "3x no boleto" },
      { notes: "3x no boleto" },
    ]);
  });
});
