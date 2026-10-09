/**
 * deletePlanGroup: only a grupo nothing uses is deleted, of any tipo, with its
 * contas and its orçamento lines; a used one is archived instead. A
 * recorrência keeps it, and so does a lançamento of one of its contas whatever
 * category it carries.
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

import { DeletePlanGroupUseCase } from "../Delete.useCase";

const row = (kind: string) => ({
  id: "g-1",
  farmId: 7,
  kind,
  name: "Grupo",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
});

const remove = (farmId = 7) => new DeletePlanGroupUseCase().run({ farmId, id: "g-1" });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("deletePlanGroup", () => {
  it("is not_found off the farm", async () => {
    state.selectResults = [[]];

    expect(await remove(8)).toBe("not_found");
    expect(state.deletes).toBe(0);
    expect(renderSql(state.wheres[0] as SQL).params).toEqual([8, "g-1"]);
  });

  it("is in_use for a grupo of any tipo while a lançamento or recorrência has it, or points at one of its contas", async () => {
    for (const kind of ["revenue", "expense", "investment", "financing", "partners"]) {
      state.selectResults = [[row(kind)], [{ id: "g-1" }]];
      state.wheres = [];

      expect(await remove()).toBe("in_use");
      expect(state.deletes).toBe(0);
      const usage = renderSql(state.wheres[1] as SQL);
      // The same rule for every tipo: nothing asks the grupo's kind.
      expect(usage.sql).not.toContain('"kind"');
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
      expect(new Set(usage.params)).toEqual(new Set([7, "g-1"]));
    }
  });

  it("deletes an unused financiamento grupo: its orçamento lines, its emptied séries, its contas with their saldo inicial, then the grupo, and nothing else", async () => {
    state.selectResults = [[row("financing")], []];

    expect(await remove()).toBe("deleted");
    expect(state.deletes).toBe(4);
    const [lines, series, contas, grupo] = state.wheres.slice(2).map((where) => renderSql(where as SQL));
    expect(lines.sql).toContain('"budgets"."category" = $2');
    expect(series.sql).toContain('"expense_series"."category" = $');
    expect(series.sql).toContain('"expense_series"."account_id" in (select');
    expect(contas.sql).toContain('"accounts"."group" = $2');
    // A conta with a saldo devedor inicial goes like any other.
    expect(contas.sql).not.toContain("opening");
    expect(grupo.sql).toContain('"plan_groups"."id" = $2');
    for (const query of [lines, contas, grupo]) expect(query.params).toEqual([7, "g-1"]);
    expect(new Set(series.params)).toEqual(new Set([7, "g-1"]));
  });
});
