/**
 * updateSemenBull: edits the name, code, raça or central of a bull of the
 * farm. Only the fields sent change; a blank optional clears it; the name stays
 * unique per farm.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set and answer from their own
 * queue (or reject with a queued error).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows each `update().returning()` resolves to, in call order. */
    updateResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
    /** Error the next update rejects with. */
    updateError: null as unknown,
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function updateBuilder() {
  const builder = {
    set(columns: Record<string, unknown>) {
      state.updates.push(columns);
      return builder;
    },
    where: () => builder,
    returning: () => {
      if (state.updateError) {
        const error = state.updateError;
        state.updateError = null;
        return Promise.reject(error);
      }
      return Promise.resolve(state.updateResults.shift() ?? []);
    },
  };
  return builder;
}

vi.mock("@/lib/db", () => {
  const handle = { select: selectBuilder, update: updateBuilder };
  return {
    db: {
      ...handle,
      transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(handle)),
    },
  };
});

import { UpdateBullUseCase } from "../UpdateBull.useCase";

const BULL_ROW = {
  id: "bull-1",
  farmId: 7,
  name: "Tufão da Serra",
  code: "NEL-4471",
  breed: "Nelore",
  central: "CRV Lagoa",
};

const PURCHASE_ROW = {
  id: "p-1",
  bullId: "bull-1",
  date: "2026-08-01",
  doses: 30,
  totalBrl: 1140,
  seller: null,
  expenseId: "e-1",
};

beforeEach(() => {
  state.selectResults = [];
  state.updateResults = [];
  state.updates = [];
  state.updateError = null;
});

describe("updateSemenBull", () => {
  it("sets only the fields sent, trimmed, and clears a blank optional", async () => {
    state.updateResults = [[{ ...BULL_ROW, name: "Tufão", code: null }]];
    state.selectResults = [[PURCHASE_ROW]];

    const result = await new UpdateBullUseCase().run({
      farmId: 7,
      id: "bull-1",
      patch: { name: " Tufão ", code: "  " },
    });

    expect(state.updates).toEqual([{ name: "Tufão", code: null }]);
    expect(result).toEqual({
      id: "bull-1",
      name: "Tufão",
      breed: "Nelore",
      central: "CRV Lagoa",
      purchases: [
        { id: "p-1", date: "2026-08-01", doses: 30, totalBrl: 1140, expenseId: "e-1" },
      ],
    });
  });

  it("answers not_found for a bull that is not on the farm", async () => {
    state.updateResults = [[]];

    const result = await new UpdateBullUseCase().run({
      farmId: 7,
      id: "bull-9",
      patch: { central: "ABS" },
    });

    expect(result).toBe("not_found");
  });

  it("answers duplicate_name when another bull of the farm has the name", async () => {
    state.updateError = { code: "23505" };

    const result = await new UpdateBullUseCase().run({
      farmId: 7,
      id: "bull-1",
      patch: { name: "Brutus" },
    });

    expect(result).toBe("duplicate_name");
  });

  it("answers duplicate_name for a name that differs only by case or spaces", async () => {
    // The name is trimmed here; the unique index on lower(name) refuses the case.
    state.updateError = { code: "23505" };

    const result = await new UpdateBullUseCase().run({
      farmId: 7,
      id: "bull-2",
      patch: { name: " TUFÃO DA SERRA  " },
    });

    expect(state.updates).toEqual([{ name: "TUFÃO DA SERRA" }]);
    expect(result).toBe("duplicate_name");
  });

  it("returns the bull untouched for an empty patch", async () => {
    state.selectResults = [[BULL_ROW], [PURCHASE_ROW]];

    const result = await new UpdateBullUseCase().run({ farmId: 7, id: "bull-1", patch: {} });

    expect(state.updates).toEqual([]);
    expect(result).toMatchObject({ id: "bull-1", name: "Tufão da Serra", code: "NEL-4471" });
  });

  it("answers not_found for an empty patch on an unknown bull", async () => {
    state.selectResults = [[]];

    const result = await new UpdateBullUseCase().run({ farmId: 7, id: "bull-9", patch: {} });

    expect(result).toBe("not_found");
  });
});
