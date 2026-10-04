/** deleteBudgetLine: removes one line of a safra; a grupo's own line goes alone, its contas' lines stay. */
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

import { DeleteBudgetLineUseCase } from "../DeleteBudgetLine.useCase";

const remove = (accountId?: string) =>
  new DeleteBudgetLineUseCase().run({ farmId: 7, safra: 2025, startMonth: 10, category: "admin", accountId });

beforeEach(() => {
  state.selectResults = [[{ startMonth: 10 }]];
  state.deletes = 0;
  state.returning = [];
  state.wheres = [];
});

describe("deleteBudgetLine", () => {
  it("removes the grupo's own twelve rows of the safra on this farm, not its contas'", async () => {
    state.returning = [Array.from({ length: 12 }, (_, i) => ({ id: `b-${i}` }))];

    expect(await remove()).toBe(12);
    const removed = renderSql(state.wheres[1] as SQL);
    expect(removed.sql).toContain('"budgets"."farm_id" = $1');
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "admin"]);
  });

  it("removes a conta's line only, and counts nothing when it had none", async () => {
    state.returning = [[]];

    expect(await remove("acc-escritorio")).toBe(0);
    expect(renderSql(state.wheres[1] as SQL).params).toEqual([7, "2025-10-01", "2026-09-30", "admin", "acc-escritorio"]);
  });

  it("refuses with start_month_changed when the farm's início moved in another session, and removes nothing", async () => {
    state.selectResults = [[{ startMonth: 1 }]];

    expect(await remove()).toBe("start_month_changed");
    expect(state.deletes).toBe(0);
  });
});
