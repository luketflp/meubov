/** updateMember: new levels for someone the actor may manage and within their ceiling. */
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
import { UpdateMemberUseCase } from "../UpdateMember.useCase";

const marta = {
  userId: "u-marta",
  role: "member" as const,
  permissions: { ...FULL_PERMISSIONS, finance: "view" as const },
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.wheres = [];
});

describe("updateMember", () => {
  it("answers not_found for someone outside the farm", async () => {
    state.selectResults = [[]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-nobody",
      permissions: PRESETS.consultor,
    });
    expect(result).toBe("not_found");
  });

  it("never touches the Dono", async () => {
    state.selectResults = [[{ role: "owner", permissions: null }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-owner",
      permissions: PRESETS.consultor,
    });
    expect(result).toEqual({ blocked: "owner" });
    expect(state.updates).toEqual([]);
  });

  it("never lets the actor change their own levels", async () => {
    state.selectResults = [[{ role: "member", permissions: marta.permissions }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-marta",
      permissions: FULL_PERMISSIONS,
    });
    expect(result).toEqual({ blocked: "self" });
  });

  it("refuses a member who holds more than the actor", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.gerente }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-roberto",
      permissions: PRESETS.vaqueiro,
    });
    expect(result).toEqual({ blocked: "above" });
  });

  it("refuses a grant above the actor's level", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-joao",
      permissions: { ...PRESETS.vaqueiro, finance: "edit" },
    });
    expect(result).toEqual({ forbidden: "finance" });
  });

  it("stores the parsed levels with the preset they match", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-joao",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
    expect(state.updates[0]).toEqual({
      preset: "personalizado",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
    expect(result).toEqual({
      preset: "personalizado",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
  });

  it("scopes both the lookup and the write to this farm and this member", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-joao",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
    expect(state.wheres).toHaveLength(2); // select, then update — the same scope both times
    for (const condition of state.wheres) {
      const { sql, params } = renderSql(condition as Parameters<typeof renderSql>[0]);
      expect(sql).toContain('"farm_users"."farm_id" = $');
      expect(sql).toContain('"farm_users"."user_id" = $');
      expect(params).toEqual(expect.arrayContaining([7, "u-joao"]));
    }
  });
});
