/**
 * putBudgetLine: saves one line of a safra's orçamento whole — its twelve
 * calendar months replace the ones it had in that safra. A conta must be of
 * this farm and of the grupo, and anything but twelve months is refused. The
 * months are stored as sent: that they add up to the total typed is the
 * dialog's check (the body carries no total).
 *
 * Shared db stub: selects answer from the queue (the grupo, the conta, then
 * the farm's start month), the delete and the select record their condition,
 * the insert records its rows and answers the queued `returning`.
 */
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

import { PutBudgetLineUseCase } from "../PutBudgetLine.useCase";

/** R$ 100,00 split evenly: 8,33 eleven times and the remainder on the last month. */
const EVEN = [...Array<number>(11).fill(8.33), 8.37];
/** Safra 2025/26 starting in outubro, out/25 first. */
const OCT_TO_SEP = [
  "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01",
  "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
];
const put = (input: Partial<Parameters<PutBudgetLineUseCase["run"]>[0]>) =>
  new PutBudgetLineUseCase().run({
    farmId: 7,
    userId: "user-1",
    safra: 2025,
    startMonth: 10,
    category: "grp-nutricao",
    months: EVEN,
    distribution: "equal",
    ...input,
  });
const inserted = () => state.inserts[0] as Record<string, unknown>[];
/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
  state.wheres = [];
});

describe("putBudgetLine", () => {
  it("replaces the grupo's own line with twelve rows, safra month by safra month", async () => {
    state.selectResults = [[NUTRICAO], [{ startMonth: 10 }]];
    state.returning = [
      EVEN.map((amountBrl, i) => ({
        id: `b-${i}`,
        farmId: 7,
        category: "grp-nutricao",
        accountId: null,
        month: OCT_TO_SEP[i],
        amountBrl,
        distribution: "equal",
        updatedAt: new Date(0),
        updatedBy: "user-1",
      })),
    ];

    const result = await put({});

    // The old rows of the safra go first, the grupo's own only: its contas' lines stay.
    expect(state.deletes).toBe(1);
    const removed = renderSql(state.wheres[2] as SQL);
    expect(removed.sql).toContain('"budgets"."month" between $2 and $3');
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "grp-nutricao"]);
    // Out/25 first: the i-th amount on the i-th calendar month from outubro.
    expect(inserted().map((row) => row.month)).toEqual(OCT_TO_SEP);
    expect(inserted().map((row) => row.amountBrl)).toEqual(EVEN);
    for (const row of inserted()) {
      expect(row).toMatchObject({
        farmId: 7,
        category: "grp-nutricao",
        accountId: null,
        distribution: "equal",
        updatedBy: "user-1",
      });
    }
    expect(result).toHaveLength(12);
    expect((result as { month: string }[])[0]).toMatchObject({ month: "2025-10-01", amountBrl: 8.33 });
  });

  it("saves a conta's line, of this farm and grupo, with the months as typed", async () => {
    state.selectResults = [[NUTRICAO], [{ group: "grp-nutricao" }], [{ startMonth: 1 }]];
    // Manual: whatever the months are, they go as sent.
    const typed = [1200, 0, 0, 450.5, 0, 0, 0, 0, 0, 0, 0, 99.99];

    await put({ startMonth: 1, accountId: "acc-sal", months: typed, distribution: "manual" });

    const conta = renderSql(state.wheres[1] as SQL);
    expect(conta.sql).toContain('"accounts"."farm_id" = $1');
    expect(conta.params).toEqual([7, "acc-sal"]);
    // Starting in janeiro, safra 2025 is the calendar year.
    expect(renderSql(state.wheres[3] as SQL).params).toEqual([7, "2025-01-01", "2025-12-31", "grp-nutricao", "acc-sal"]);
    expect(inserted().map((row) => row.month)).toEqual([
      "2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01",
      "2025-07-01", "2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01",
    ]);
    expect(inserted().map((row) => row.amountBrl)).toEqual(typed);
    expect(inserted()[0]).toMatchObject({ accountId: "acc-sal", distribution: "manual" });
  });

  it("stores each month to the centavo", async () => {
    state.selectResults = [[NUTRICAO], [{ startMonth: 10 }]];

    await put({ months: [8.333, 8.337, ...EVEN.slice(2)], distribution: "manual" });

    expect(inserted().map((row) => row.amountBrl).slice(0, 2)).toEqual([8.33, 8.34]);
  });

  it("refuses with start_month_changed when the farm's início moved in another session, and writes nothing", async () => {
    // The client still reads safras from outubro; the farm now starts in janeiro.
    state.selectResults = [[NUTRICAO], [{ startMonth: 1 }]];

    expect(await put({ startMonth: 10 })).toBe("start_month_changed");
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("refuses a conta of another farm or of another grupo, and writes nothing", async () => {
    // Another farm's conta: the farm filter finds nothing.
    state.selectResults = [[NUTRICAO], []];
    expect(await put({ accountId: "acc-of-another-farm" })).toBe("invalid_account");
    state.selectResults = [[NUTRICAO], [{ group: "grp-administrativo" }]];
    expect(await put({ accountId: "acc-escritorio" })).toBe("invalid_account");
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("saves a line of a despesa grupo of the farm and refuses any other grupo", async () => {
    // The grupo (one of this farm's), then the farm's start month.
    state.selectResults = [[grupo("grp-maq", "expense")], [{ startMonth: 10 }]];
    await put({ category: "grp-maq" });
    const read = renderSql(state.wheres[0] as SQL);
    expect(read.sql).toContain('"plan_groups"."farm_id"');
    expect(read.params).toEqual(expect.arrayContaining([7, "grp-maq"]));
    expect(inserted()[0]).toMatchObject({ category: "grp-maq", accountId: null });

    state.inserts = [];
    state.deletes = 0;
    // No grupo of this farm by that id.
    state.selectResults = [[]];
    expect(await put({ category: "grp-of-another-farm" })).toBe("invalid_category");
    // Only despesas are orçadas: a receita or capital grupo is refused.
    for (const kind of ["revenue", "investment", "financing", "partners"]) {
      state.selectResults = [[grupo("grp-x", kind)]];
      expect(await put({ category: "grp-x" })).toBe("invalid_category");
    }
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("refuses 11 or 13 months before reading anything", async () => {
    expect(await put({ months: EVEN.slice(1) })).toBe("months_mismatch");
    expect(await put({ months: [...EVEN, 0] })).toBe("months_mismatch");
    expect(state.wheres).toEqual([]);
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });
});
