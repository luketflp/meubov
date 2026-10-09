/**
 * addSeries: a parcelamento writes N parcelas with the purchase's date and
 * stepped vencimentos; a recorrência writes each ocorrência on its own
 * vencimento up to a year ahead. The db stub echoes what is inserted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order: the grupo, the conta do plano, then "Pago por". */
    selectResults: [] as Record<string, unknown>[][],
    inserts: [] as Record<string, unknown>[][],
  },
}));

vi.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const rows = state.selectResults.shift() ?? [];
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
      };
      return builder;
    },
    insert: () => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(values) ? values : [values];
        state.inserts.push(rows);
        return { returning: () => Promise.resolve(rows) };
      },
    }),
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(db)),
  };
  return { db };
});

import { AddSeriesUseCase } from "../AddSeries.useCase";

const ENTRY = {
  farmId: 7,
  todayIso: "2026-09-28",
  date: "2026-09-27",
  category: "grp-nutricao",
  counterparty: "Nutron",
  document: "NF 4.812",
};

/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });

beforeEach(() => {
  // Every despesa here is in Nutrição unless a test says otherwise: the grupo check reads it first.
  state.selectResults = [[grupo("grp-nutricao", "expense")]];
  state.inserts = [];
});

describe("addSeries — parcelado", () => {
  it("creates N rows with the same date, stepped vencimentos and the centavos on the last", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      paidAt: "2026-09-27",
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({ mode: "installments", count: 3, amountBrl: 1000, generatedCount: 3, endsOn: null });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-27", "2026-09-27", "2026-09-27"]);
    expect(rows.map((row) => row.dueDate)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(rows.map((row) => row.amountBrl)).toEqual([333.33, 333.33, 333.34]);
    expect(rows.map((row) => row.paidAt)).toEqual(["2026-09-27", null, null]);
    expect(rows.map((row) => row.seriesIndex)).toEqual([1, 2, 3]);
    expect(rows.every((row) => row.seriesId === series.id && row.counterparty === "Nutron")).toBe(true);
    expect(Array.isArray(result) && result.map((e) => `${e.seriesIndex}/${e.seriesCount}`)).toEqual([
      "1/3",
      "2/3",
      "3/3",
    ]);
  });

  it("refuses a first parcela before the purchase", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-09-01" },
    });
    expect(result).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a parcelamento without a count", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      repeat: { mode: "installments", frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_repeat");
  });

  it.each([1, 49])("refuses %i parcelas", async (count) => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      repeat: { mode: "installments", count, frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a total smaller than one centavo per parcela", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 0.02,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_repeat");
  });

  it("refuses a série in a grupo that is not the farm's, and writes nothing", async () => {
    // The farm filter finds no grupo by that id.
    state.selectResults = [[]];
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      category: "grp-of-another-farm",
      amountBrl: 1000,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
  });
});

describe("addSeries — recorrente", () => {
  it("writes each ocorrência on its own date up to today + 12 months", async () => {
    state.selectResults = [[grupo("grp-mao-de-obra", "expense")]];
    await new AddSeriesUseCase().run({
      ...ENTRY,
      category: "grp-mao-de-obra",
      amountBrl: 6480,
      repeat: { mode: "recurring", frequency: "monthly", dayOfMonth: 5, startsOn: "2026-10-05" },
    });

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({ mode: "recurring", dayOfMonth: 5, count: null, endsOn: null, generatedCount: 12 });
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ date: "2026-10-05", dueDate: "2026-10-05", amountBrl: 6480 });
    expect(rows[11]).toMatchObject({ date: "2027-09-05", dueDate: "2027-09-05", seriesIndex: 12 });
  });

  it("stores the day of a monthly série even when it is not sent", async () => {
    await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1280,
      repeat: { mode: "recurring", frequency: "monthly", startsOn: "2026-10-31", endsOn: "2026-12-31" },
    });
    expect(state.inserts[0][0]).toMatchObject({ dayOfMonth: 31 });
    expect(state.inserts[1].map((row) => row.dueDate)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
  });

  it("stops at até", async () => {
    await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1280,
      repeat: { mode: "recurring", frequency: "monthly", dayOfMonth: 20, startsOn: "2026-10-20", endsOn: "2026-12-31" },
    });
    expect(state.inserts[1].map((row) => row.dueDate)).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
  });

  it("refuses an end before the start", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1280,
      repeat: { mode: "recurring", frequency: "weekly", startsOn: "2026-10-20", endsOn: "2026-10-01" },
    });
    expect(result).toBe("invalid_repeat");
  });

  it("refuses a start more than 12 months ago, takes one exactly 12 months ago", async () => {
    const run = (startsOn: string) =>
      new AddSeriesUseCase().run({
        ...ENTRY,
        amountBrl: 1280,
        repeat: { mode: "recurring", frequency: "monthly", startsOn, endsOn: "2025-10-31" },
      });
    expect(await run("2025-09-27")).toBe("starts_too_old");
    expect(await run("2025-09-28")).not.toBe("starts_too_old");
  });
});

describe("addSeries — fora do resultado", () => {
  it("writes a financiamento's grupo and movimento on the série and every parcela, without lote", async () => {
    state.selectResults = [[grupo("grp-financiamentos", "financing")], [{ group: "grp-financiamentos" }]];

    await new AddSeriesUseCase().run({
      ...ENTRY,
      kind: "financing",
      category: "grp-financiamentos",
      accountId: "acc-pronaf",
      lotId: "lot-1",
      amountBrl: 1200,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({
      kind: "financing",
      flow: "out",
      category: "grp-financiamentos",
      accountId: "acc-pronaf",
      lotId: null,
    });
    expect(
      rows.every((row) => row.flow === "out" && row.category === "grp-financiamentos" && row.lotId === null)
    ).toBe(true);
  });

  it("refuses a série of sócios without a conta", async () => {
    state.selectResults = [[grupo("grp-socios", "partners")]];
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      kind: "partners",
      category: "grp-socios",
      amountBrl: 5000,
      repeat: { mode: "recurring", frequency: "monthly", startsOn: "2026-10-05" },
    });
    expect(result).toBe("invalid_account");
    expect(state.inserts).toEqual([]);
  });

  it("never repeats a rendimento", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      kind: "yield",
      amountBrl: 50,
      bankAccountId: "cdb",
      repeat: { mode: "recurring", frequency: "monthly", startsOn: "2026-10-05" },
    });
    expect(result).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
  });
});
