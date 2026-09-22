/**
 * reactivateAnimal: a baixa entered by mistake taken back from the Baixas
 * screen. The animal returns to the active herd in the lot it left from; a
 * venda is undone by its manejo instead, and a lot deleted meanwhile has no
 * place to take it back.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    for: () => builder,
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
          update: () => {
            const builder = {
              set(columns: Record<string, unknown>) {
                state.updates.push(columns);
                return builder;
              },
              where: () => Promise.resolve(undefined),
            };
            return builder;
          },
        })
      ),
  },
}));

import { ReactivateAnimalUseCase } from "../Reactivate.useCase";

const reactivate = () => new ReactivateAnimalUseCase().run({ farmId: 7, animalId: "a-1" });

const dead = { active: false, inactiveReason: "death", lotDeletedAt: null };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
});

describe("reactivateAnimal", () => {
  it("puts a dead animal back in the active herd and clears its baixa", async () => {
    state.selectResults = [[dead]];

    expect(await reactivate()).toBe(true);
    expect(state.updates).toEqual([
      { active: true, inactiveReason: null, inactiveDate: null, inactiveNotes: null },
    ]);
  });

  it("refuses an unknown animal, an active one and a sold one", async () => {
    state.selectResults = [[]];
    expect(await reactivate()).toBe("animal_not_found");

    state.selectResults = [[{ ...dead, active: true, inactiveReason: null }]];
    expect(await reactivate()).toBe("animal_active");

    state.selectResults = [[{ ...dead, inactiveReason: "sale" }]];
    expect(await reactivate()).toBe("animal_sold");

    expect(state.updates).toEqual([]);
  });

  it("refuses when the animal's lot was deleted since", async () => {
    state.selectResults = [[{ ...dead, lotDeletedAt: new Date() }]];

    expect(await reactivate()).toBe("lot_deleted");
    expect(state.updates).toEqual([]);
  });
});
