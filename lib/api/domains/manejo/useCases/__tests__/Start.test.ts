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
    innerJoin: () => builder,
    orderBy: () => builder,
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

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";

import { StartSessionUseCase } from "../Start.useCase";

const INSEMINATION = {
  date: "2026-09-01",
  kind: "insemination" as const,
  earTags: ["V-01", "V-02"],
  weighing: false,
  semenBullIds: ["bull-1", "bull-2"],
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
  it("opens the session with its touros, in the order picked, and every cow pending", async () => {
    state.selectResults = [COWS, [{ id: "bull-2" }, { id: "bull-1" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: INSEMINATION });

    expect(state.inserts[0][0]).toMatchObject({
      kind: "insemination",
      semenBullIds: ["bull-1", "bull-2"],
    });
    expect(result).toMatchObject({
      kind: "insemination",
      semenBullIds: ["bull-1", "bull-2"],
      animals: [
        { earTag: "V-01", outcome: "pending" },
        { earTag: "V-02", outcome: "pending" },
      ],
    });
  });

  it("keeps a touro picked twice once", async () => {
    state.selectResults = [COWS, [{ id: "bull-1" }]];

    const result = await new StartSessionUseCase().run({
      farmId: 7,
      input: { ...INSEMINATION, semenBullIds: ["bull-1", "bull-1"] },
    });

    expect(state.inserts[0][0]).toMatchObject({ semenBullIds: ["bull-1"] });
    expect(result).toMatchObject({ semenBullIds: ["bull-1"] });
  });

  it("refuses a bull that is not of this farm, even beside one that is", async () => {
    state.selectResults = [COWS, [{ id: "bull-1" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: INSEMINATION });

    expect(result).toBe("bull_not_found");
    expect(state.inserts).toEqual([]);
  });

  it("refuses an inseminação without a touro", async () => {
    state.selectResults = [COWS];

    const result = await new StartSessionUseCase().run({
      farmId: 7,
      input: { ...INSEMINATION, semenBullIds: [] },
    });

    expect(result).toBe("bull_not_found");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a line with a male in it", async () => {
    state.selectResults = [
      [COWS[0], { id: "a-9", earTag: "T-09", sex: "male" }],
      [{ id: "bull-1" }, { id: "bull-2" }],
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
    expect(state.inserts[0][0].semenBullIds).toBeUndefined();
    expect(result).toMatchObject({ kind: "weighing" });
    expect(result).not.toHaveProperty("semenBullIds", ["bull-1", "bull-2"]);
  });
});

describe("startSession — venda and compra", () => {
  it("send their money through the conta principal; other kinds carry no conta", async () => {
    state.selectResults = [[{ id: "a-1", earTag: "V-01", sex: "male" }]];
    await new StartSessionUseCase().run({
      farmId: 7,
      input: { date: "2026-09-25", kind: "sale", earTags: ["V-01"], weighing: true },
    });
    const { sql, params } = renderSql(state.inserts[0][0].bankAccountId as SQL);
    expect(sql).toContain('"bank_accounts"."is_main"');
    expect(params).toEqual([7]);

    state.inserts = [];
    state.selectResults = [[{ id: "a-1", earTag: "V-01", sex: "male" }]];
    await new StartSessionUseCase().run({
      farmId: 7,
      input: { date: "2026-09-25", kind: "weighing", earTags: ["V-01"], weighing: true },
    });
    expect(state.inserts[0][0].bankAccountId).toBeUndefined();
  });
});

describe("startSession — an id the phone made up offline", () => {
  const ID = "0b7f2c1e-8a4d-4c3b-9f1e-2d5a6b7c8d9e";
  const WEIGHING = { date: "2026-09-25", kind: "weighing" as const, earTags: ["V-01"], weighing: true };
  const EXISTING = {
    id: ID,
    farmId: 7,
    name: "Pesagem",
    date: "2026-09-25",
    status: "open",
    kind: "weighing",
    weighing: true,
    destinationLotId: null,
    counterparty: null,
    pricePerArroba: null,
    carcassYieldPct: null,
    totalAmountBrl: null,
    semenBullIds: null,
    notes: null,
    planType: null,
    planName: null,
    planWithdrawalDays: null,
    planDose: null,
    planResponsible: null,
    planCostBrl: null,
    planNextDate: null,
    planNotes: null,
    deletedAt: null,
  };
  const DONE_ROW = {
    sessionId: ID,
    animalId: "a-1",
    position: 0,
    outcome: "done",
    weightKg: 310,
    notes: null,
    amountBrl: null,
    carcassYieldPct: null,
    previousLotId: null,
    createdAnimal: false,
    treatmentId: null,
    boosterId: null,
    weighingId: 5,
    breedingId: null,
  };

  it("returns the existing session when the id is already the farm's (no insert)", async () => {
    state.selectResults = [[EXISTING], [{ row: DONE_ROW, earTag: "V-01" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } });

    expect(state.inserts).toEqual([]);
    expect(result).toMatchObject({
      id: ID,
      kind: "weighing",
      animals: [{ earTag: "V-01", outcome: "done", weightKg: 310 }],
    });
  });

  it("answers id_taken for another farm's id", async () => {
    state.selectResults = [[{ ...EXISTING, farmId: 9 }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } });

    expect(result).toBe("id_taken");
    expect(state.selects).toBe(1);
    expect(state.inserts).toEqual([]);
  });

  it("answers id_taken for a discarded session's id", async () => {
    state.selectResults = [[{ ...EXISTING, deletedAt: new Date() }]];

    expect(
      await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } })
    ).toBe("id_taken");
    expect(state.inserts).toEqual([]);
  });

  it("inserts with the given id", async () => {
    // The id lookup finds nothing; then the herd.
    state.selectResults = [[], [{ id: "a-1", earTag: "V-01", sex: "male" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } });

    expect(state.inserts[0][0]).toMatchObject({ id: ID, kind: "weighing" });
    expect(state.inserts[1][0]).toMatchObject({ sessionId: ID, animalId: "a-1" });
    expect(result).toMatchObject({ id: ID, animals: [{ earTag: "V-01", outcome: "pending" }] });
  });
});
