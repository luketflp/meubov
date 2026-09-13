/** declineInvite: closes a pending convite as declined, scoped to the caller's own e-mail. */
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

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { DeclineInviteUseCase } from "../Decline.useCase";

const now = new Date("2026-09-12T15:00:00Z");

beforeEach(() => {
  state.updates = [];
  state.returning = [];
  state.wheres = [];
});

describe("declineInvite", () => {
  it("answers false when nothing pending matches the id and e-mail", async () => {
    state.returning = [[]];
    const result = await new DeclineInviteUseCase().run({
      inviteId: 3,
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toBe(false);
  });

  it("declines a pending convite and returns true", async () => {
    state.returning = [[{ id: 3 }]];
    const result = await new DeclineInviteUseCase().run({
      inviteId: 3,
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toBe(true);
    expect(state.updates[0]).toEqual({ status: "declined", respondedAt: now });
  });

  it("filters by id, e-mail and pending status — nobody declines another's convite", async () => {
    state.returning = [[{ id: 3 }]];
    await new DeclineInviteUseCase().run({ inviteId: 3, email: "zeca@hotmail.com", now });
    const { sql, params } = renderSql(state.wheres[0] as Parameters<typeof renderSql>[0]);
    expect(sql).toContain('"farm_invites"."id" = $');
    expect(sql).toContain('"farm_invites"."email" = $');
    expect(sql).toContain('"farm_invites"."status" = $');
    expect(params).toEqual(expect.arrayContaining([3, "zeca@hotmail.com", "pending"]));
  });
});
