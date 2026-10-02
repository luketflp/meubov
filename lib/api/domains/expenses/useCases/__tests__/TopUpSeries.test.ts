/**
 * topUpSeries: the load writes the ocorrências that now fall inside
 * today + 12 months, after the last one generated, and nothing twice.
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

import { TopUpSeriesUseCase } from "../TopUpSeries.useCase";

const SALARIO = {
  id: "s-1",
  farmId: 7,
  mode: "recurring",
  frequency: "monthly",
  dayOfMonth: 5,
  startsOn: "2026-10-05",
  endsOn: null,
  count: null,
  generatedCount: 12,
  kind: "expense",
  category: "labor",
  amountBrl: 6480,
  accountId: "acc-salarios",
  lotId: null,
  counterparty: null,
  document: null,
  notes: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.wheres = [];
});

describe("topUpSeries", () => {
  it("writes the months that entered the window, after the last one generated", async () => {
    // Created on 2026-09-28 with 12 ocorrências (to 2027-09-05); now it is 2026-11-10.
    state.selectResults = [[SALARIO], [SALARIO]];

    const written = await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" });

    expect(written).toBe(2);
    const rows = state.inserts[0] as Record<string, unknown>[];
    expect(rows.map((row) => [row.seriesIndex, row.dueDate])).toEqual([
      [13, "2027-10-05"],
      [14, "2027-11-05"],
    ]);
    expect(rows[0]).toMatchObject({ seriesId: "s-1", date: "2027-10-05", amountBrl: 6480, accountId: "acc-salarios" });
    expect(state.updates).toEqual([{ generatedCount: 14 }]);
    const update = renderSql(state.wheres[state.wheres.length - 1] as SQL);
    expect(update.sql).toContain('"expense_series"."farm_id" = $1');
  });

  it("writes from the row read under lock: a removal that cut até meanwhile wins", async () => {
    state.selectResults = [[SALARIO], [{ ...SALARIO, endsOn: "2027-09-30" }]];

    expect(await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" })).toBe(0);
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("is idempotent: nothing new inside the window writes nothing", async () => {
    state.selectResults = [[{ ...SALARIO, generatedCount: 14 }]];

    expect(await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" })).toBe(0);
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("writes the série's kind and movimento on each new row", async () => {
    const pronaf = { ...SALARIO, kind: "financing", flow: "out", category: "other", accountId: "acc-pronaf" };
    state.selectResults = [[pronaf], [pronaf]];

    await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" });

    const rows = state.inserts[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ kind: "financing", flow: "out", category: "other", accountId: "acc-pronaf" });
  });

  it("stops at até", async () => {
    state.selectResults = [[{ ...SALARIO, endsOn: "2027-09-30" }]];

    expect(await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" })).toBe(0);
  });
});
