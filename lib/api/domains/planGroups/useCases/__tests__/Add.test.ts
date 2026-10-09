/**
 * addPlanGroup: creates a grupo of the plano under a tipo, trimmed. No name is
 * reserved any more: only another grupo of the same farm, of any tipo, can
 * hold it, through the unique index on (farm_id, lower(name)), so another
 * farm's grupo never clashes.
 */
import type { SQL } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
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

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { planGroups } from "@/lib/db/schema";
import type { GroupKind } from "@/lib/types";

import { AddPlanGroupUseCase } from "../Add.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  kind: "investment",
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-05T12:00:00Z"),
};

const add = (name: string, kind: GroupKind = "investment", farmId = 7) =>
  new AddPlanGroupUseCase().run({ farmId, kind, name });

beforeEach(() => {
  state.inserts = [];
  state.returning = [];
  state.insertErrors = [];
});

describe("addPlanGroup", () => {
  it("trims the name and creates the grupo under its tipo", async () => {
    state.returning = [[ROW]];

    const result = await add("  Máquinas e veículos ");

    expect(state.inserts).toEqual([
      { id: expect.any(String), farmId: 7, kind: "investment", name: "Máquinas e veículos" },
    ]);
    expect(result).toMatchObject({
      id: "g-maq",
      kind: "investment",
      name: "Máquinas e veículos",
      createdAt: "2026-10-05T12:00:00.000Z",
    });
  });

  it("takes a default grupo's name: no name is reserved, only the farm's own grupos clash", async () => {
    state.returning = [[{ ...ROW, kind: "expense", name: "Nutrição" }]];

    expect(await add("Nutrição", "expense")).toMatchObject({ kind: "expense", name: "Nutrição" });
    expect(state.inserts).toEqual([{ id: expect.any(String), farmId: 7, kind: "expense", name: "Nutrição" }]);
  });

  it("answers duplicate when the farm already has the name in any case, whatever its tipo", async () => {
    state.insertErrors = [Object.assign(new Error("duplicate key"), { cause: { code: "23505" } })];

    // "Nutrição" is a despesa grupo of the farm; a receita grupo cannot take it.
    expect(await add("NUTRIÇÃO", "revenue")).toBe("duplicate");
  });

  it("keeps one name per farm across every tipo: the unique index leaves the kind out", () => {
    const [index] = getTableConfig(planGroups).indexes;

    expect(index.config.unique).toBe(true);
    expect(index.config.columns.map((c) => ("name" in c ? c.name : renderSql(c as SQL).sql))).toEqual([
      "farm_id",
      'lower("plan_groups"."name")',
    ]);
  });

  it("takes a name another farm has: nothing but this farm's unique index can refuse it", async () => {
    state.returning = [[{ ...ROW, farmId: 8 }]];

    expect(await add("Máquinas e veículos", "investment", 8)).toMatchObject({ name: "Máquinas e veículos" });
    expect(state.inserts[0]).toMatchObject({ farmId: 8 });
  });
});
