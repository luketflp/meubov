/** createFarm: a farm the caller owns with the default grupos, optionally started from a farm they belong to. */
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

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import { CreateFarmUseCase } from "../Create.useCase";

const input = { userId: "u-lucas", name: " Fazenda Boa Vista ", municipality: "Sorriso - MT " };

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
  state.wheres = [];
});

describe("createFarm", () => {
  it("refuses an invalid farm before touching the database", async () => {
    const result = await new CreateFarmUseCase().run({ ...input, name: "  " });
    expect(result).toEqual({ invalid: "name_required" });
    expect(state.inserts).toEqual([]);
  });

  it("creates the farm with trimmed fields, the caller as Dono and the eleven default grupos", async () => {
    state.returning = [[{ id: 42 }]];
    const result = await new CreateFarmUseCase().run(input);
    expect(result).toEqual({ farmId: 42 });
    expect(state.inserts).toEqual([
      { name: "Fazenda Boa Vista", municipality: "Sorriso - MT", stateRegistration: "", manager: "" },
      { farmId: 42, userId: "u-lucas", role: "owner" },
      DEFAULT_GROUPS.map(({ kind, name }) => ({ id: expect.any(String), farmId: 42, kind, name })),
    ]);
  });

  it("refuses a source farm the caller does not belong to", async () => {
    state.selectResults = [[]];
    const result = await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });
    expect(result).toBe("not_a_member");
    expect(state.inserts).toEqual([]);
    const source = renderSql(state.wheres[0] as SQL);
    expect(source.sql).toContain('"farm"."deleted_at" is null');
    expect(source.params).toEqual(expect.arrayContaining([7, "u-lucas"]));
  });

  it("copies raças, categorias and the active grupos with fresh ids, instead of the defaults", async () => {
    state.selectResults = [
      [{ farmId: 7 }],
      [{ name: "Nelore" }, { name: "Angus" }],
      [{ name: "Matriz", baseCategory: "cow" }],
      [
        { kind: "expense", name: "Alimentação" },
        { kind: "revenue", name: "Receitas" },
      ],
    ];
    state.returning = [[{ id: 42 }]];

    const result = await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });

    expect(result).toEqual({ farmId: 42 });
    expect(state.inserts.slice(2)).toEqual([
      [
        { farmId: 42, name: "Nelore" },
        { farmId: 42, name: "Angus" },
      ],
      [{ id: expect.any(String), farmId: 42, name: "Matriz", baseCategory: "cow" }],
      [
        { id: expect.any(String), farmId: 42, kind: "expense", name: "Alimentação" },
        { id: expect.any(String), farmId: 42, kind: "revenue", name: "Receitas" },
      ],
    ]);
    // Only the source farm's grupos that are not archived.
    const grupos = renderSql(state.wheres.at(-1) as SQL);
    expect(grupos.sql).toContain('"plan_groups"."archived_at" is null');
    expect(grupos.params).toEqual([7]);
  });

  it("skips a kind the source does not have", async () => {
    state.selectResults = [[{ farmId: 7 }], [{ name: "Nelore" }], [], []];
    state.returning = [[{ id: 42 }]];
    await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });
    expect(state.inserts).toHaveLength(3);
  });
});
