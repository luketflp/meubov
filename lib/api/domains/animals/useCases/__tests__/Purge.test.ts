/** purgeAnimals: the herd's selection goes for good, with the partos that brought it in. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";
import { PurgeAnimalsUseCase } from "../Purge.useCase";

const herd = [
  { id: "a-1", earTag: "VE1", birthDate: "2026-10-08" },
  { id: "a-2", earTag: "VE2", birthDate: "2026-10-08" },
];
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "closed",
  pricePerArroba: null,
  totalAmountBrl: null,
  planCostBrl: null,
  ...extra,
});
const purge = (canEditFinance: boolean) =>
  new PurgeAnimalsUseCase().run({ farmId: 1, ids: ["a-1", "a-2", "x-9"], canEditFinance });

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = 0;
  state.returning = [];
  state.wheres = [];
});

describe("purgeAnimals", () => {
  it("does nothing when no id is a live animal of the farm", async () => {
    state.selectResults = [[]];
    expect(await purge(true)).toEqual({ deleted: [], calvings: 0, manejos: 0 });
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("refuses while one of them sits in an open manejo", async () => {
    state.selectResults = [herd, [session("s-1", { status: "open" })]];
    expect(await purge(true)).toBe("animal_in_open_manejo");
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("asks for Financeiro before emptying a manejo that carries money", async () => {
    state.selectResults = [herd, [session("s-2", { totalAmountBrl: 18000 })], []];
    expect(await purge(false)).toBe("finance_required");
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("deletes the partos naming them, the animals, then the manejos they leave empty", async () => {
    // s-1 keeps another animal (and its money stays put); s-2 had only these
    // two, so it comes once per pass and must be stamped once.
    state.selectResults = [
      herd,
      [session("s-1", { totalAmountBrl: 9000 }), session("s-2"), session("s-2")],
      [{ id: "s-1" }],
      [
        { id: 11, damId: "d-1", calfEarTag: "VE1", date: "2026-10-08" },
        // An older calf of d-2 that carried the same brinco keeps its parto.
        { id: 12, damId: "d-2", calfEarTag: "VE1", date: "2024-09-01" },
        // A dam deleted with them takes hers by cascade.
        { id: 13, damId: "a-1", calfEarTag: "VE2", date: "2026-10-08" },
      ],
    ];
    expect(await purge(false)).toEqual({ deleted: ["VE1", "VE2"], calvings: 1, manejos: 1 });
    expect(state.deletes).toBe(2);
    const [partos, animals] = state.wheres.slice(4, 6).map((where) => renderSql(where as SQL));
    expect(partos.sql).toContain('"calvings"."id" in');
    expect(partos.params).toEqual([11]);
    expect(animals.sql).toContain('"animals"."id" in');
    expect(animals.params).toEqual(["a-1", "a-2"]);
    expect(state.updates).toEqual([{ deletedAt: expect.any(Date) }, { movementId: null }]);
  });
});
