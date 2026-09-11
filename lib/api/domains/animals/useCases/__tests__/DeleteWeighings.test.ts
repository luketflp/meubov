/**
 * deleteWeighings: soft-deletes the weight readings of one day — the "Pesagem"
 * row of the manejo history that no session ever wrote (a ficha, an import).
 *
 * Same chainable db stub the other service tests use: selects answer from a
 * queued list of rows, updates record the columns set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
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
          update: () => {
            const builder = {
              set(columns: Record<string, unknown>) {
                state.updates.push(columns);
                return builder;
              },
              where: () => Promise.resolve(undefined),
            };
            return builder;
          },
        })
      ),
  },
}));

import { DeleteWeighingsUseCase } from "../DeleteWeighings.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
});

describe("deleteWeighings", () => {
  it("stamps the readings of that day for the animals given", async () => {
    state.selectResults = [[{ id: 11 }, { id: 12 }]];

    const result = await new DeleteWeighingsUseCase().run({
      farmId: 7,
      date: "2026-07-24",
      earTags: ["B-001", "B-002"],
    });

    expect(result).toEqual({ count: 2 });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].deletedAt).toBeInstanceOf(Date);
  });

  it("writes nothing when the day has no reading of this farm", async () => {
    state.selectResults = [[]];

    const result = await new DeleteWeighingsUseCase().run({
      farmId: 7,
      date: "2026-07-24",
      earTags: ["B-001"],
    });

    expect(result).toEqual({ count: 0 });
    expect(state.updates).toEqual([]);
  });
});
