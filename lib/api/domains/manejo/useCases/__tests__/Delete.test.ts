/**
 * deleteSession: soft-deletes a manejo and puts the herd back where it was, or
 * refuses in one piece when a later manejo depends on it.
 *
 * The db mock is the chainable stub deleteTreatments.test.ts established:
 * selects answer from a queued list of rows and record their table and row
 * lock, updates record the columns set.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Table and row lock of every `select()`, in call order. */
    selects: [] as { table: string; lock?: string }[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
    /** Table of every `delete()` issued. */
    deletes: [] as string[],
    /** Every write issued: `update <table>` or `delete <table>`, in call order. */
    writes: [] as string[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const query: (typeof state.selects)[number] = { table: "" };
  state.selects.push(query);
  const builder = {
    from(table: Table) {
      query.table = getTableName(table);
      return builder;
    },
    innerJoin: () => builder,
    where: () => builder,
    for(lock: string) {
      query.lock = lock;
      return builder;
    },
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
          update: (table: Table) => {
            state.writes.push(`update ${getTableName(table)}`);
            const builder = {
              set(columns: Record<string, unknown>) {
                state.updates.push(columns);
                return builder;
              },
              where: () => builder,
              returning: () => Promise.resolve([]),
              then: (resolve: (value: unknown) => unknown) => resolve(undefined),
            };
            return builder;
          },
          delete: (table: Table) => ({
            where: () => {
              state.deletes.push(getTableName(table));
              state.writes.push(`delete ${getTableName(table)}`);
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { DeleteSessionUseCase } from "../Delete.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.selects = [];
  state.updates = [];
  state.deletes = [];
  state.writes = [];
});

const SALE_ROW = {
  id: "s-1",
  farmId: 7,
  name: "Venda",
  date: "2026-05-12",
  status: "closed",
  kind: "sale",
  weighing: true,
  destinationLotId: null,
  counterparty: "Frigorífico",
  pricePerArroba: 320,
  carcassYieldPct: 52,
  totalAmountBrl: null,
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

describe("deleteSession", () => {
  it("stamps the session and puts the sold animals back", async () => {
    state.selectResults = [
      [SALE_ROW],
      [
        {
          earTag: "B-001",
          animalId: "a-1",
          outcome: "done",
          previousLotId: "lot-3",
          createdAnimal: false,
          treatmentId: null,
          boosterId: null,
          weighingId: 11,
          breedingId: null,
          lotId: "lot-3",
          active: false,
        },
      ],
      [{ id: "lot-3" }],
    ];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    expect(result).toEqual({
      id: "s-1",
      treatmentIds: [],
      weighedEarTags: ["B-001"],
      restored: [{ earTag: "B-001", lotId: "lot-3", active: true }],
      removedEarTags: [],
      removedBreedings: [],
    });
    expect(state.updates.some((u) => u.deletedAt instanceof Date)).toBe(true);
    expect(state.updates.some((u) => u.active === true && u.inactiveReason === null)).toBe(true);
    expect(state.deletes).toEqual([]);
  });

  it("refuses in one piece and writes nothing when an animal moved on", async () => {
    state.selectResults = [
      [SALE_ROW],
      [
        {
          earTag: "B-001",
          animalId: "a-1",
          outcome: "done",
          previousLotId: "lot-3",
          createdAnimal: false,
          treatmentId: null,
          boosterId: null,
          weighingId: null,
          breedingId: null,
          // The sold animal is active again: something reversed it already.
          lotId: "lot-3",
          active: true,
        },
      ],
      [{ id: "lot-3" }],
    ];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    expect(result).toEqual({ blocked: [{ earTag: "B-001", reason: "not_sold" }] });
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("does not touch a session of another farm", async () => {
    state.selectResults = [[]];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-9", canEditFinance: true });

    expect(result).toBe("session_not_found");
    expect(state.updates).toEqual([]);
  });

  it("locks the session row first, so it waits for a pass in flight", async () => {
    state.selectResults = [[]];

    await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    expect(state.selects[0]).toEqual({ table: "manejo_sessions", lock: "update" });
  });

  it("refuses a priced session to a member without Financeiro, before any write", async () => {
    state.selectResults = [[SALE_ROW]];

    const result = await new DeleteSessionUseCase().run({
      farmId: 7,
      id: "s-1",
      canEditFinance: false,
    });

    expect(result).toBe("finance_required");
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("lets a member without Financeiro delete a session with no values", async () => {
    state.selectResults = [
      [{ ...SALE_ROW, kind: "weighing", pricePerArroba: null, carcassYieldPct: null }],
      [],
    ];

    const result = await new DeleteSessionUseCase().run({
      farmId: 7,
      id: "s-1",
      canEditFinance: false,
    });

    expect(result).toMatchObject({ id: "s-1", removedEarTags: [] });
  });
});

const INSEMINATION_ROW = {
  ...SALE_ROW,
  name: "Inseminação",
  date: "2026-09-01",
  kind: "insemination",
  weighing: false,
  counterparty: null,
  pricePerArroba: null,
  carcassYieldPct: null,
  semenBullId: "bull-1",
};

/** One chute entry of the inseminação, as the entries query returns it. */
const cow = (earTag: string, outcome: string, breedingId: string | null) => ({
  earTag,
  animalId: `a-${earTag}`,
  outcome,
  previousLotId: null,
  createdAnimal: false,
  treatmentId: null,
  boosterId: null,
  weighingId: null,
  breedingId,
  lotId: "lot-1",
  active: true,
});

describe("deleteSession — inseminação", () => {
  const entries = [cow("V-01", "done", "br-1"), cow("V-02", "skipped", null), cow("V-03", "done", "br-3")];

  it("deletes its coberturas, after clearing the entries' refs to them", async () => {
    // the session, its entries, their coberturas (locked), the diagnoses
    state.selectResults = [[INSEMINATION_ROW], entries, [{ id: "br-1" }, { id: "br-3" }], []];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    expect(result).toEqual({
      id: "s-1",
      treatmentIds: [],
      weighedEarTags: [],
      restored: [],
      removedEarTags: [],
      removedBreedings: [
        { earTag: "V-01", breedingId: "br-1" },
        { earTag: "V-03", breedingId: "br-3" },
      ],
    });
    expect(state.writes).toEqual([
      "update manejo_session_animals",
      "delete breedings",
      "update manejo_sessions",
    ]);
    expect(state.updates[0]).toEqual({ breedingId: null });
  });

  it("locks the coberturas before it reads their diagnoses", async () => {
    state.selectResults = [[INSEMINATION_ROW], entries, [{ id: "br-1" }, { id: "br-3" }], []];

    await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    // A diagnosis written meanwhile waits for the delete, then fails its
    // foreign key, instead of going down silently with the cobertura.
    expect(state.selects).toEqual([
      { table: "manejo_sessions", lock: "update" },
      { table: "manejo_session_animals" },
      { table: "breedings", lock: "update" },
      { table: "pregnancy_diagnoses", lock: "update" },
    ]);
  });

  it("refuses in one piece when a cobertura already has a diagnosis", async () => {
    state.selectResults = [
      [INSEMINATION_ROW],
      entries,
      [{ id: "br-1" }, { id: "br-3" }],
      [
        { breedingId: "br-1", result: "pending" },
        { breedingId: "br-3", result: "pregnant" },
      ],
    ];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    // The cobertura names itself, so the client can offer to clear the diagnosis.
    expect(result).toEqual({
      blocked: [{ earTag: "V-03", reason: "has_diagnosis", breedingId: "br-3" }],
    });
    expect(state.writes).toEqual([]);
  });

  it("does not count an exam recorded as pending as a diagnosis", async () => {
    state.selectResults = [
      [INSEMINATION_ROW],
      entries,
      [{ id: "br-1" }, { id: "br-3" }],
      [{ breedingId: "br-1", result: "pending" }],
    ];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true });

    expect(result).toMatchObject({
      removedBreedings: [
        { earTag: "V-01", breedingId: "br-1" },
        { earTag: "V-03", breedingId: "br-3" },
      ],
    });
    expect(state.writes).toContain("delete breedings");
  });
});
