/**
 * deleteExpense with a scope: removes the unpaid rows in scope, stops a
 * recorrência and deletes the anexos' files; paid rows stay.
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
import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";

import { DeleteExpenseUseCase } from "../Delete.useCase";

const row = (index: number, paidAt: string | null) => ({
  id: `e-${index}`,
  farmId: 7,
  seriesId: "s-1",
  seriesIndex: index,
  paidAt,
  date: "2026-09-05",
  dueDate: null,
});
const ROWS = [row(1, "2026-09-05"), row(2, null), row(3, "2026-10-01"), row(4, null)];
const SERIES = { id: "s-1", mode: "recurring", frequency: "monthly", dayOfMonth: 5, startsOn: "2026-09-05", endsOn: null };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("deleteExpense", () => {
  it("Esta e as próximas: removes the unpaid rows from this one on and ends the recorrência", async () => {
    const blob = memoryBlobStore({ "farms/7/expenses/e-4/u-nf.pdf": { size: 1, contentType: "application/pdf" } });
    // Position 2 was moved off the rule, to 2026-10-09.
    const moved = { ...ROWS[1], date: "2026-10-09", dueDate: "2026-10-09" };
    state.selectResults = [[moved], [SERIES], ROWS, [{ pathname: "farms/7/expenses/e-4/u-nf.pdf" }]];

    const removed = await new DeleteExpenseUseCase(undefined, blob.store).run({ farmId: 7, id: "e-2", scope: "following" });

    expect(removed).toBe(true);
    // The série now ends the day before the row's own vencimento, not the rule's 2026-10-05.
    expect(state.updates).toEqual([{ endsOn: "2026-10-08" }]);
    expect(renderSql(state.wheres[3] as SQL).sql).toContain('"expense_series"."farm_id" = $1');
    const deleted = renderSql(state.wheres[state.wheres.length - 1] as SQL).params;
    expect(deleted).toEqual([7, "e-2", "e-4"]);
    expect(blob.deleted).toEqual(["farms/7/expenses/e-4/u-nf.pdf"]);
  });

  it("Todas: removes every unpaid row and keeps the paid ones", async () => {
    state.selectResults = [[ROWS[3]], [SERIES], ROWS, []];

    await new DeleteExpenseUseCase(undefined, memoryBlobStore().store).run({ farmId: 7, id: "e-4", scope: "all" });

    expect(renderSql(state.wheres[state.wheres.length - 1] as SQL).params).toEqual([7, "e-2", "e-4"]);
    expect(state.updates).toEqual([{ endsOn: "2026-09-04" }]);
  });

  it("Só esta removes the row alone, even from a série", async () => {
    state.selectResults = [[ROWS[1]], []];

    await new DeleteExpenseUseCase(undefined, memoryBlobStore().store).run({ farmId: 7, id: "e-2" });

    expect(renderSql(state.wheres[state.wheres.length - 1] as SQL).params).toEqual([7, "e-2"]);
    expect(state.updates).toEqual([]);
  });

  it("is false for a lançamento not on the farm", async () => {
    state.selectResults = [[]];
    expect(await new DeleteExpenseUseCase(undefined, memoryBlobStore().store).run({ farmId: 7, id: "x" })).toBe(false);
    expect(state.deletes).toBe(0);
  });
});
