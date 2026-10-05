/**
 * updateExpenseGroup: renames a grupo (refused like a new name, except that its
 * own name in another case is fine) or archives and restores it.
 */
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

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { UpdateExpenseGroupUseCase, type ExpenseGroupPatchInput } from "../Update.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

const update = (patch: ExpenseGroupPatchInput, repo?: RepositoryType) =>
  new UpdateExpenseGroupUseCase(repo).run({ farmId: 7, id: "g-maq", patch });

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
});

describe("updateExpenseGroup", () => {
  it("renames, trimmed", async () => {
    state.returning = [[{ ...ROW, name: "Máquinas" }]];

    expect(await update({ name: " Máquinas " })).toMatchObject({ id: "g-maq", name: "Máquinas" });
    expect(state.updates).toEqual([{ name: "Máquinas" }]);
  });

  it("renames a grupo to its own name in another case", async () => {
    state.returning = [[{ ...ROW, name: "MÁQUINAS E VEÍCULOS" }]];

    expect(await update({ name: "MÁQUINAS E VEÍCULOS" })).toMatchObject({ name: "MÁQUINAS E VEÍCULOS" });
    expect(state.updates).toEqual([{ name: "MÁQUINAS E VEÍCULOS" }]);
  });

  it("refuses a built-in or top grupo label in any case or with spaces, writing nothing", async () => {
    for (const name of ["  nutrição ", "RECEITAS"]) expect(await update({ name })).toBe("duplicate");
    expect(state.updates).toEqual([]);
  });

  it("answers duplicate when another grupo of the farm has the name", async () => {
    const unique = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });
    const taken = {
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.reject(unique) }) }) }),
    } as unknown as RepositoryType;

    expect(await update({ name: "Arrendamento" }, taken)).toBe("duplicate");
  });

  it("archives and restores", async () => {
    state.returning = [[{ ...ROW, archivedAt: new Date("2026-10-05T12:00:00Z") }], [ROW]];

    expect(await update({ archived: true })).toMatchObject({ archivedAt: "2026-10-05T12:00:00.000Z" });
    await update({ archived: false });

    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(state.updates[1]).toEqual({ archivedAt: null });
  });

  it("answers null for a grupo of another farm", async () => {
    state.returning = [[]];

    expect(await update({ archived: true })).toBeNull();
  });
});
