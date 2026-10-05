/**
 * deleteExpenseGroup: only a grupo nothing uses is deleted, with its contas and
 * its orçamento lines; a used one is archived instead. A recorrência keeps it,
 * and so does a lançamento of one of its contas whatever category it carries.
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

import { DeleteExpenseGroupUseCase } from "../Delete.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

const remove = (farmId = 7) => new DeleteExpenseGroupUseCase().run({ farmId, id: "g-maq" });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("deleteExpenseGroup", () => {
  it("is not_found off the farm", async () => {
    state.selectResults = [[]];

    expect(await remove(8)).toBe("not_found");
    expect(state.deletes).toBe(0);
    expect(renderSql(state.wheres[0] as SQL).params).toEqual([8, "g-maq"]);
  });

  it("is in_use while a lançamento or recorrência has the grupo, or points at one of its contas under any category", async () => {
    state.selectResults = [[ROW], [{ id: "g-maq" }]];

    expect(await remove()).toBe("in_use");
    expect(state.deletes).toBe(0);
    const usage = renderSql(state.wheres[1] as SQL);
    const ofItsContas = '"account_id" in (select "accounts"."id" from "accounts" where "accounts"."farm_id" = $';
    // A recorrência alone keeps the grupo.
    expect(usage.sql).toContain('exists (select 1 from "expense_series" where "expense_series"."farm_id" = $');
    expect(usage.sql).toContain('"expense_series"."category" = $');
    expect(usage.sql).toContain(`"expense_series".${ofItsContas}`);
    // …but only while it still has lançamentos: "Excluir todas" leaves the série row behind, empty.
    expect(usage.sql).toContain('exists (select 1 from "expenses" "e" where "e"."series_id" = "expense_series"."id")');
    // A lançamento of one of its contas keeps it too, filed under another grupo or not: either one is enough.
    expect(usage.sql).toMatch(/"expenses"\."category" = \$\d+ or "expenses"\."account_id" in \(select/);
    expect(usage.sql).toContain(`"expenses".${ofItsContas}`);
    expect(usage.sql).toContain('"accounts"."group" = $');
    expect(new Set(usage.params)).toEqual(new Set([7, "g-maq"]));
  });

  it("deletes an unused grupo: its orçamento lines, its emptied séries, its contas, then the grupo, all on this farm", async () => {
    state.selectResults = [[ROW], []];

    expect(await remove()).toBe("deleted");
    expect(state.deletes).toBe(4);
    const [lines, series, contas, grupo] = state.wheres.slice(2).map((where) => renderSql(where as SQL));
    expect(lines.sql).toContain('"budgets"."category" = $2');
    expect(series.sql).toContain('"expense_series"."category" = $');
    expect(series.sql).toContain('"expense_series"."account_id" in (select');
    expect(contas.sql).toContain('"accounts"."group" = $2');
    expect(grupo.sql).toContain('"expense_groups"."id" = $2');
    for (const query of [lines, contas, grupo]) expect(query.params).toEqual([7, "g-maq"]);
    expect(new Set(series.params)).toEqual(new Set([7, "g-maq"]));
  });
});
