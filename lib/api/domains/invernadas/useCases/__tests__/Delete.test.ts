/** removeInvernada: free ones go, one grazed now stays, one with only past lotes is marked removed. */
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
import { RemoveInvernadaUseCase } from "../Delete.useCase";

const now = new Date("2026-09-23T18:00:00Z");
const row = {
  id: "inv-7",
  farmId: 1,
  code: "07",
  name: "Sede",
  grass: "Braquiária",
  hectares: 30,
  boundary: null,
  removedAt: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("removeInvernada", () => {
  it("answers not_found for an invernada that is not there, or already removed", async () => {
    state.selectResults = [[]];
    const result = await new RemoveInvernadaUseCase().run({ farmId: 1, id: "inv-7", now });
    expect(result).toBe("not_found");
    expect(renderSql(state.wheres[0] as SQL).sql).toContain('"invernadas"."removed_at" is null');
  });

  it("deletes an invernada no lote ever grazed", async () => {
    state.selectResults = [[row], []];
    const result = await new RemoveInvernadaUseCase().run({ farmId: 1, id: "inv-7", now });
    expect(result).toMatchObject({ id: "inv-7", code: "07" });
    expect(result).not.toHaveProperty("removedAt", expect.anything());
    expect(state.deletes).toBe(1);
    expect(state.updates).toEqual([]);
  });

  it("refuses while a lote grazes there", async () => {
    state.selectResults = [[row], [{ endedOn: "2026-05-01" }, { endedOn: null }]];
    const result = await new RemoveInvernadaUseCase().run({ farmId: 1, id: "inv-7", now });
    expect(result).toBe("in_use");
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("marks removed an invernada only past lotes grazed, keeping it for their history", async () => {
    state.selectResults = [[row], [{ endedOn: "2026-05-01" }]];
    const result = await new RemoveInvernadaUseCase().run({ farmId: 1, id: "inv-7", now });
    expect(result).toMatchObject({ id: "inv-7", removedAt: now.toISOString() });
    expect(state.updates).toEqual([{ removedAt: now }]);
    expect(state.deletes).toBe(0);
  });
});
