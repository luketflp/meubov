/**
 * addSemenBull: registers a bull the farm buys semen from. Names are unique per
 * farm; blank optional texts are stored as null; a first purchase is written
 * with its Reprodução expense in the same transaction.
 *
 * Same chainable db stub as the other use-case tests: inserts record the table
 * and the row and echo it from returning(), or reject with a queued error.
 */
import { getTableName, is, SQL, type Table } from "drizzle-orm";
import { getTableConfig, PgDialect, type IndexedColumn } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Every `insert().values()` call, in order. */
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    /** Error the next insert rejects with. */
    insertError: null as unknown,
  },
}));

function insertBuilder(table: Table) {
  return {
    values: (row: Record<string, unknown>) => ({
      returning: () => {
        if (state.insertError) {
          const error = state.insertError;
          state.insertError = null;
          return Promise.reject(error);
        }
        state.inserts.push({ table: getTableName(table), row });
        return Promise.resolve([row]);
      },
    }),
  };
}

/** The "Sêmen" conta lookup of a first purchase: this farm has none. */
function selectBuilder() {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve([]),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(run({ insert: insertBuilder, select: selectBuilder })),
  },
}));

import { semenBulls } from "@/lib/db/schema";

import { AddBullUseCase } from "../AddBull.useCase";

beforeEach(() => {
  state.inserts = [];
  state.insertError = null;
});

describe("addSemenBull", () => {
  it("trims the texts and stores blank optionals as null", async () => {
    const result = await new AddBullUseCase().run({
      farmId: 7,
      input: { name: "  Tufão da Serra ", code: " NEL-4471 ", breed: "", central: "   " },
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe("semen_bulls");
    expect(state.inserts[0].row).toMatchObject({
      farmId: 7,
      name: "Tufão da Serra",
      code: "NEL-4471",
      breed: null,
      central: null,
    });
    expect(result).toEqual({
      bull: {
        id: state.inserts[0].row.id,
        name: "Tufão da Serra",
        code: "NEL-4471",
        purchases: [],
      },
    });
    expect(result).not.toHaveProperty("expense");
  });

  it("answers duplicate_name when the farm already has that name", async () => {
    state.insertError = Object.assign(new Error("duplicate key"), {
      cause: { code: "23505" },
    });

    const result = await new AddBullUseCase().run({
      farmId: 7,
      input: { name: "Tufão da Serra" },
    });

    expect(result).toBe("duplicate_name");
    expect(state.inserts).toEqual([]);
  });

  it("answers duplicate_name for a name that differs only by case or spaces", async () => {
    // The use case trims the name; the farm's unique index compares lower(name),
    // so "tufão da serra" collides with "Tufão da Serra" in Postgres.
    const dialect = new PgDialect();
    const unique = getTableConfig(semenBulls).indexes.find(
      (index) => index.config.name === "semen_bulls_farm_id_name_idx"
    );
    expect(unique?.config.unique).toBe(true);
    expect(
      unique?.config.columns.map((column) =>
        is(column, SQL) ? dialect.sqlToQuery(column).sql : (column as IndexedColumn).name
      )
    ).toEqual(["farm_id", 'lower("semen_bulls"."name")']);

    state.insertError = Object.assign(new Error("duplicate key"), {
      cause: { code: "23505" },
    });

    const result = await new AddBullUseCase().run({
      farmId: 7,
      input: { name: "  tufão da serra " },
    });

    expect(result).toBe("duplicate_name");
  });

  it("rethrows any other database error", async () => {
    state.insertError = Object.assign(new Error("boom"), { code: "57P01" });

    await expect(
      new AddBullUseCase().run({ farmId: 7, input: { name: "Tufão da Serra" } })
    ).rejects.toThrow("boom");
  });

  it("writes the first purchase and its expense, linked", async () => {
    const result = await new AddBullUseCase().run({
      farmId: 7,
      input: {
        name: "Tufão da Serra",
        firstPurchase: {
          date: "2026-08-01",
          doses: 30,
          totalBrl: 1140,
          seller: " Central Bela Vista ",
        },
      },
    });

    expect(state.inserts.map((insert) => insert.table)).toEqual([
      "semen_bulls",
      "expenses",
      "semen_purchases",
    ]);
    const [bull, expense, purchase] = state.inserts.map((insert) => insert.row);
    expect(expense).toMatchObject({
      farmId: 7,
      kind: "expense",
      date: "2026-08-01",
      paidAt: "2026-08-01",
      category: "breeding",
      amountBrl: 1140,
      counterparty: null,
      accountId: null,
      notes: "Sêmen — Tufão da Serra, 30 doses",
    });
    expect(purchase).toMatchObject({
      bullId: bull.id,
      date: "2026-08-01",
      doses: 30,
      totalBrl: 1140,
      seller: "Central Bela Vista",
      expenseId: expense.id,
    });
    expect(result).toEqual({
      bull: {
        id: bull.id,
        name: "Tufão da Serra",
        purchases: [
          {
            id: purchase.id,
            date: "2026-08-01",
            doses: 30,
            totalBrl: 1140,
            seller: "Central Bela Vista",
            expenseId: expense.id,
          },
        ],
      },
      expense: {
        id: expense.id,
        kind: "expense",
        date: "2026-08-01",
        paidAt: "2026-08-01",
        category: "breeding",
        amountBrl: 1140,
        notes: "Sêmen — Tufão da Serra, 30 doses",
      },
    });
  });
});
