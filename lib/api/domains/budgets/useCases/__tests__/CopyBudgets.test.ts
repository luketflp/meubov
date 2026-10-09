/**
 * copyBudgets ("Copiar da safra anterior"): fills only the lines the target
 * safra lacks, from the source's orçado or its realizado, with the % applied
 * and each month rounded to the centavo; the realizado becomes grupo lines
 * only. Runs the real copyPlan of lib/domain/budget.ts.
 *
 * Shared db stub. Selects answer in call order: the farm's start month, the
 * budgets of both safras, the lançamentos, the contas, the grupos, and, after
 * the insert, the target safra as it ends up.
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
import { safraMonths } from "@/lib/domain/budget";

import { CopyBudgetsUseCase } from "../CopyBudgets.useCase";

/** Calendar months of a safra starting in outubro, in safra order: "2025-10-01"… */
const monthsOf = (safra: number) => safraMonths(safra, 10).map((m) => `${m.key}-01`);

/** The twelve rows of a line, the same amount every month. */
const line = (safra: number, category: string, accountId: string | null, amountBrl: number) =>
  monthsOf(safra).map((month) => ({
    id: `${category}-${accountId}-${month}`,
    farmId: 7,
    category,
    accountId,
    month,
    amountBrl,
    distribution: "equal",
    updatedAt: new Date(0),
    updatedBy: "user-0",
  }));

const expense = (fields: Record<string, unknown>) => ({
  id: `e-${fields.date}`,
  farmId: 7,
  kind: "expense",
  flow: null,
  category: "grp-nutricao",
  accountId: null,
  ...fields,
});

/** A plan_groups row of farm 7. */
const grupo = (id: string, kind: string, archivedAt: Date | null = null) => ({
  id,
  farmId: 7,
  kind,
  name: id,
  archivedAt,
  createdAt: new Date(0),
});
/** Nutrição, Administrativo and Pastagem, the despesa grupos the lines below use, and Receitas. */
const GROUPS = [
  grupo("grp-nutricao", "expense"),
  grupo("grp-administrativo", "expense"),
  grupo("grp-pastagem", "expense"),
  grupo("grp-receitas", "revenue"),
];

const run = (input: { source: "budgeted" | "realized"; adjustPct: number; startMonth?: number }) =>
  new CopyBudgetsUseCase().run({
    farmId: 7,
    userId: "user-1",
    from: 2025,
    to: 2026,
    startMonth: 10,
    todayIso: "2026-10-02",
    ...input,
  });
/** A copy that went through. */
const copy = async (input: { source: "budgeted" | "realized"; adjustPct: number }) => {
  const result = await run(input);
  if (typeof result === "string") throw new Error(result);
  return result;
};

const inserted = () => state.inserts[0] as Record<string, unknown>[];
const rowsOf = (key: string) =>
  inserted().filter((row) => `${row.category}:${row.accountId}` === key);

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.wheres = [];
});

describe("copyBudgets", () => {
  it("copies only the lines the target lacks, with the % applied and every month rounded", async () => {
    const final = line(2026, "grp-nutricao", null, 900);
    state.selectResults = [
      [{ startMonth: 10 }],
      [
        ...line(2025, "grp-nutricao", null, 1000),
        ...line(2025, "grp-administrativo", null, 33.33),
        ...line(2025, "grp-pastagem", "acc-cerca", 8.37),
        // Nutrição already has its own line in 2026: it is not touched.
        ...final,
      ],
      [],
      // A conta's line is read only when the conta is the farm's.
      [{ id: "acc-cerca", group: "grp-pastagem", name: "Cerca", archivedAt: null }],
      GROUPS,
      final,
    ];

    const result = await copy({ source: "budgeted", adjustPct: 5 });

    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.budgets).toHaveLength(12);
    // Both safras' calendar months, on this farm only.
    const both = renderSql(state.wheres[1] as SQL);
    expect(both.sql).toContain('"budgets"."farm_id" = $1');
    expect(both.params).toEqual([7, "2025-10-01", "2026-09-30", 7, "2026-10-01", "2027-09-30"]);

    expect(inserted()).toHaveLength(24);
    expect(rowsOf("grp-nutricao:null")).toEqual([]);
    // 33,33 × 1,05 = 34,9965 → 35,00; 8,37 × 1,05 = 8,7885 → 8,79.
    expect(rowsOf("grp-administrativo:null").map((row) => row.amountBrl)).toEqual(Array(12).fill(35));
    expect(rowsOf("grp-pastagem:acc-cerca").map((row) => row.amountBrl)).toEqual(Array(12).fill(8.79));
    expect(rowsOf("grp-administrativo:null").map((row) => row.month)).toEqual(monthsOf(2026));
    for (const row of inserted()) {
      expect(row).toMatchObject({ farmId: 7, distribution: "manual", updatedBy: "user-1" });
    }
  });

  it("copies the realizado as grupo lines only, despesas only, never a receita", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [],
      [
        expense({ date: "2025-10-15", amountBrl: 300, accountId: "acc-sal" }),
        expense({ date: "2026-01-10", amountBrl: 200 }),
        expense({ date: "2025-11-01", amountBrl: 5000, kind: "revenue", category: "grp-receitas" }),
      ],
      [{ id: "acc-sal", group: "grp-nutricao", name: "Sal mineral", archivedAt: null }],
      GROUPS,
      [],
    ];

    const result = await copy({ source: "realized", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 1, skipped: 0 });
    expect(inserted().every((row) => row.accountId === null)).toBe(true);
    // Safra order: out/25 is index 0, jan/26 index 3.
    expect(rowsOf("grp-nutricao:null").map((row) => row.amountBrl)).toEqual([300, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rowsOf("grp-receitas:null")).toEqual([]);
  });

  it("refuses with start_month_changed when the farm's início moved in another session, and reads nothing else", async () => {
    state.selectResults = [[{ startMonth: 1 }]];

    expect(await run({ source: "budgeted", adjustPct: 0, startMonth: 10 })).toBe("start_month_changed");
    expect(state.wheres).toHaveLength(1);
    expect(state.inserts).toEqual([]);
  });

  it("writes nothing when every line already has a budget, and answers the target as it is", async () => {
    const final = line(2026, "grp-administrativo", null, 100);
    const budgets = [...line(2025, "grp-administrativo", null, 90), ...final];
    state.selectResults = [[{ startMonth: 10 }], budgets, [], [], GROUPS, final];

    const result = await copy({ source: "budgeted", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 0, skipped: 1 });
    expect(result.budgets).toHaveLength(12);
    expect(state.inserts).toEqual([]);
  });

  it("copies an active grupo's line and leaves an archived grupo's behind", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [...line(2025, "g-maq", null, 100), ...line(2025, "g-arr", null, 500)],
      [],
      [],
      [grupo("g-maq", "expense"), grupo("g-arr", "expense", new Date("2026-01-05T00:00:00Z"))],
      [],
    ];

    const result = await copy({ source: "budgeted", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 1, skipped: 0 });
    expect(rowsOf("g-maq:null").map((row) => row.amountBrl)).toEqual(Array(12).fill(100));
    expect(rowsOf("g-arr:null")).toEqual([]);
    // The grupos read are this farm's.
    const grupos = renderSql(state.wheres[4] as SQL);
    expect(grupos.sql).toContain('"plan_groups"."farm_id" = $1');
    expect(grupos.params).toEqual([7]);
  });
});
