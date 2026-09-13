/**
 * editWeighing and removeWeighing: one past weighing of an animal, corrected or
 * taken back from the "Editar animal" dialog. A weighing a manejo pass wrote
 * keeps its date, since it is the session's day; its kg reaches the session
 * entry too, and a venda priced by the arroba gets its value recalculated. Such
 * a weighing is never removed here: reopening the animal in the manejo does it.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the table and the columns set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    updates: [] as { table: unknown; columns: Record<string, unknown> }[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
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
          update: (table: unknown) => {
            let columns: Record<string, unknown> = {};
            const builder = {
              set(next: Record<string, unknown>) {
                columns = next;
                state.updates.push({ table, columns });
                return builder;
              },
              where: () => ({
                returning: () => Promise.resolve([{ id: 42, ...columns }]),
                then: (resolve: (value: undefined) => unknown) => resolve(undefined),
              }),
            };
            return builder;
          },
        })
      ),
  },
}));

import { manejoSessionAnimals, weighings } from "@/lib/db/schema";
import { saleAmount } from "@/lib/domain/movements";
import { EditWeighingUseCase } from "../EditWeighing.useCase";
import { RemoveWeighingUseCase } from "../RemoveWeighing.useCase";

const weighing = { id: 42, date: "2026-07-01" };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
});

describe("editWeighing", () => {
  const edit = (input: { date: string; weightKg: number }) =>
    new EditWeighingUseCase().run({ farmId: 7, animalId: "a-1", weighingId: 42, input });

  it("moves a weighing no manejo wrote to another day and weight", async () => {
    state.selectResults = [[weighing], []];

    const result = await edit({ date: "2026-06-28", weightKg: 318 });

    expect(result).toEqual({
      weighing: { id: 42, date: "2026-06-28", weightKg: 318 },
      manejo: null,
    });
    expect(state.updates).toEqual([
      { table: weighings, columns: { date: "2026-06-28", weightKg: 318 } },
    ]);
  });

  it("finds nothing for a weighing of another farm, or already removed", async () => {
    state.selectResults = [[]];

    expect(await edit({ date: "2026-07-01", weightKg: 318 })).toBeNull();
    expect(state.updates).toEqual([]);
  });

  it("writes the kg of a manejo weighing on the session entry too", async () => {
    state.selectResults = [
      [weighing],
      [{ sessionId: "s-1", kind: "weighing", pricePerArroba: null, carcassYieldPct: null }],
    ];

    const result = await edit({ date: "2026-07-01", weightKg: 322.5 });

    expect(result).toEqual({
      weighing: { id: 42, date: "2026-07-01", weightKg: 322.5 },
      manejo: { sessionId: "s-1", weightKg: 322.5 },
    });
    expect(state.updates).toEqual([
      { table: weighings, columns: { date: "2026-07-01", weightKg: 322.5 } },
      { table: manejoSessionAnimals, columns: { weightKg: 322.5 } },
    ]);
  });

  it("recalculates the value of a venda priced by the arroba", async () => {
    state.selectResults = [
      [weighing],
      [{ sessionId: "s-venda", kind: "sale", pricePerArroba: 310, carcassYieldPct: 52 }],
    ];

    const result = await edit({ date: "2026-07-01", weightKg: 540 });

    const amountBrl = saleAmount(540, 310, 52);
    expect(result).toEqual({
      weighing: { id: 42, date: "2026-07-01", weightKg: 540 },
      manejo: { sessionId: "s-venda", weightKg: 540, amountBrl },
    });
    expect(state.updates[1]).toEqual({
      table: manejoSessionAnimals,
      columns: { weightKg: 540, amountBrl },
    });
  });

  it("prices a venda that never set a yield at the default one", async () => {
    state.selectResults = [
      [weighing],
      [{ sessionId: "s-venda", kind: "sale", pricePerArroba: 310, carcassYieldPct: null }],
    ];

    const result = await edit({ date: "2026-07-01", weightKg: 540 });

    expect(result).toMatchObject({ manejo: { amountBrl: saleAmount(540, 310) } });
  });

  it("refuses to move a manejo weighing off the session's day", async () => {
    state.selectResults = [
      [weighing],
      [{ sessionId: "s-1", kind: "weighing", pricePerArroba: null, carcassYieldPct: null }],
    ];

    expect(await edit({ date: "2026-06-30", weightKg: 322 })).toBe("weighing_from_manejo");
    expect(state.updates).toEqual([]);
  });
});

describe("removeWeighing", () => {
  const remove = () =>
    new RemoveWeighingUseCase().run({ farmId: 7, animalId: "a-1", weighingId: 42 });

  it("stamps a weighing no manejo wrote", async () => {
    state.selectResults = [[weighing], []];

    expect(await remove()).toEqual({ id: 42 });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].table).toBe(weighings);
    expect(state.updates[0].columns.deletedAt).toBeInstanceOf(Date);
  });

  it("finds nothing for a weighing of another farm, or already removed", async () => {
    state.selectResults = [[]];

    expect(await remove()).toBeNull();
    expect(state.updates).toEqual([]);
  });

  it("leaves a manejo weighing to the manejo", async () => {
    state.selectResults = [[weighing], [{ sessionId: "s-1" }]];

    expect(await remove()).toBe("weighing_from_manejo");
    expect(state.updates).toEqual([]);
  });
});
