/**
 * setCarcassYield: sets the rendimento de carcaça of an open venda per arroba,
 * repricing the passes that follow the padrão. A boiada priced at its own
 * rendimento at the brete keeps it — the padrão change does not touch it.
 *
 * The db stub answers selects from a queued list of rows and logs every write
 * by table, in call order; updates record the columns each `.set()` call gets.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every write issued: `update <table>`, in call order. */
    writes: [] as string[],
    /** Columns of every `update().set()` call. */
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
              set: (set: Record<string, unknown>) => {
                state.updates.push(set);
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

import { saleAmount } from "@/lib/domain/movements";
import { SetCarcassYieldUseCase } from "../SetCarcassYield.useCase";

const SALE_SESSION = { id: "s-1", farmId: 7, status: "open", kind: "sale", pricePerArroba: 300 };

beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
});

describe("setCarcassYield", () => {
  it("reprices only the passes that follow the padrão", async () => {
    state.selectResults = [
      [SALE_SESSION],
      [
        { animalId: "a", weightKg: 500, carcassYieldPct: null, earTag: "A" },
        { animalId: "b", weightKg: 500, carcassYieldPct: 54, earTag: "B" },
      ],
    ];

    const result = await new SetCarcassYieldUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      carcassYieldPct: 55,
    });

    expect(result).toEqual({
      carcassYieldPct: 55,
      amounts: [{ earTag: "A", amountBrl: saleAmount(500, 300, 55) }],
    });
    expect(state.writes.filter((w) => w === "update manejo_session_animals")).toHaveLength(1);
  });
});
