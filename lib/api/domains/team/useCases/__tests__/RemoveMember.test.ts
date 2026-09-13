/** removeMember: the same reach rules as updateMember, then the membership goes. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

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

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { RemoveMemberUseCase } from "../RemoveMember.useCase";

const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("removeMember", () => {
  it("removes a member the actor may manage", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    const result = await new RemoveMemberUseCase().run({ farmId: 7, actor: owner, userId: "u-joao" });
    expect(result).toBe("removed");
    expect(state.deletes).toBe(1);
  });

  it("never removes the Dono", async () => {
    state.selectResults = [[{ role: "owner", permissions: null }]];
    const result = await new RemoveMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: FULL_PERMISSIONS },
      userId: "u-owner",
    });
    expect(result).toEqual({ blocked: "owner" });
    expect(state.deletes).toBe(0);
  });

  it("answers not_found for someone outside the farm", async () => {
    state.selectResults = [[]];
    const result = await new RemoveMemberUseCase().run({ farmId: 7, actor: owner, userId: "u-x" });
    expect(result).toBe("not_found");
  });

  it("never removes the actor themselves", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.gerente }]];
    const result = await new RemoveMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-joao", role: "member", permissions: PRESETS.gerente },
      userId: "u-joao",
    });
    expect(result).toEqual({ blocked: "self" });
    expect(state.deletes).toBe(0);
  });

  it("never removes a member who holds more than the actor", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.gerente }]];
    const result = await new RemoveMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: { ...FULL_PERMISSIONS, finance: "view" } },
      userId: "u-roberto",
    });
    expect(result).toEqual({ blocked: "above" });
    expect(state.deletes).toBe(0);
  });

  it("scopes both the lookup and the delete to this farm and this member", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    await new RemoveMemberUseCase().run({ farmId: 7, actor: owner, userId: "u-joao" });
    expect(state.wheres).toHaveLength(2); // select, then delete — the same scope both times
    for (const condition of state.wheres) {
      const { sql, params } = renderSql(condition as Parameters<typeof renderSql>[0]);
      expect(sql).toContain('"farm_users"."farm_id" = $');
      expect(sql).toContain('"farm_users"."user_id" = $');
      expect(params).toEqual(expect.arrayContaining([7, "u-joao"]));
    }
  });
});
