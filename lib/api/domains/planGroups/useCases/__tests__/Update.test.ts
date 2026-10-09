/**
 * updatePlanGroup: renames a grupo of any tipo (refused like a new name,
 * except that its own name in another case is fine) or archives and restores
 * it. The tipo is not part of the patch.
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

import { UpdatePlanGroupUseCase, type PlanGroupPatchInput } from "../Update.useCase";

const ROW = {
  id: "g-rec",
  farmId: 7,
  kind: "revenue",
  name: "Receitas",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

const update = (patch: PlanGroupPatchInput, repo?: RepositoryType) =>
  new UpdatePlanGroupUseCase(repo).run({ farmId: 7, id: "g-rec", patch });

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
});

describe("updatePlanGroup", () => {
  it("renames a default grupo, trimmed, and keeps its tipo", async () => {
    state.returning = [[{ ...ROW, name: "Vendas" }]];

    expect(await update({ name: " Vendas " })).toMatchObject({ id: "g-rec", kind: "revenue", name: "Vendas" });
    expect(state.updates).toEqual([{ name: "Vendas" }]);
  });

  it("renames a grupo to its own name in another case", async () => {
    state.returning = [[{ ...ROW, name: "RECEITAS" }]];

    expect(await update({ name: "RECEITAS" })).toMatchObject({ name: "RECEITAS" });
    expect(state.updates).toEqual([{ name: "RECEITAS" }]);
  });

  it("answers duplicate when another grupo of the farm, of any tipo, has the name", async () => {
    const unique = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });
    const taken = {
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.reject(unique) }) }) }),
    } as unknown as RepositoryType;

    expect(await update({ name: "Nutrição" }, taken)).toBe("duplicate");
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
