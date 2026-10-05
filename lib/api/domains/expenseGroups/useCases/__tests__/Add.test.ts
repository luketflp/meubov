/**
 * addExpenseGroup: creates a grupo de despesa of the farm, trimmed. A built-in
 * or top grupo's label is refused in any case and with any spaces; a name
 * another grupo of the farm has is refused by the unique index on
 * (farm_id, lower(name)), so another farm's grupo never clashes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { AddExpenseGroupUseCase } from "../Add.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-05T12:00:00Z"),
};

const add = (name: string, farmId = 7) => new AddExpenseGroupUseCase().run({ farmId, name });

beforeEach(() => {
  state.inserts = [];
  state.returning = [];
  state.insertErrors = [];
});

describe("addExpenseGroup", () => {
  it("trims the name and creates the grupo", async () => {
    state.returning = [[ROW]];

    const result = await add("  Máquinas e veículos ");

    expect(state.inserts).toEqual([{ id: expect.any(String), farmId: 7, name: "Máquinas e veículos" }]);
    expect(result).toMatchObject({ id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-10-05T12:00:00.000Z" });
  });

  it("refuses a built-in or top grupo label in any case or with spaces, writing nothing", async () => {
    for (const name of ["  nutrição ", "RECEITAS", "sócios"]) expect(await add(name)).toBe("duplicate");
    expect(state.inserts).toEqual([]);
  });

  it("answers duplicate when the farm already has the name in any case", async () => {
    state.insertErrors = [Object.assign(new Error("duplicate key"), { cause: { code: "23505" } })];

    expect(await add("MÁQUINAS E VEÍCULOS")).toBe("duplicate");
  });

  it("takes a name another farm has: nothing but this farm's unique index can refuse it", async () => {
    state.returning = [[{ ...ROW, farmId: 8 }]];

    expect(await add("Máquinas e veículos", 8)).toMatchObject({ name: "Máquinas e veículos" });
    expect(state.inserts[0]).toMatchObject({ farmId: 8 });
  });
});
