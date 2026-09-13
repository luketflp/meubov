/** cancelInvite: closes a convite as canceled, bounded by the actor's grant ceiling. */
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
import { CancelInviteUseCase } from "../CancelInvite.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
  state.wheres = [];
});

describe("cancelInvite", () => {
  it("answers false when the convite is not this farm's", async () => {
    state.selectResults = [[]];
    const result = await new CancelInviteUseCase().run({ farmId: 7, id: 9, actor: owner, now });
    expect(result).toBe(false);
    expect(state.updates).toEqual([]);
  });

  it("refuses a convite above the actor's grant ceiling, without touching it", async () => {
    state.selectResults = [[{ permissions: PRESETS.gerente }]];
    const result = await new CancelInviteUseCase().run({
      farmId: 7,
      id: 9,
      actor: { userId: "u-marta", role: "member", permissions: PRESETS.consultor },
      now,
    });
    expect(result).toBe(false);
    expect(state.updates).toEqual([]);
  });

  it("cancels a convite within the actor's levels", async () => {
    state.selectResults = [[{ permissions: PRESETS.vaqueiro }]];
    state.returning = [[{ id: 9 }]];
    const result = await new CancelInviteUseCase().run({
      farmId: 7,
      id: 9,
      actor: { userId: "u-marta", role: "member", permissions: PRESETS.gerente },
      now,
    });
    expect(result).toBe(true);
    expect(state.updates[0]).toEqual({ status: "canceled", respondedAt: now });
  });

  it("the Dono cancels any convite regardless of levels", async () => {
    state.selectResults = [[{ permissions: PRESETS.gerente }]];
    state.returning = [[{ id: 9 }]];
    const result = await new CancelInviteUseCase().run({ farmId: 7, id: 9, actor: owner, now });
    expect(result).toBe(true);
  });

  it("filters both the lookup and the update by id and farm_id, and the update by pending/declined status", async () => {
    state.selectResults = [[{ permissions: PRESETS.vaqueiro }]];
    state.returning = [[{ id: 9 }]];
    await new CancelInviteUseCase().run({ farmId: 7, id: 9, actor: owner, now });

    const lookup = renderSql(state.wheres[0] as Parameters<typeof renderSql>[0]);
    expect(lookup.sql).toContain('"farm_invites"."id" = $');
    expect(lookup.sql).toContain('"farm_invites"."farm_id" = $');
    expect(lookup.params).toEqual(expect.arrayContaining([9, 7]));

    const update = renderSql(state.wheres[1] as Parameters<typeof renderSql>[0]);
    expect(update.sql).toContain('"farm_invites"."id" = $');
    expect(update.sql).toContain('"farm_invites"."farm_id" = $');
    expect(update.sql).toContain('"farm_invites"."status" in ($');
    expect(update.params).toEqual(expect.arrayContaining([9, 7, "pending", "declined"]));
  });
});
