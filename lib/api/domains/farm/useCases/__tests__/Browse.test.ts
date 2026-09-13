/**
 * browseFarms: the list a caller can switch between, each entry carrying its
 * resolved permission levels so the client never re-derives the Dono or
 * superuser case.
 *
 * The db mock is a chainable select stub: `from/leftJoin/innerJoin/where/
 * orderBy` all return the same builder, which resolves (it is thenable, like
 * Drizzle's own query builder) to the fixture rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const builder = {
        from() {
          return builder;
        },
        leftJoin() {
          return builder;
        },
        innerJoin() {
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        then(
          resolve: (rows: Record<string, unknown>[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(state.rows).then(resolve, reject);
        },
      };
      return builder;
    },
  },
}));

import { BrowseFarmsUseCase } from "../Browse.useCase";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

beforeEach(() => {
  state.rows = [];
});

describe("browseFarms", () => {
  it("resolves a member's stored levels and passes the preset and joinedAt through", async () => {
    state.rows = [
      {
        id: 1,
        name: "Fazenda A",
        role: "member",
        preset: "vaqueiro",
        permissions: PRESETS.vaqueiro,
        joinedAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ];

    const result = await new BrowseFarmsUseCase().run({ userId: "u1", superuser: false });

    expect(result).toEqual([
      {
        id: 1,
        name: "Fazenda A",
        role: "member",
        preset: "vaqueiro",
        permissions: PRESETS.vaqueiro,
        joinedAt: "2024-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("gives a non-superuser owner row full permissions regardless of stored levels", async () => {
    state.rows = [
      {
        id: 2,
        name: "Fazenda B",
        role: "owner",
        preset: null,
        permissions: null,
        joinedAt: new Date("2024-01-15T00:00:00.000Z"),
      },
    ];

    const result = await new BrowseFarmsUseCase().run({ userId: "u1", superuser: false });

    expect(result[0].permissions).toEqual(FULL_PERMISSIONS);
  });

  it("defaults a superuser's non-member farm to owner, full permissions and a null joinedAt", async () => {
    state.rows = [
      { id: 3, name: "Fazenda C", role: null, preset: null, permissions: null, joinedAt: null },
    ];

    const result = await new BrowseFarmsUseCase().run({ userId: "root", superuser: true });

    expect(result).toEqual([
      {
        id: 3,
        name: "Fazenda C",
        role: "owner",
        preset: null,
        permissions: FULL_PERMISSIONS,
        joinedAt: null,
      },
    ]);
  });

  it("keeps a superuser's real membership role and joinedAt, but still grants full permissions", async () => {
    state.rows = [
      {
        id: 4,
        name: "Fazenda D",
        role: "member",
        preset: "consultor",
        permissions: PRESETS.consultor,
        joinedAt: new Date("2024-02-02T00:00:00.000Z"),
      },
    ];

    const result = await new BrowseFarmsUseCase().run({ userId: "root", superuser: true });

    expect(result).toEqual([
      {
        id: 4,
        name: "Fazenda D",
        role: "member",
        preset: "consultor",
        permissions: FULL_PERMISSIONS,
        joinedAt: "2024-02-02T00:00:00.000Z",
      },
    ]);
  });
});
