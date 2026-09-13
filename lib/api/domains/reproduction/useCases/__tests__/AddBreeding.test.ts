/**
 * addBreeding: records a cobertura of a female. With a registered semen bull
 * it must be an IATF, the bull must be on the farm and have a dose left (read
 * under the bull's row lock), and the stored bull ear tag becomes the bull's
 * code, or its name without one.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the table and the row and echo it.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every `insert().values()` call, in order. */
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    selects: 0,
    /** Whether any select took a row lock. */
    locked: false,
  },
}));

function selectBuilder() {
  state.selects += 1;
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

function insertBuilder(table: Table) {
  return {
    values: (row: Record<string, unknown>) => {
      state.inserts.push({ table: getTableName(table), row });
      return { returning: () => Promise.resolve([row]) };
    },
  };
}

vi.mock("@/lib/db", () => {
  const handle = { select: selectBuilder, insert: insertBuilder };
  return {
    db: {
      ...handle,
      transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(handle)),
    },
  };
});

import { AddBreedingUseCase } from "../AddBreeding.useCase";

const DAM = { id: "dam-1", sex: "female", breed: "Nelore", lotId: "lot-1" };

const BULL_ROW = {
  id: "bull-1",
  farmId: 7,
  name: "Tufão da Serra",
  code: "NEL-4471",
  breed: null,
  central: null,
};

const IATF = { date: "2026-09-01", type: "timedAI" as const, bullEarTag: "Tufão da Serra" };

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.selects = 0;
  state.locked = false;
});

describe("addBreeding", () => {
  it("records a cobertura without a semen bull as before", async () => {
    state.selectResults = [[DAM]];

    const result = await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { date: "2026-09-01", type: "naturalMating", bullEarTag: " T-12 " },
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe("breedings");
    expect(state.inserts[0].row).toMatchObject({
      animalId: "dam-1",
      date: "2026-09-01",
      type: "naturalMating",
      bullEarTag: "T-12",
    });
    expect(state.inserts[0].row.semenBullId ?? null).toBeNull();
    expect(state.locked).toBe(false);
    expect(result).toEqual({
      id: state.inserts[0].row.id,
      date: "2026-09-01",
      type: "naturalMating",
      bullEarTag: "T-12",
    });
  });

  it("takes a dose: stores the bull's code as ear tag and its id", async () => {
    state.selectResults = [[DAM], [BULL_ROW], [{ bought: 30 }], [{ used: 29 }]];

    const result = await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { ...IATF, semenBullId: "bull-1" },
    });

    expect(state.locked).toBe(true);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].row).toMatchObject({
      animalId: "dam-1",
      type: "timedAI",
      bullEarTag: "NEL-4471",
      semenBullId: "bull-1",
    });
    expect(result).toMatchObject({ bullEarTag: "NEL-4471", semenBullId: "bull-1" });
  });

  it("stores the bull's name when it has no code", async () => {
    state.selectResults = [[DAM], [{ ...BULL_ROW, code: null }], [{ bought: 30 }], [{ used: 0 }]];

    await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { ...IATF, bullEarTag: "whatever", semenBullId: "bull-1" },
    });

    expect(state.inserts[0].row).toMatchObject({ bullEarTag: "Tufão da Serra" });
  });

  it("refuses a semen bull on a natural mating before reading anything", async () => {
    const result = await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { ...IATF, type: "naturalMating", semenBullId: "bull-1" },
    });

    expect(result).toBe("semen_requires_timed_ai");
    expect(state.selects).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("answers bull_not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[DAM], []];

    const result = await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { ...IATF, semenBullId: "bull-9" },
    });

    expect(result).toBe("bull_not_found");
    expect(state.inserts).toEqual([]);
  });

  it("answers out_of_stock when every dose is used", async () => {
    state.selectResults = [[DAM], [BULL_ROW], [{ bought: 30 }], [{ used: 30 }]];

    const result = await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { ...IATF, semenBullId: "bull-1" },
    });

    expect(result).toBe("out_of_stock");
    expect(state.inserts).toEqual([]);
  });

  it("answers the dam error before locking the bull", async () => {
    state.selectResults = [[{ ...DAM, sex: "male" }]];

    const result = await new AddBreedingUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      input: { ...IATF, semenBullId: "bull-1" },
    });

    expect(result).toBe("not_female");
    expect(state.locked).toBe(false);
    expect(state.inserts).toEqual([]);
  });
});
