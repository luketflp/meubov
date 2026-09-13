/**
 * acceptInvite: the signed-in e-mail claims a pending, unexpired convite and
 * joins the farm. The claim itself is the first statement (an UPDATE ...
 * RETURNING against `farmInvites`, recorded like any other `.set()` in
 * `state.updates` and read back from `state.returning`), so every case below
 * seeds `state.returning` with what that claim would have found instead of
 * `state.selectResults`, which is now only for the inviter's-authority check.
 */
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
import { AcceptInviteUseCase } from "../Accept.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const invite = {
  id: 3,
  farmId: 7,
  email: "zeca@hotmail.com",
  preset: "vaqueiro",
  permissions: PRESETS.vaqueiro,
  status: "pending",
  invitedByUserId: "u-owner",
  createdAt: now,
  expiresAt: new Date("2026-09-19T15:00:00Z"),
  respondedAt: null,
};

/** The stored row `Accept` reads back to re-check whoever sent `invite`: the Dono, so old tests need not care about levels. */
const authorizedInviter = { email: "dono@fazenda.com", role: "owner" as const, permissions: null };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.returning = [];
  state.wheres = [];
});

describe("acceptInvite", () => {
  it("answers not_found when the claim matches no pending, unexpired convite for the e-mail", async () => {
    state.returning = [[]];
    const result = await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "other@hotmail.com",
      now,
    });
    expect(result).toBe("not_found");
    expect(state.inserts).toEqual([]);
  });

  it("claims by id, e-mail, pending status and unexpired convite — every filter that keeps someone from claiming another's", async () => {
    state.returning = [[invite]];
    state.selectResults = [[authorizedInviter]];
    await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    const { sql, params } = renderSql(state.wheres[0] as Parameters<typeof renderSql>[0]);
    expect(sql).toContain('"farm_invites"."id" = $');
    expect(sql).toContain('"farm_invites"."email" = $');
    expect(sql).toContain('"farm_invites"."status" = $');
    expect(sql).toContain('"farm_invites"."expires_at" > $');
    expect(params).toEqual(
      expect.arrayContaining([3, "zeca@hotmail.com", "pending", now.toISOString()])
    );
  });

  it("joins the farm with the convite's levels and closes it", async () => {
    state.returning = [[invite]];
    state.selectResults = [[authorizedInviter]];
    const result = await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toEqual({ farmId: 7 });
    expect(state.inserts[0]).toEqual({
      farmId: 7,
      userId: "u-zeca",
      role: "member",
      preset: "vaqueiro",
      permissions: PRESETS.vaqueiro,
    });
    expect(state.updates[0]).toEqual({ status: "accepted", respondedAt: now });
  });

  it("relies on onConflictDoNothing instead of a separate existing-membership check", async () => {
    state.returning = [[invite]];
    state.selectResults = [[authorizedInviter]];
    const result = await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toEqual({ farmId: 7 });
    // Only the inviter's-authority select ran — no separate lookup for an
    // existing membership before the insert.
    expect(state.selectResults).toEqual([]);
  });

  describe("the inviter's authority is re-checked", () => {
    it("refuses when the inviter was demoted below the convite's levels", async () => {
      state.returning = [[{ ...invite, permissions: FULL_PERMISSIONS }]];
      state.selectResults = [
        [{ email: "marta@fazenda.com", role: "member", permissions: { ...FULL_PERMISSIONS, finance: "view" } }],
      ];
      const result = await new AcceptInviteUseCase().run({
        inviteId: 3,
        userId: "u-zeca",
        email: "zeca@hotmail.com",
        now,
      });
      expect(result).toBe("not_found");
      expect(state.inserts).toEqual([]);
    });

    it("refuses when the inviter has no membership row (removed)", async () => {
      state.returning = [[invite]];
      state.selectResults = [[{ email: "marta@fazenda.com", role: null, permissions: null }]];
      const result = await new AcceptInviteUseCase().run({
        inviteId: 3,
        userId: "u-zeca",
        email: "zeca@hotmail.com",
        now,
      });
      expect(result).toBe("not_found");
      expect(state.inserts).toEqual([]);
    });

    it("accepts when the inviter is the Dono", async () => {
      state.returning = [[invite]];
      state.selectResults = [[authorizedInviter]];
      const result = await new AcceptInviteUseCase().run({
        inviteId: 3,
        userId: "u-zeca",
        email: "zeca@hotmail.com",
        now,
      });
      expect(result).toEqual({ farmId: 7 });
    });

    it("accepts when the inviter still holds the convite's levels and team edit", async () => {
      state.returning = [[invite]];
      state.selectResults = [[{ email: "marta@fazenda.com", role: "member", permissions: PRESETS.gerente }]];
      const result = await new AcceptInviteUseCase().run({
        inviteId: 3,
        userId: "u-zeca",
        email: "zeca@hotmail.com",
        now,
      });
      expect(result).toEqual({ farmId: 7 });
    });
  });
});
