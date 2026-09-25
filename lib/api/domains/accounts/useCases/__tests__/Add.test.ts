/**
 * addAccount: creates a conta inside a grupo. The name is trimmed and unique
 * per farm and grupo regardless of case, archived contas included.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows and record their condition, inserts record the row and
 * echo it, or reject with a queued error.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Condition of every `select().where()` call. */
    wheres: [] as unknown[],
    /** Every `insert().values()` row that landed. */
    inserts: [] as Record<string, unknown>[],
    /** Error the next insert rejects with. */
    insertError: null as unknown,
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: (condition: unknown) => {
      state.wheres.push(condition);
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function insertBuilder() {
  return {
    values: (row: Record<string, unknown>) => ({
      returning: () => {
        if (state.insertError) {
          const error = state.insertError;
          state.insertError = null;
          return Promise.reject(error);
        }
        state.inserts.push(row);
        return Promise.resolve([{ archivedAt: null, ...row }]);
      },
    }),
  };
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { AddAccountUseCase } from "../Add.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
  state.inserts = [];
  state.insertError = null;
});

describe("addAccount", () => {
  it("trims the name and creates the conta", async () => {
    state.selectResults = [[]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "nutrition",
      name: "  Sal mineral ",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ farmId: 7, group: "nutrition", name: "Sal mineral" });
    expect(result).toMatchObject({ id: state.inserts[0].id, group: "nutrition", name: "Sal mineral" });
  });

  it("answers duplicate when the grupo has the name in another case", async () => {
    state.selectResults = [[{ id: "acc-1" }]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "nutrition",
      name: " SAL MINERAL ",
    });

    expect(result).toBe("duplicate");
    expect(state.inserts).toEqual([]);
    const query = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(query.sql).toContain('lower("accounts"."name") = lower(');
    expect(query.params).toContain("SAL MINERAL");
  });

  it("answers duplicate when a concurrent insert wins the unique index", async () => {
    state.selectResults = [[]];
    state.insertError = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "revenue",
      name: "Aluguel de pasto",
    });

    expect(result).toBe("duplicate");
  });
});
