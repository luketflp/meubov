/**
 * deleteSemenPurchase: removes a purchase under the bull's row lock, and
 * refuses when the doses left would not cover the ones already used. Nothing
 * in the Financeiro goes with it.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, deletes record the table they hit.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Table of every `delete()` issued, in order. */
    deletes: [] as string[],
    /** Whether any select took a row lock. */
    locked: false,
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: (strength: string) => {
      if (strength === "update") state.locked = true;
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          select: selectBuilder,
          delete: (table: Table) => ({
            where: () => {
              state.deletes.push(getTableName(table));
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { DeletePurchaseUseCase } from "../DeletePurchase.useCase";

const BULL_ROW = {
  id: "bull-1",
  farmId: 7,
  name: "Tufão da Serra",
  code: "NEL-4471",
  breed: null,
  central: null,
};

/** The bull lock and its counts: 60 doses bought over two purchases. */
const stockSelects = (used: number) => [[BULL_ROW], [{ bought: 60 }], [{ used }]];

const PURCHASE_ROW = { id: "p-2", doses: 30 };

const run = (purchaseId = "p-2") =>
  new DeletePurchaseUseCase().run({ farmId: 7, bullId: "bull-1", purchaseId });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = [];
  state.locked = false;
});

describe("deleteSemenPurchase", () => {
  it("deletes the purchase only, and answers its id", async () => {
    state.selectResults = [...stockSelects(30), [PURCHASE_ROW]];

    expect(await run()).toEqual({ id: "p-2" });
    expect(state.locked).toBe(true);
    expect(state.deletes).toEqual(["semen_purchases"]);
  });

  it("refuses with stock_negative when the rest does not cover the used doses", async () => {
    // 60 − 30 = 30 left to cover 31 used doses.
    state.selectResults = [...stockSelects(31), [PURCHASE_ROW]];

    expect(await run()).toBe("stock_negative");
    expect(state.deletes).toEqual([]);
  });

  it("answers not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[]];

    expect(await run()).toBe("not_found");
    expect(state.deletes).toEqual([]);
  });

  it("answers not_found for a purchase that is not of this bull", async () => {
    state.selectResults = [...stockSelects(0), []];

    expect(await run("p-9")).toBe("not_found");
    expect(state.deletes).toEqual([]);
  });
});
