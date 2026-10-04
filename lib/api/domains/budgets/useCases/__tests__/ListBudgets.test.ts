/** listBudgets: one safra's rows, of this farm only, by the farm's start month. */
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

import { ListBudgetsUseCase } from "../ListBudgets.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("listBudgets", () => {
  it("reads the safra's calendar months on this farm and nothing of another farm", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [
        {
          id: "b-1",
          farmId: 7,
          category: "admin",
          accountId: null,
          month: "2025-10-01",
          amountBrl: 1500,
          distribution: "equal",
          updatedAt: new Date(0),
          updatedBy: "user-1",
        },
      ],
    ];

    const result = await new ListBudgetsUseCase().run({ farmId: 7, safra: 2025 });

    expect(renderSql(state.wheres[0] as SQL).params).toEqual([7]);
    const query = renderSql(state.wheres[1] as SQL);
    expect(query.sql).toContain('"budgets"."farm_id" = $1');
    expect(query.sql).toContain('"budgets"."month" between $2 and $3');
    // Safra 2025/26 starting in outubro.
    expect(query.params).toEqual([7, "2025-10-01", "2026-09-30"]);
    expect(result).toEqual([
      { id: "b-1", category: "admin", month: "2025-10-01", amountBrl: 1500, distribution: "equal" },
    ]);
  });

  it("follows a safra that starts in janeiro", async () => {
    state.selectResults = [[{ startMonth: 1 }], []];

    await new ListBudgetsUseCase().run({ farmId: 7, safra: 2026 });

    expect(renderSql(state.wheres[1] as SQL).params).toEqual([7, "2026-01-01", "2026-12-31"]);
  });
});
