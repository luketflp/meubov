/** deleteFarm: the Dono soft-deletes a farm that is not their last, and its convites go. */
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
import { DeleteFarmUseCase } from "../Delete.useCase";

const now = new Date("2026-09-13T18:00:00Z");

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.wheres = [];
});

describe("deleteFarm", () => {
  it("answers farm_not_found for a farm the caller has no live membership in", async () => {
    state.selectResults = [[{ farmId: 3, role: "owner" }, { farmId: 4, role: "owner" }]];
    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });
    expect(result).toBe("farm_not_found");
    expect(state.updates).toEqual([]);
  });

  it("refuses a member", async () => {
    state.selectResults = [[{ farmId: 9, role: "member" }, { farmId: 3, role: "owner" }]];
    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });
    expect(result).toBe("not_owner");
    expect(state.updates).toEqual([]);
  });

  it("refuses the last farm", async () => {
    state.selectResults = [[{ farmId: 9, role: "owner" }]];
    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });
    expect(result).toBe("last_farm");
    expect(state.updates).toEqual([]);
  });

  it("stamps the farm and cancels its pending convites", async () => {
    state.selectResults = [[{ farmId: 9, role: "owner" }, { farmId: 3, role: "member" }]];

    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });

    expect(result).toBe("deleted");
    expect(state.updates).toEqual([{ deletedAt: now }, { status: "canceled", respondedAt: now }]);
    expect(renderSql(state.wheres[0] as SQL).sql).toContain('"farm"."deleted_at" is null');
    const invites = renderSql(state.wheres[2] as SQL);
    expect(invites.sql).toContain('"farm_invites"."status"');
    expect(invites.params).toEqual(expect.arrayContaining([9, "pending"]));
  });
});
