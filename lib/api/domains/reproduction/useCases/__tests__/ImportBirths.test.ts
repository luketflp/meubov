/**
 * importBirths: a maternidade caderno in one transaction. Each line becomes a
 * calf, a parto on its dam when she is a female of the farm, a first weighing
 * and, for a dead calf, its baixa. Brincos already on the farm are skipped; a
 * future date or a lot that fails validation refuses the whole batch before
 * anything is written.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the rows and echo them from returning().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    inserts: [] as Record<string, unknown>[][],
    selects: 0,
  },
}));

function selectBuilder() {
  state.selects += 1;
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

function insertBuilder() {
  return {
    values: (rows: Record<string, unknown>[]) => {
      state.inserts.push(rows);
      const chain = {
        onConflictDoNothing: () => chain,
        returning: () => Promise.resolve(rows),
        then: (resolve: (value: undefined) => unknown) => resolve(undefined),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    select: selectBuilder,
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(run({ select: selectBuilder, insert: insertBuilder })),
  },
}));

import { ImportBirthsUseCase } from "../ImportBirths.useCase";

const BASE = {
  calfSex: "male" as const,
  breed: "Nelore",
  lotId: "lot-1",
  date: "2025-10-06",
};

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.selects = 0;
});

describe("importBirths", () => {
  it("writes calves, partos, weighings and baixas", async () => {
    // the lot, its open placement, taken brincos, dams, the farm's raças
    state.selectResults = [[{ id: "lot-1" }], [{ id: 9 }], [], [{ id: "dam-1" }], [{ name: "Nelore" }]];

    const result = await new ImportBirthsUseCase().run({
      farmId: 1,
      rows: [
        { ...BASE, calfEarTag: " BB1 ", damId: "dam-1", weightKg: 28, breed: "NELORE" },
        { ...BASE, calfEarTag: "BB2", damId: "ghost", breed: "Angus", deathNotes: "MORREU" },
      ],
    });

    expect(result).toEqual({
      imported: ["BB1", "BB2"],
      calvings: 1,
      withoutDam: ["BB2"],
      deaths: ["BB2"],
      skipped: [],
      createdBreeds: ["Angus"],
    });
    // raças, animals, calvings, weighings
    expect(state.inserts.map((rows) => rows.length)).toEqual([1, 2, 1, 1]);
    expect(state.inserts[0]).toEqual([{ farmId: 1, name: "Angus" }]);
    expect(state.inserts[1][0]).toMatchObject({
      farmId: 1,
      earTag: "BB1",
      category: "calf",
      breed: "Nelore",
      sex: "male",
      birthDate: "2025-10-06",
      lotId: "lot-1",
      active: true,
    });
    expect(state.inserts[1][1]).toMatchObject({
      earTag: "BB2",
      breed: "Angus",
      active: false,
      inactiveReason: "death",
      inactiveDate: "2025-10-06",
      inactiveNotes: "MORREU",
    });
    expect(state.inserts[2]).toEqual([
      { animalId: "dam-1", date: "2025-10-06", calfEarTag: "BB1" },
    ]);
    expect(state.inserts[3]).toEqual([
      { animalId: state.inserts[1][0].id, date: "2025-10-06", weightKg: 28 },
    ]);
  });

  it("skips brincos already on the farm or repeated in the batch", async () => {
    state.selectResults = [[{ id: "lot-1" }], [{ id: 9 }], [{ earTag: "BB1" }], [{ name: "Nelore" }]];

    const result = await new ImportBirthsUseCase().run({
      farmId: 1,
      rows: [
        { ...BASE, calfEarTag: "BB1" },
        { ...BASE, calfEarTag: "BB2" },
        { ...BASE, calfEarTag: "BB2 " },
      ],
    });

    expect(result).toMatchObject({ imported: ["BB2"], skipped: ["BB1", "BB2"], calvings: 0 });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].map((row) => row.earTag)).toEqual(["BB2"]);
  });

  it("writes nothing when every brinco is taken", async () => {
    state.selectResults = [[{ id: "lot-1" }], [{ id: 9 }], [{ earTag: "BB1" }]];

    const result = await new ImportBirthsUseCase().run({
      farmId: 1,
      rows: [{ ...BASE, calfEarTag: "BB1" }],
    });

    expect(result).toEqual({
      imported: [],
      calvings: 0,
      withoutDam: [],
      deaths: [],
      skipped: ["BB1"],
      createdBreeds: [],
    });
    expect(state.inserts).toEqual([]);
  });

  it("refuses a lot that fails validation", async () => {
    state.selectResults = [[]];

    const result = await new ImportBirthsUseCase().run({
      farmId: 1,
      rows: [{ ...BASE, calfEarTag: "BB1" }],
    });

    expect(result).toBe("lot_not_found");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a future parto before reading the farm", async () => {
    const result = await new ImportBirthsUseCase().run({
      farmId: 1,
      rows: [{ ...BASE, calfEarTag: "BB1", date: "2999-01-01" }],
    });

    expect(result).toBe("future_date");
    expect(state.selects).toBe(0);
  });
});
