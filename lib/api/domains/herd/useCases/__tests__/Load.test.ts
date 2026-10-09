/**
 * loadHerd: every grupo of the plano travels with the herd, archived ones
 * included, by name; the contas come by name (the client groups them).
 *
 * A db stub keyed by table: every select resolves to the rows queued for the
 * table it reads `from`, and records its `orderBy`. The recorrências top-up is
 * stubbed out.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { accounts, planGroups } from "@/lib/db/schema";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows a select resolves to, by the table it reads from. */
    rows: new Map<unknown, unknown[]>(),
    /** The orderBy of the select on each table. */
    orderBys: new Map<unknown, SQL[]>(),
  },
}));

function selectBuilder() {
  let table: unknown;
  const builder = {
    from: (from: unknown) => {
      table = from;
      return builder;
    },
    innerJoin: () => builder,
    where: () => builder,
    groupBy: () => builder,
    orderBy: (...columns: SQL[]) => {
      state.orderBys.set(table, columns);
      return builder;
    },
    then: (resolve: (rows: unknown[]) => unknown) => resolve(state.rows.get(table) ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder } }));
vi.mock("@/lib/api/domains/expenses/useCases/TopUpSeries.useCase", () => ({
  TopUpSeriesUseCase: class {
    run = () => Promise.resolve();
  },
}));

import { LoadHerdUseCase } from "../Load.useCase";

const orderOf = (table: unknown) => (state.orderBys.get(table) ?? []).map((column) => renderSql(column).sql);

beforeEach(() => {
  state.rows.clear();
  state.orderBys.clear();
});

describe("loadHerd", () => {
  it("returns every grupo of the farm with its tipo, archived ones included, by name", async () => {
    state.rows.set(planGroups, [
      {
        id: "g-1",
        farmId: 7,
        kind: "expense",
        name: "Frete",
        archivedAt: new Date("2026-10-03T12:00:00Z"),
        createdAt: new Date("2026-10-01T12:00:00Z"),
      },
      { id: "g-2", farmId: 7, kind: "revenue", name: "Receitas", archivedAt: null, createdAt: new Date("2026-09-15T12:00:00Z") },
    ]);

    const data = await new LoadHerdUseCase().run({ farmId: 7 });

    expect(data.planGroups).toEqual([
      {
        id: "g-1",
        kind: "expense",
        name: "Frete",
        archivedAt: "2026-10-03T12:00:00.000Z",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      { id: "g-2", kind: "revenue", name: "Receitas", createdAt: "2026-09-15T12:00:00.000Z" },
    ]);
    expect(orderOf(planGroups)).toEqual(['"plan_groups"."name" asc']);
  });

  it("is no grupos for a farm that has none", async () => {
    expect((await new LoadHerdUseCase().run({ farmId: 7 })).planGroups).toEqual([]);
  });

  it("lists the contas by name: a grupo key no longer sorts them", async () => {
    await new LoadHerdUseCase().run({ farmId: 7 });

    expect(orderOf(accounts)).toEqual(['"accounts"."name" asc']);
  });
});
