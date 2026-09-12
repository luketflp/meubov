/**
 * addAnimals: a batch of new animals in one transaction. A brinco repeated in
 * the batch or already on the farm, or a lot that fails validation, refuses the
 * whole batch before anything is written.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the rows and echo them from returning().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    inserts: [] as Record<string, unknown>[][],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: () => builder,
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
          insert: () => ({
            values: (rows: Record<string, unknown>[]) => {
              state.inserts.push(rows);
              return { returning: () => Promise.resolve(rows) };
            },
          }),
        })
      ),
  },
}));

import { todayISO } from "@/lib/domain/dates";
import { AddAnimalsUseCase } from "../AddBatch.useCase";

const BASE = {
  category: "calf" as const,
  breed: "Nelore",
  sex: "female" as const,
  birthDate: "2025-01-01",
  lotId: "lot-1",
};

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addAnimals", () => {
  it("inserts the animals and their first weighings", async () => {
    // taken brincos, the lot, its open placement
    state.selectResults = [[], [{ id: "lot-1" }], [{ id: 7 }]];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [
        { ...BASE, earTag: " BR-1 ", initialWeightKg: 182 },
        { ...BASE, earTag: "BR-2", sex: "male" },
      ],
    });

    if (!Array.isArray(result)) throw new Error(`expected animals, got ${JSON.stringify(result)}`);
    expect(result.map((animal) => animal.earTag)).toEqual(["BR-1", "BR-2"]);
    expect(result[0].weighings).toEqual([{ date: todayISO(), weightKg: 182 }]);
    expect(result[1].weighings).toEqual([]);
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]).toHaveLength(2);
    expect(state.inserts[1]).toEqual([
      { animalId: result[0].id, date: todayISO(), weightKg: 182 },
    ]);
  });

  it("forces the base category of a custom one", async () => {
    state.selectResults = [[], [{ id: "lot-1" }], [{ id: 7 }], [{ id: "cc-1", baseCategory: "steer" }]];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1", sex: "male", customCategoryId: "cc-1" }],
    });

    if (!Array.isArray(result)) throw new Error("expected animals");
    expect(result[0]).toMatchObject({ category: "steer", customCategoryId: "cc-1" });
  });

  it("refuses a brinco already on the farm and writes nothing", async () => {
    state.selectResults = [[{ earTag: "BR-2" }]];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1" }, { ...BASE, earTag: "BR-2" }],
    });

    expect(result).toEqual({ error: "duplicate_ear_tags", earTags: ["BR-2"] });
    expect(state.inserts).toEqual([]);
  });

  it("refuses a brinco repeated inside the batch", async () => {
    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1" }, { ...BASE, earTag: "BR-1 " }],
    });

    expect(result).toEqual({ error: "duplicate_ear_tags", earTags: ["BR-1"] });
    expect(state.inserts).toEqual([]);
  });

  it("refuses a lot that fails validation", async () => {
    state.selectResults = [[], []];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1" }],
    });

    expect(result).toBe("lot_not_found");
    expect(state.inserts).toEqual([]);
  });
});
