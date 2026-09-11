/**
 * deleteTreatments: a soft delete that removes the whole batch one scheduling
 * action created, and only the row itself when it has no batch.
 *
 * The db mock is a chainable select/update stub: selects answer from a queued
 * list of rows, updates record the columns the service sets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
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

import { DeleteTreatmentsUseCase } from "../Delete.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
});

describe("deleteTreatments", () => {
  it("soft-deletes every treatment of the batch", async () => {
    state.selectResults = [
      [{ id: "t-1", batchId: "batch-1" }],
      [{ id: "t-1" }, { id: "t-2" }, { id: "t-3" }],
    ];

    const result = await new DeleteTreatmentsUseCase().run({ farmId: 7, id: "t-1" });

    expect(result).toEqual({ ids: ["t-1", "t-2", "t-3"] });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].deletedAt).toBeInstanceOf(Date);
  });

  it("groups a treatment without a batch by its day, name and status", async () => {
    state.selectResults = [
      [
        {
          id: "t-9",
          batchId: null,
          date: "2026-05-14",
          name: "Vacina aftosa",
          type: "vaccine",
          status: "scheduled",
        },
      ],
      [{ id: "t-9" }, { id: "t-10" }],
    ];

    const result = await new DeleteTreatmentsUseCase().run({ farmId: 7, id: "t-9" });

    expect(result).toEqual({ ids: ["t-9", "t-10"] });
    expect(state.updates).toHaveLength(1);
  });

  it("removes a single row when the caller asks for one animal", async () => {
    state.selectResults = [[{ id: "t-1", batchId: "batch-1" }]];

    const result = await new DeleteTreatmentsUseCase().run({ farmId: 7, id: "t-1", scope: "one" });

    expect(result).toEqual({ ids: ["t-1"] });
    expect(state.updates).toHaveLength(1);
  });

  it("refuses a treatment outside the farm and writes nothing", async () => {
    state.selectResults = [[]];

    const result = await new DeleteTreatmentsUseCase().run({ farmId: 7, id: "t-from-another-farm" });

    expect(result).toBe("treatment_not_found");
    expect(state.updates).toEqual([]);
  });
});
