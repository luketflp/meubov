/**
 * clearDiagnosis: removes the pregnancy diagnosis of one breeding of a dam —
 * the undo of a tap on the Ultrassom list. The breeding must be this female's,
 * which also scopes it to the farm.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows and keep their where condition, deletes record the table
 * they hit.
 */
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Where condition of every select, in order. */
    selectWheres: [] as unknown[],
    /** Table of every `delete()` issued, in order. */
    deletes: [] as string[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: (condition: unknown) => {
      state.selectWheres.push(condition);
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: selectBuilder,
    delete: (table: Table) => ({
      where: () => {
        state.deletes.push(getTableName(table));
        return Promise.resolve(undefined);
      },
    }),
  },
}));

import { ClearDiagnosisUseCase } from "../ClearDiagnosis.useCase";

const DAM = { id: "dam-1", sex: "female", breed: "Nelore", lotId: "lot-1" };

/** Bound parameters of a where condition, in SQL order. */
const paramsOf = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as SQL).params;

beforeEach(() => {
  state.selectResults = [];
  state.selectWheres = [];
  state.deletes = [];
});

describe("clearDiagnosis", () => {
  it("deletes the diagnosis of a breeding of this dam", async () => {
    state.selectResults = [[DAM], [{ id: "br-1" }]];

    const result = await new ClearDiagnosisUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      breedingId: "br-1",
    });

    expect(result).toEqual({ breedingId: "br-1" });
    expect(paramsOf(state.selectWheres[1])).toEqual(["br-1", "dam-1"]);
    expect(state.deletes).toEqual(["pregnancy_diagnoses"]);
  });

  it("answers breeding_not_found for a breeding of another dam", async () => {
    state.selectResults = [[DAM], []];

    const result = await new ClearDiagnosisUseCase().run({
      farmId: 7,
      animalId: "dam-1",
      breedingId: "br-of-another-cow",
    });

    expect(result).toBe("breeding_not_found");
    expect(state.deletes).toEqual([]);
  });

  it("answers the dam error first", async () => {
    state.selectResults = [[]];

    const result = await new ClearDiagnosisUseCase().run({
      farmId: 7,
      animalId: "ghost",
      breedingId: "br-1",
    });

    expect(result).toBe("animal_not_found");
    expect(state.deletes).toEqual([]);
  });
});
