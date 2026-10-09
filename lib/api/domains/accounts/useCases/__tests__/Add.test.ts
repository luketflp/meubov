/**
 * addAccount: creates a conta inside a grupo. The name is trimmed and unique
 * per farm and grupo regardless of case, archived contas included.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the grupo, then the name clash) and record their
 * condition, inserts record the row and echo it, or reject with a queued error.
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

/** A plan_groups row of farm 7, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");
const FINANCIAMENTOS = grupo("grp-pronaf", "financing");

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
  state.inserts = [];
  state.insertError = null;
});

describe("addAccount", () => {
  it("trims the name and creates the conta", async () => {
    state.selectResults = [[NUTRICAO], []];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-nutricao",
      name: "  Sal mineral ",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ farmId: 7, group: "grp-nutricao", name: "Sal mineral" });
    expect(result).toMatchObject({ id: state.inserts[0].id, group: "grp-nutricao", name: "Sal mineral" });
  });

  it("answers duplicate when the grupo has the name in another case", async () => {
    state.selectResults = [[NUTRICAO], [{ id: "acc-1" }]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-nutricao",
      name: " SAL MINERAL ",
    });

    expect(result).toBe("duplicate");
    expect(state.inserts).toEqual([]);
    const query = new PgDialect().sqlToQuery(state.wheres[1] as SQL);
    expect(query.sql).toContain('lower("accounts"."name") = lower(');
    expect(query.params).toContain("SAL MINERAL");
  });

  it("answers duplicate when a concurrent insert wins the unique index", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")], []];
    state.insertError = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-receitas",
      name: "Aluguel de pasto",
    });

    expect(result).toBe("duplicate");
  });

  it("takes the saldo devedor inicial of a conta in a grupo of financiamentos, whatever its name", async () => {
    state.selectResults = [[FINANCIAMENTOS], []];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-pronaf",
      name: "Pronaf Investimento",
      openingBalanceBrl: 180000,
      openingDate: "2026-06-30",
    });

    expect(state.inserts[0]).toMatchObject({
      group: "grp-pronaf",
      openingBalanceBrl: 180000,
      openingDate: "2026-06-30",
    });
    expect(result).toMatchObject({ group: "grp-pronaf", openingBalanceBrl: 180000, openingDate: "2026-06-30" });
  });

  it("refuses a saldo inicial without its date, a date alone, or one outside financiamentos", async () => {
    const conta = { farmId: 7, name: "Pronaf" };
    state.selectResults = [[FINANCIAMENTOS]];
    expect(await new AddAccountUseCase().run({ ...conta, group: "grp-pronaf", openingBalanceBrl: 1000 })).toBe(
      "invalid_opening"
    );
    state.selectResults = [[FINANCIAMENTOS]];
    expect(await new AddAccountUseCase().run({ ...conta, group: "grp-pronaf", openingDate: "2026-06-30" })).toBe(
      "invalid_opening"
    );
    // A grupo of sócios named "Financiamentos" is still not one of financiamentos.
    state.selectResults = [[{ ...grupo("grp-socios", "partners"), name: "Financiamentos" }]];
    expect(
      await new AddAccountUseCase().run({
        ...conta,
        group: "grp-socios",
        openingBalanceBrl: 1000,
        openingDate: "2026-06-30",
      })
    ).toBe("invalid_opening");
    expect(state.inserts).toEqual([]);
  });

  it("creates a conta in a grupo of the farm of any kind, and refuses a grupo that is not this farm's", async () => {
    // The grupo (one of this farm's), then the name clash (none).
    state.selectResults = [[grupo("grp-maq", "investment")], []];

    const result = await new AddAccountUseCase().run({ farmId: 7, group: "grp-maq", name: "Trator" });

    const read = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(read.sql).toContain('"plan_groups"."farm_id"');
    expect(read.params).toEqual(expect.arrayContaining([7, "grp-maq"]));
    expect(result).toMatchObject({ group: "grp-maq", name: "Trator" });

    // Another farm's grupo, an old built-in key, the tree's Despesas node: no grupo of this farm by that id.
    for (const group of ["grp-of-another-farm", "nutrition", "despesas"]) {
      state.selectResults = [[]];
      expect(await new AddAccountUseCase().run({ farmId: 7, group, name: "Trator" })).toBe("invalid_category");
    }
    expect(state.inserts).toHaveLength(1);
  });
});
