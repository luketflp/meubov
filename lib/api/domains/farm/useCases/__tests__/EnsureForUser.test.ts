/** ensureFarmForUser: a user's first access creates their farm with the eleven default grupos, once. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import { EnsureFarmForUserUseCase } from "../EnsureForUser.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
});

describe("ensureFarmForUser", () => {
  it("creates an empty farm with the caller as Dono and the eleven default grupos", async () => {
    state.selectResults = [[]];
    state.returning = [[{ id: 42 }]];

    expect(await new EnsureFarmForUserUseCase().run({ userId: "u-lucas" })).toBe(42);

    expect(state.inserts).toEqual([
      { name: "", municipality: "", stateRegistration: "", manager: "" },
      { farmId: 42, userId: "u-lucas", role: "owner" },
      DEFAULT_GROUPS.map(({ kind, name }) => ({ id: expect.any(String), farmId: 42, kind, name })),
    ]);
  });

  it("answers the farm the user already has and writes nothing", async () => {
    state.selectResults = [[{ farmId: 7 }]];

    expect(await new EnsureFarmForUserUseCase().run({ userId: "u-lucas" })).toBe(7);
    expect(state.inserts).toEqual([]);
  });
});
