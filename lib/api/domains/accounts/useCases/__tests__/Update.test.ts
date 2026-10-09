/**
 * updateAccount: renames a conta (unique per farm and grupo regardless of
 * case) or archives and restores it.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set and answer from their own
 * queue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows each `update().returning()` resolves to, in call order. */
    updateResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
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

function updateBuilder() {
  const builder = {
    set(columns: Record<string, unknown>) {
      state.updates.push(columns);
      return builder;
    },
    where: () => builder,
    returning: () => Promise.resolve(state.updateResults.shift() ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, update: updateBuilder } }));

import { UpdateAccountUseCase } from "../Update.useCase";

const ACCOUNT = {
  id: "acc-1",
  farmId: 7,
  group: "grp-nutricao",
  name: "Sal mineral",
  archivedAt: null,
  openingBalanceBrl: null,
  openingDate: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updateResults = [];
  state.updates = [];
});

describe("updateAccount", () => {
  it("archives a conta", async () => {
    state.selectResults = [[ACCOUNT]];
    state.updateResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-24T12:00:00Z") }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { archived: true },
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ id: "acc-1", name: "Sal mineral" });
  });

  it("restores an archived conta", async () => {
    state.selectResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-01T12:00:00Z") }]];
    state.updateResults = [[ACCOUNT]];

    await new UpdateAccountUseCase().run({ farmId: 7, id: "acc-1", patch: { archived: false } });

    expect(state.updates).toEqual([{ archivedAt: null }]);
  });

  it("renames, trimmed", async () => {
    state.selectResults = [[ACCOUNT], []];
    state.updateResults = [[{ ...ACCOUNT, name: "Sal proteinado" }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { name: " Sal proteinado " },
    });

    expect(state.updates).toEqual([{ name: "Sal proteinado" }]);
    expect(result).toMatchObject({ name: "Sal proteinado" });
  });

  it("answers duplicate when another conta of the grupo has the name", async () => {
    state.selectResults = [[ACCOUNT], [{ id: "acc-2" }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { name: "RAÇÃO E SUPLEMENTO" },
    });

    expect(result).toBe("duplicate");
    expect(state.updates).toEqual([]);
  });

  it("answers null for a conta of another farm", async () => {
    state.selectResults = [[]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 8,
      id: "acc-1",
      patch: { archived: true },
    });

    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});

describe("updateAccount — saldo devedor inicial", () => {
  const PRONAF = { ...ACCOUNT, id: "acc-2", group: "grp-financiamentos", name: "Pronaf" };
  /** The conta's grupo, read only when the saldo inicial is in the patch. */
  const grupo = (id: string, kind: string) =>
    ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
  const FINANCIAMENTOS = grupo("grp-financiamentos", "financing");
  const run = (patch: Parameters<UpdateAccountUseCase["run"]>[0]["patch"]) =>
    new UpdateAccountUseCase().run({ farmId: 7, id: "acc-2", patch });

  it("sets and clears it on a conta de financiamento", async () => {
    state.selectResults = [[PRONAF], [FINANCIAMENTOS]];
    state.updateResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];

    const result = await run({ openingBalanceBrl: 180000, openingDate: "2026-06-30" });

    expect(state.updates).toEqual([{ openingBalanceBrl: 180000, openingDate: "2026-06-30" }]);
    expect(result).toMatchObject({ openingBalanceBrl: 180000, openingDate: "2026-06-30" });

    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }], [FINANCIAMENTOS]];
    state.updateResults = [[PRONAF]];
    await run({ openingBalanceBrl: null, openingDate: null });
    expect(state.updates[1]).toEqual({ openingBalanceBrl: null, openingDate: null });
  });

  it("refuses half of it, and any of it outside financiamento", async () => {
    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }], [FINANCIAMENTOS]];
    expect(await run({ openingDate: null })).toBe("invalid_opening");
    state.selectResults = [[ACCOUNT], [grupo("grp-nutricao", "expense")]];
    expect(await run({ openingBalanceBrl: 500, openingDate: "2026-06-30" })).toBe("invalid_opening");
    expect(state.updates).toEqual([]);
  });

  it("renames a conta de financiamento without reading its grupo", async () => {
    // The conta, then the name clash (none): no grupo read.
    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }], []];
    state.updateResults = [[{ ...PRONAF, name: "Pronaf Mais Alimentos" }]];

    expect(await run({ name: "Pronaf Mais Alimentos" })).toMatchObject({ name: "Pronaf Mais Alimentos" });
    expect(state.updates).toEqual([{ name: "Pronaf Mais Alimentos" }]);
  });
});
