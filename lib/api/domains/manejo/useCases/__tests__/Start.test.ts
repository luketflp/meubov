/**
 * startSession, inseminação branch: the session keeps its touro principal, the
 * bull must be of this farm and every cow of the line must be a female. The
 * refusals come back before the session row is written.
 *
 * Same chainable db stub as Delete.test.ts: selects answer from a queued list
 * of rows, inserts record the values and echo them from returning() the way
 * Postgres would, with absent columns as null.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Values of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
    /** Number of `select()` calls issued. */
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

const asRow = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? null]));

function insertBuilder() {
  return {
    values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(values) ? values : [values];
      state.inserts.push(rows);
      return { returning: () => Promise.resolve(rows.map(asRow)) };
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(run({ select: selectBuilder, insert: insertBuilder })),
  },
}));

import { StartSessionUseCase } from "../Start.useCase";

const INSEMINATION = {
  date: "2026-09-01",
  kind: "insemination" as const,
  earTags: ["V-01", "V-02"],
  weighing: false,
  semenBullId: "bull-1",
};

const COWS = [
  { id: "a-1", earTag: "V-01", sex: "female" },
  { id: "a-2", earTag: "V-02", sex: "female" },
];

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.selects = 0;
});

describe("startSession — inseminação", () => {
  it("opens the session with its touro principal and every cow pending", async () => {
    state.selectResults = [COWS, [{ id: "bull-1" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: INSEMINATION });

    expect(state.inserts[0][0]).toMatchObject({ kind: "insemination", semenBullId: "bull-1" });
    expect(result).toMatchObject({
      kind: "insemination",
      semenBullId: "bull-1",
      animals: [
        { earTag: "V-01", outcome: "pending" },
        { earTag: "V-02", outcome: "pending" },
      ],
    });
  });

  it("refuses a bull that is not of this farm", async () => {
    state.selectResults = [COWS, []];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: INSEMINATION });

    expect(result).toBe("bull_not_found");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a line with a male in it", async () => {
    state.selectResults = [
      [COWS[0], { id: "a-9", earTag: "T-09", sex: "male" }],
      [{ id: "bull-1" }],
    ];

    const result = await new StartSessionUseCase().run({
      farmId: 7,
      input: { ...INSEMINATION, earTags: ["V-01", "T-09"] },
    });

    expect(result).toBe("not_female");
    expect(state.inserts).toEqual([]);
  });

  it("ignores a bull sent with any other kind", async () => {
    state.selectResults = [[{ id: "a-9", earTag: "T-09", sex: "male" }]];

    const result = await new StartSessionUseCase().run({
      farmId: 7,
      input: { ...INSEMINATION, kind: "weighing", weighing: true, earTags: ["T-09"] },
    });

    // One select: the herd. No bull lookup, and the male is welcome on the scale.
    expect(state.selects).toBe(1);
    expect(state.inserts[0][0].semenBullId).toBeUndefined();
    expect(result).toMatchObject({ kind: "weighing" });
    expect(result).not.toHaveProperty("semenBullId", "bull-1");
  });
});
