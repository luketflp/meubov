/**
 * inviteMember: a convite by e-mail, bounded by the inviter's own levels,
 * refreshing a pending one and replacing a declined one.
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
    insertErrors: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { InviteMemberUseCase } from "../Invite.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };

const storedInvite = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
  state.insertErrors = [];
});

describe("inviteMember", () => {
  it("refuses a malformed e-mail before touching the database", async () => {
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(result).toBe("invalid_email");
    expect(state.inserts).toEqual([]);
  });

  it("refuses levels above the inviter's", async () => {
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: { ...FULL_PERMISSIONS, finance: "view" } },
      email: "zeca@hotmail.com",
      permissions: PRESETS.gerente,
      now,
    });
    expect(result).toEqual({ forbidden: "finance" });
  });

  it("refuses an e-mail that already belongs to a member", async () => {
    state.selectResults = [[{ userId: "u-zeca" }]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: " Zeca@Hotmail.com ",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(result).toBe("already_member");
    expect(state.inserts).toEqual([]);
  });

  it("refreshes a pending convite instead of adding a second one", async () => {
    state.selectResults = [[], [{ id: 3 }]];
    state.returning = [[storedInvite({ preset: "consultor", permissions: PRESETS.consultor })]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca@hotmail.com",
      permissions: PRESETS.consultor,
      now,
    });
    expect(state.inserts).toEqual([]);
    expect(state.updates[0]).toMatchObject({
      preset: "consultor",
      permissions: PRESETS.consultor,
      expiresAt: new Date("2026-09-19T15:00:00Z"),
    });
    expect(result).toMatchObject({ id: 3, state: "pending", preset: "consultor" });
  });

  it("cancels a declined convite and creates a new pending one", async () => {
    state.selectResults = [[], []];
    state.returning = [[storedInvite({ id: 4 })]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca@hotmail.com",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(state.updates[0]).toEqual({ status: "canceled", respondedAt: now });
    expect(state.inserts[0]).toMatchObject({
      farmId: 7,
      email: "zeca@hotmail.com",
      preset: "vaqueiro",
      invitedByUserId: "u-owner",
    });
    expect(result).toMatchObject({ id: 4, email: "zeca@hotmail.com", state: "pending" });
  });

  it("refuses to overwrite a pending convite above the actor's levels", async () => {
    state.selectResults = [[], [{ id: 3, permissions: PRESETS.gerente }]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: PRESETS.consultor },
      email: "zeca@hotmail.com",
      permissions: PRESETS.consultor,
      now,
    });
    expect(result).toEqual({ forbidden: "herd" });
    expect(state.updates).toEqual([]);
  });

  it("survives a concurrent invite winning the pending-per-email race", async () => {
    // First attempt sees no pending row, then loses the insert to a concurrent
    // invite that beat it to farm_invites_one_pending_per_email_unique. The
    // retry now finds that row pending and updates it instead.
    state.selectResults = [[], [], [], [{ id: 3 }]];
    state.insertErrors = [{ code: "23505" }];
    state.returning = [[storedInvite()]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca@hotmail.com",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(state.inserts).toHaveLength(1);
    expect(result).toMatchObject({ id: 3, state: "pending" });
  });
});
