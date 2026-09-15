/**
 * deleteSemenBull: removes a bull with its purchases and the expenses they
 * wrote, under the bull's row lock, and refuses while a cobertura used one of
 * its doses or an open inseminação still offers it.
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

import { DeleteBullUseCase } from "../DeleteBull.useCase";

const BULL_ROW = {
  id: "bull-1",
  farmId: 7,
  name: "Tufão da Serra",
  code: "NEL-4471",
  breed: null,
  central: null,
};

/** The bull lock and its counts, then the open inseminações that list it. */
const stockSelects = (used: number, openSessions: Record<string, unknown>[] = []) => [
  [BULL_ROW],
  [{ bought: 60 }],
  [{ used }],
  openSessions,
];

const run = (canRemoveExpenses = true) =>
  new DeleteBullUseCase().run({ farmId: 7, id: "bull-1", canRemoveExpenses });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = [];
  state.locked = false;
});

describe("deleteSemenBull", () => {
  it("deletes the expenses of its purchases, then the bull", async () => {
    state.selectResults = [...stockSelects(0), [{ expenseId: "e-1" }, { expenseId: "e-2" }]];

    const result = await run();

    expect(result).toEqual({ id: "bull-1", expenseIds: ["e-1", "e-2"] });
    expect(state.locked).toBe(true);
    expect(state.deletes).toEqual(["expenses", "semen_bulls"]);
  });

  it("deletes only the bull when no purchase still has its expense", async () => {
    state.selectResults = [...stockSelects(0), [{ expenseId: null }]];

    const result = await run();

    expect(result).toEqual({ id: "bull-1", expenseIds: [] });
    expect(state.deletes).toEqual(["semen_bulls"]);
  });

  it("deletes a bull that never had a purchase", async () => {
    state.selectResults = [...stockSelects(0), []];

    expect(await run(false)).toEqual({ id: "bull-1", expenseIds: [] });
    expect(state.deletes).toEqual(["semen_bulls"]);
  });

  it("refuses with doses_used once a cobertura took a dose", async () => {
    state.selectResults = [...stockSelects(1), []];

    expect(await run()).toBe("doses_used");
    expect(state.deletes).toEqual([]);
  });

  it("refuses with open_insemination while an open inseminação lists it", async () => {
    state.selectResults = [...stockSelects(0, [{ id: "s-1" }]), []];

    expect(await run()).toBe("open_insemination");
    expect(state.deletes).toEqual([]);
  });

  it("refuses with finance_forbidden when an expense would go without Financeiro edit", async () => {
    state.selectResults = [...stockSelects(0), [{ expenseId: "e-1" }]];

    expect(await run(false)).toBe("finance_forbidden");
    expect(state.deletes).toEqual([]);
  });

  it("answers not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[]];

    expect(await run()).toBe("not_found");
    expect(state.deletes).toEqual([]);
  });
});
