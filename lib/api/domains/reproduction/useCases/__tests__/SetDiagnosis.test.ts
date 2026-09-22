/**
 * setDiagnosis: records the pregnancy diagnosis of one breeding of a dam, with
 * the vet's observação. A breeding keeps one diagnosis, so a re-exam replaces
 * the whole of it — the note included, which the new exam may leave out.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows; the insert records its values and the columns its
 * conflict branch sets, and echoes the values from returning().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Values of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[],
    /** Columns every `onConflictDoUpdate()` would set on a re-exam. */
    conflictSets: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: selectBuilder,
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push(values);
        const builder = {
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            state.conflictSets.push(set);
            return builder;
          },
          returning: () => Promise.resolve([values]),
        };
        return builder;
      },
    }),
  },
}));

import { SetDiagnosisUseCase } from "../SetDiagnosis.useCase";

const DAM = { id: "dam-1", sex: "female", breed: "Nelore", lotId: "lot-1" };

const run = (notes?: string) =>
  new SetDiagnosisUseCase().run({
    farmId: 7,
    animalId: "dam-1",
    input: { breedingId: "br-1", result: "pregnant", date: "2026-09-22", notes },
  });

beforeEach(() => {
  state.selectResults = [[DAM], [{ id: "br-1" }]];
  state.inserts = [];
  state.conflictSets = [];
});

describe("setDiagnosis — observação", () => {
  it("saves the vet's words trimmed, on a first exam and on a re-exam", async () => {
    const result = await run("  gestação de ~60 dias ");

    expect(state.inserts[0]).toMatchObject({ notes: "gestação de ~60 dias" });
    expect(state.conflictSets[0]).toMatchObject({ notes: "gestação de ~60 dias" });
    expect(result).toEqual({
      breedingId: "br-1",
      result: "pregnant",
      date: "2026-09-22",
      notes: "gestação de ~60 dias",
    });
  });

  it("stores no note for a blank one, and a re-exam without one clears the old", async () => {
    const result = await run("   ");

    expect(state.inserts[0]).toMatchObject({ notes: null });
    expect(state.conflictSets[0]).toMatchObject({ notes: null });
    expect(result).toEqual({ breedingId: "br-1", result: "pregnant", date: "2026-09-22" });
  });

  it("stores no note when the exam brings none", async () => {
    await run(undefined);

    expect(state.inserts[0]).toMatchObject({ notes: null });
    expect(state.conflictSets[0]).toMatchObject({ notes: null });
  });
});
