# Venda: apartar boiada, refugo e dúvida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At a venda's brete, sort each animal into Boiada (sold), Refugo (stays) or Dúvida (decide later), each priced at its own rendimento de carcaça.

**Architecture:** Two new `ManejoOutcome` values (`rejected`, `held`) and a nullable per-entry `carcassYieldPct`. A new `set-aside` route writes refugo/dúvida passes; `complete` takes an optional rendimento. One pure helper, `passYieldPct`, prices every boiada pass everywhere. The runner renders a venda-only brete card and three list cards.

**Tech Stack:** Next.js (app router, read `node_modules/next/dist/docs/` before touching routing), Elysia + Eden, drizzle-orm/Postgres, zustand, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-venda-apartacao-design.md`

## Global Constraints

- Work in the worktree `/home/luketa/meubov/.claude/worktrees/venda-apartacao` (branch `feat/venda-apartacao`). Never `cd` to the main checkout.
- No commits until the user picks "commit" at the end (repo habit: one `feat(manejo): …` commit, no trailers). Task "commit" steps are replaced by `git add` only.
- Outcome values: `"rejected"` = refugo, `"held"` = dúvida. UI copy: "Boiada", "Refugo", "Dúvida", "pulado".
- Money (R$) needs Financeiro view; the rendimento field needs Financeiro edit.
- Rendimento stored on an entry only when it differs from the venda's padrão (`session.carcassYieldPct ?? 50`).
- Only `kind === "sale"` sessions produce `rejected`/`held`; other kinds keep today's runner.
- Run tests with `pnpm vitest run <path>`; typecheck with `pnpm tsc --noEmit`; lint with `pnpm lint`.

## Review Focus

1. A refugo pass on a venda per arroba whose weighing is later edited in the ficha must not gain an `amountBrl` (EditWeighing reprices only `done`). Test in Task 3.
2. Changing the padrão in the modal must not reprice a boiada with its own rendimento. Test in Task 3.
3. Deleting a venda with refugo/dúvida entries must soft-delete their weighings and must not report `not_sold` or reactivate them. Test in Task 2.
4. Undoing a refugo/dúvida must not touch the animal row (no reactivation write). Test in Task 3.
5. Closing with a dúvida open is refused by the server even if the UI button is bypassed. Test in Task 3.

---

### Task 1: Data model, migration and `passYieldPct`

**Files:**
- Modify: `lib/types.ts:179` (`ManejoOutcome`), `lib/types.ts:182-210` (`ManejoSessionAnimal`)
- Modify: `lib/db/schema.ts:132-136` (enum), `lib/db/schema.ts:626-660` (table)
- Create: `drizzle/0019_venda-apartacao.sql` (+ generated snapshot/journal)
- Modify: `lib/api/mappers.ts:262-279` (`toManejoSessionAnimal`)
- Modify: `lib/domain/movements.ts` (add `passYieldPct` after `saleAmount`)
- Test: `lib/domain/__tests__/movements.test.ts`

**Interfaces:**
- Produces: `ManejoOutcome = "pending" | "done" | "skipped" | "rejected" | "held"`; `ManejoSessionAnimal.carcassYieldPct?: number`; `passYieldPct(session: { carcassYieldPct?: number }, entry: { carcassYieldPct?: number }): number`.

- [ ] **Step 1: Failing test** — append to `movements.test.ts` (import `passYieldPct`):

```ts
describe("passYieldPct", () => {
  it("uses the animal's own rendimento first", () => {
    expect(passYieldPct({ carcassYieldPct: 52 }, { carcassYieldPct: 54 })).toBe(54);
  });
  it("falls back to the venda's padrão, then to 50%", () => {
    expect(passYieldPct({ carcassYieldPct: 52 }, {})).toBe(52);
    expect(passYieldPct({}, {})).toBe(DEFAULT_CARCASS_YIELD_PCT);
  });
});
```

- [ ] **Step 2:** `pnpm vitest run lib/domain/__tests__/movements.test.ts` → FAIL (`passYieldPct` not exported).

- [ ] **Step 3: Implement.** In `lib/domain/movements.ts` after `saleAmount`:

```ts
/**
 * Rendimento one boiada pass is priced at: the animal's own, set at the brete
 * when it differed from the venda's padrão; else the padrão; else 50%.
 */
export function passYieldPct(
  session: { carcassYieldPct?: number },
  entry: { carcassYieldPct?: number }
): number {
  return entry.carcassYieldPct ?? session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;
}
```

`lib/types.ts`:

```ts
/**
 * `rejected` (refugo) and `held` (dúvida) exist only on a venda: the animal
 * passed the scale but was not sold — refugo stays in the herd, dúvida waits
 * to be decided before the venda closes.
 */
export type ManejoOutcome = "pending" | "done" | "skipped" | "rejected" | "held";
```

and in `ManejoSessionAnimal` after `amountBrl`:

```ts
  /**
   * Rendimento (%) this boiada pass was priced at, when the brete changed it
   * from the venda's padrão. Absent: the pass follows the padrão.
   */
  carcassYieldPct?: number;
```

`lib/db/schema.ts`: add `"rejected", "held"` to `manejoOutcomeEnum`; in `manejoSessionAnimals` after `amountBrl`: `carcassYieldPct: numeric("carcass_yield_pct", { mode: "number" }),`.

`lib/api/mappers.ts` in `toManejoSessionAnimal` after `amountBrl`: `carcassYieldPct: orNothing(row.carcassYieldPct),`.

- [ ] **Step 4: Migration.** `pnpm drizzle-kit generate --name venda-apartacao`. Open `drizzle/0019_venda-apartacao.sql`; it must hold exactly:

```sql
ALTER TYPE "public"."manejo_outcome" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."manejo_outcome" ADD VALUE 'held';--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD COLUMN "carcass_yield_pct" numeric;
```

(no statement may use the new values in the same file). Apply to the dev DB: `pnpm db:migrate` (DB port pitfalls: see memory `meubov-smoke-test-setup`).

- [ ] **Step 5:** `pnpm vitest run lib/domain/__tests__/movements.test.ts` → PASS. `pnpm tsc --noEmit` → note every error from exhaustive outcome maps; they are fixed in Task 2 (list them in the task report).

---

### Task 2: Domain — pricing, summary, progress, revert, labels

**Files:**
- Modify: `lib/store/useHerdStore.ts:84-88` (`ManejoPassData`)
- Modify: `lib/domain/manejo.ts` (`PassEffects`, `buildPassEffects`)
- Modify: `lib/domain/movements.ts` (`SaleSummary`, `saleSummary`, `SaleRow`, `saleRows`)
- Modify: `lib/reports/romaneio.ts:59-100`
- Modify: `components/manejo/helpers.ts:354-381` (`ManejoProgress`, `sessionProgress`)
- Modify: `lib/domain/manejoRevert.ts:85-157`
- Modify: `lib/domain/manejoDetail.ts:52-56, 158-167`; `components/manejo/sale-detail.tsx:229-233`
- Test: `lib/domain/__tests__/manejo.test.ts`, `movements.test.ts`, `manejoRevert.test.ts`, `manejoDetail.test.ts`, `components/manejo/__tests__/helpers.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `passYieldPct`.
- Produces: `ManejoPassData.carcassYieldPct?: number`; `PassEffects.carcassYieldPct?: number` (own pct to store); `SaleSummary` gains `yieldVaries: boolean`, `rejectedHeads: number`, `heldHeads: number` (`carcassYieldPct` becomes the weighted average); `SaleRow.carcassYieldPct: number | null`; `ManejoProgress` gains `rejected: number`, `held: number`; `outcomeLabel(outcome: ManejoOutcome): string | null` exported from `lib/domain/manejoDetail.ts`.

- [ ] **Step 1: Failing tests.**

`lib/domain/__tests__/manejo.test.ts`:

```ts
describe("buildPassEffects — venda com rendimento por animal", () => {
  const sale = { date: "2026-09-23", kind: "sale" as const, weighing: true, pricePerArroba: 320, carcassYieldPct: 52 };

  it("prices at the brete's rendimento and keeps it when it differs from the padrão", () => {
    const effects = buildPassEffects(sale, { weightKg: 546, carcassYieldPct: 54 });
    expect(effects.amountBrl).toBeCloseTo(((546 * 0.54) / 15) * 320, 6);
    expect(effects.carcassYieldPct).toBe(54);
  });

  it("stores nothing when the brete kept the padrão", () => {
    const effects = buildPassEffects(sale, { weightKg: 546, carcassYieldPct: 52 });
    expect(effects.amountBrl).toBeCloseTo(((546 * 0.52) / 15) * 320, 6);
    expect(effects.carcassYieldPct).toBeUndefined();
  });

  it("ignores a rendimento on a venda sold as one lot", () => {
    const effects = buildPassEffects({ ...sale, pricePerArroba: undefined }, { weightKg: 546, carcassYieldPct: 54 });
    expect(effects.amountBrl).toBeUndefined();
    expect(effects.carcassYieldPct).toBeUndefined();
  });
});
```

`movements.test.ts`:

```ts
describe("saleSummary — apartação", () => {
  it("sums the carcass animal by animal and reports the rendimento médio", () => {
    const session = makeSession({
      pricePerArroba: 300,
      carcassYieldPct: 50,
      animals: [
        entry({ earTag: "A", weightKg: 500, amountBrl: saleAmount(500, 300, 50) }),
        entry({ earTag: "B", weightKg: 500, carcassYieldPct: 54, amountBrl: saleAmount(500, 300, 54) }),
        entry({ earTag: "C", outcome: "rejected", weightKg: 400 }),
        entry({ earTag: "D", outcome: "held", weightKg: 450 }),
      ],
    });
    const summary = saleSummary(session);
    expect(summary?.heads).toBe(2);
    expect(summary?.totalWeightKg).toBe(1000);
    expect(summary?.totalCarcassKg).toBeCloseTo(250 + 270, 6);
    expect(summary?.carcassYieldPct).toBeCloseTo(52, 6);
    expect(summary?.yieldVaries).toBe(true);
    expect(summary?.rejectedHeads).toBe(1);
    expect(summary?.heldHeads).toBe(1);
  });

  it("does not flag a venda where every animal kept the padrão", () => {
    const session = makeSession({
      pricePerArroba: 300,
      carcassYieldPct: 52,
      animals: [entry({ earTag: "A", weightKg: 500, amountBrl: saleAmount(500, 300, 52) })],
    });
    expect(saleSummary(session)?.yieldVaries).toBe(false);
    expect(saleSummary(session)?.carcassYieldPct).toBeCloseTo(52, 6);
  });
});

describe("saleRows — apartação", () => {
  it("prices each boiada at its own rendimento and keeps the refugo's weight unpriced", () => {
    const rows = saleRows(
      makeSession({
        pricePerArroba: 300,
        carcassYieldPct: 50,
        animals: [
          entry({ earTag: "B", weightKg: 500, carcassYieldPct: 54, amountBrl: 1 }),
          entry({ earTag: "C", outcome: "rejected", weightKg: 400 }),
        ],
      })
    );
    expect(rows[0].carcassArrobas).toBeCloseTo(carcassArrobas(500, 54), 6);
    expect(rows[0].carcassYieldPct).toBe(54);
    expect(rows[1]).toMatchObject({ outcome: "rejected", weightKg: 400, carcassArrobas: null, amountBrl: null, carcassYieldPct: null });
  });
});
```

`manejoRevert.test.ts`:

```ts
it("stamps a refugo's and a dúvida's weighing without reactivating or blocking them", () => {
  const result = revertDecision(
    session({
      kind: "sale",
      animals: [
        pass({ earTag: "B-001", outcome: "rejected", weighingId: 11 }),
        pass({ earTag: "B-002", outcome: "held", weighingId: 12 }),
      ],
    }),
    [facts({ earTag: "B-001", active: true }), facts({ earTag: "B-002", active: true })]
  );
  expect(result.blocked).toEqual([]);
  expect(result.plan.weighingIds).toEqual([11, 12]);
  expect(result.plan.restore).toEqual([]);
});
```

`components/manejo/__tests__/helpers.test.ts`:

```ts
describe("sessionProgress — apartação", () => {
  it("counts refugo and dúvida as handled, not pending", () => {
    const progress = sessionProgress(
      makeSession({
        kind: "sale",
        animals: [
          { earTag: "A", outcome: "done" },
          { earTag: "B", outcome: "rejected" },
          { earTag: "C", outcome: "held" },
          { earTag: "D", outcome: "skipped" },
          { earTag: "E", outcome: "pending" },
        ],
      })
    );
    expect(progress).toEqual({ total: 5, done: 1, skipped: 1, rejected: 1, held: 1, pending: 1, pct: 80 });
  });
});
```

`manejoDetail.test.ts`:

```ts
describe("outcomeNote — apartação", () => {
  it("labels refugo and dúvida", () => {
    expect(outcomeNote({ earTag: "A", outcome: "rejected", notes: "leve" } as DetailLine)).toBe("refugo · leve");
    expect(outcomeNote({ earTag: "A", outcome: "held" } as DetailLine)).toBe("dúvida");
  });
});
```

(Adjust the `DetailLine` cast to the file's existing helper if it has one.)

- [ ] **Step 2:** Run the five files → FAIL.

- [ ] **Step 3: Implement.**

`ManejoPassData` in `lib/store/useHerdStore.ts`:

```ts
export interface ManejoPassData {
  weightKg?: number;
  notes?: string;
  semenBullId?: string;
  /** Rendimento (%) the brete priced this boiada at (venda per arroba only). */
  carcassYieldPct?: number;
}
```

`lib/domain/manejo.ts`: add to `PassEffects` `/** Own rendimento of a boiada pass, when it differs from the padrão. */ carcassYieldPct?: number;`, import `DEFAULT_CARCASS_YIELD_PCT` from `@/lib/domain/weights`, and replace the sale block:

```ts
  if (session.kind === "sale") {
    effects.sold = true;
    if (session.pricePerArroba !== undefined) {
      const padrao = session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;
      const own = data.carcassYieldPct;
      if (own !== undefined && own !== padrao) effects.carcassYieldPct = own;
      if (weightKg !== undefined) {
        effects.amountBrl = saleAmount(weightKg, session.pricePerArroba, own ?? padrao);
      }
    }
  }
```

`lib/domain/movements.ts` — `SaleSummary` add:

```ts
  /** True when the boiada's animals were priced at different rendimentos. */
  yieldVaries: boolean;
  /** Refugo: passed the scale and stayed on the farm. */
  rejectedHeads: number;
  /** Dúvida still waiting to be decided. */
  heldHeads: number;
```

and change `carcassYieldPct`'s doc to "Rendimento médio (carcass kg ÷ live kg) the money math used, when the sale prices the carcass." In `saleSummary` replace the yield/carcass block:

```ts
  const priced = session.pricePerArroba !== undefined;
  const padrao = session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;
  const totalCarcassKg =
    !priced || weighed.length === 0
      ? null
      : weighed.reduce((sum, a) => sum + carcassKg(a.weightKg ?? 0, passYieldPct(session, a)), 0);
  const yieldPct = !priced
    ? null
    : totalCarcassKg !== null && totalWeightKg
      ? (totalCarcassKg / totalWeightKg) * 100
      : padrao;
  const yieldVaries = priced && new Set(weighed.map((a) => passYieldPct(session, a))).size > 1;
```

and add to the returned object `yieldVaries, rejectedHeads: session.animals.filter((a) => a.outcome === "rejected").length, heldHeads: session.animals.filter((a) => a.outcome === "held").length,`.

`SaleRow` add `/** Rendimento the arrobas used; null when not priced. */ carcassYieldPct: number | null;`. `saleRows`:

```ts
export function saleRows(session: ManejoSession): SaleRow[] {
  if (session.kind !== "sale") return [];
  const priced = session.pricePerArroba !== undefined;
  return session.animals.map((entry) => {
    const passed = entry.outcome === "done";
    // Refugo and dúvida passed the scale too: their weight shows, unpriced.
    const weighedHere = passed || entry.outcome === "rejected" || entry.outcome === "held";
    const weightKg = weighedHere ? (entry.weightKg ?? null) : null;
    const yieldPct = passed && priced ? passYieldPct(session, entry) : null;
    return {
      earTag: entry.earTag,
      outcome: entry.outcome,
      weightKg,
      carcassArrobas: yieldPct === null || weightKg === null ? null : carcassArrobas(weightKg, yieldPct),
      carcassYieldPct: yieldPct,
      amountBrl: passed ? (entry.amountBrl ?? null) : null,
      notes: entry.notes,
    };
  });
}
```

`lib/reports/romaneio.ts` `saleRomaneio`: rows keep `line.carcassArrobas ?? (line.weightKg === null ? null : carcassArrobas(line.weightKg, yieldPct))`; replace `const yieldPct = …` with `const summary = saleSummary(session);` moved up and `const yieldPct = summary?.carcassYieldPct ?? session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;`; totals `arrobas: rows.reduce((sum, row) => sum + (row.arrobas ?? 0), 0),`. Remove the later duplicate `const summary`.

`components/manejo/helpers.ts`:

```ts
export interface ManejoProgress {
  total: number;
  done: number;
  skipped: number;
  /** Venda: refugo — passed the scale, stays on the farm. */
  rejected: number;
  /** Venda: dúvida waiting to be decided. */
  held: number;
  pending: number;
  /** Handled share (everything but pending) over total, 0-100. */
  pct: number;
}

export function sessionProgress(session: ManejoSession): ManejoProgress {
  const count = { pending: 0, done: 0, skipped: 0, rejected: 0, held: 0 };
  for (const a of session.animals) count[a.outcome] += 1;
  const total = session.animals.length;
  return {
    total,
    done: count.done,
    skipped: count.skipped,
    rejected: count.rejected,
    held: count.held,
    pending: count.pending,
    pct: total === 0 ? 0 : Math.round(((total - count.pending) / total) * 100),
  };
}
```

`lib/domain/manejoRevert.ts`:

```ts
/** Only a pass that actually happened produced anything to undo; refugo and dúvida weighed the animal. */
function handled(entry: ManejoSessionAnimal): boolean {
  return entry.outcome === "done" || entry.outcome === "rejected" || entry.outcome === "held";
}
```

in `blockReason`: `if (session.kind === "sale") { return entry.outcome === "done" && facts.active ? "not_sold" : null; }`; in `revertDecision`: `const reactivate = session.kind === "sale" && entry.outcome === "done";`.

`lib/domain/manejoDetail.ts`:

```ts
const OUTCOME_LABEL: Record<Exclude<ManejoOutcome, "done">, string> = {
  pending: "não passou",
  skipped: "pulado",
  rejected: "refugo",
  held: "dúvida",
};

/** Word for an animal that was not simply handled; null for a done pass. */
export function outcomeLabel(outcome: ManejoOutcome): string | null {
  return outcome === "done" ? null : OUTCOME_LABEL[outcome];
}

/** A line's note, prefixed by "pulado", "refugo", "dúvida" or "não passou". */
export function outcomeNote(line: DetailLine): string {
  const label = outcomeLabel(line.outcome);
  if (label === null) return line.notes ?? "";
  return line.notes ? `${label} · ${line.notes}` : label;
}
```

In `sessionWeighingLines` pass the weight for refugo/dúvida: `entry.outcome === "done" || entry.outcome === "rejected" || entry.outcome === "held" ? (entry.weightKg ?? null) : null`.

`components/manejo/sale-detail.tsx` `rowNote`: `import { outcomeLabel } from "@/lib/domain/manejoDetail";` and

```ts
function rowNote(row: SaleRow): string {
  const label = outcomeLabel(row.outcome);
  if (label === null) return row.notes ?? "";
  return row.notes ? `${label} · ${row.notes}` : label;
}
```

Fix any remaining `tsc` errors from exhaustive `ManejoOutcome` maps the same way (add `rejected: "refugo", held: "dúvida"`).

- [ ] **Step 4:** Run the five test files → PASS; `pnpm vitest run lib/domain lib/reports components/manejo` → PASS; `pnpm tsc --noEmit` → no errors outside `lib/api` / store call sites handled in Tasks 3-4.

---

### Task 3: API — complete with rendimento, set-aside, reopen, yield, weighing edit, close, route requirements

**Files:**
- Modify: `lib/api/domains/manejo/schemas/manejo.schema.ts:91-100`
- Modify: `lib/api/domains/manejo/useCases/CompleteAnimal.useCase.ts:190-209`
- Create: `lib/api/domains/manejo/useCases/SetAsideAnimal.useCase.ts`
- Modify: `lib/api/domains/manejo/useCases/ReopenAnimal.useCase.ts:147-180`
- Modify: `lib/api/domains/manejo/useCases/SetCarcassYield.useCase.ts:74-102`
- Modify: `lib/api/domains/animals/useCases/EditWeighing.useCase.ts:71-105`
- Modify: `lib/api/domains/manejo/useCases/Close.useCase.ts`
- Modify: `lib/api/domains/manejo/_shared/session.ts:33-41` (`ManejoConflict` += `"held_pending"`)
- Modify: `lib/api/domains/manejo/manejo.controller.ts`
- Modify: `lib/api/permissions/routeRequirements.ts:45`
- Test: `lib/api/domains/manejo/useCases/__tests__/SetAsideAnimal.test.ts` (create), `CompleteAnimal.test.ts`, `ReopenAnimal.test.ts`, `SetCarcassYield.test.ts` (create), `Close.test.ts` (create), `lib/api/domains/animals/useCases/__tests__/EditWeighing.test.ts`, `lib/api/domains/manejo/__tests__/manejo.controller.test.ts`

**Interfaces:**
- Consumes: Task 1-2 (`ManejoPassData.carcassYieldPct`, `PassEffects.carcassYieldPct`).
- Produces: `POST /api/herd/manejo/:id/animals/:animalId/set-aside` body `{ list: "rejected" | "held"; weightKg?: number; notes?: string }` → `{ entry: ManejoSessionAnimal; weighing?: Weighing }`, 409 `{ error: ManejoConflict }`; `POST …/close` → 409 `{ error: "held_pending" }` when a dúvida is open; `SetAsideAnimalUseCase`.

- [ ] **Step 1: Failing tests.** Use the chainable db stub from `ReopenAnimal.test.ts` (copy its header: `state`, `selectBuilder`, `vi.mock("@/lib/db")`). Add an `insert` to the stub for `SetAsideAnimal.test.ts`:

```ts
insert: (table: Table) => ({
  values: (values: Record<string, unknown>) => ({
    returning: () => {
      state.writes.push(`insert ${getTableName(table)}`);
      return Promise.resolve([{ id: 99, ...values }]);
    },
  }),
}),
```

`SetAsideAnimal.test.ts` cases (session row `kind: "sale", weighing: true, status: "open", date: "2026-09-23"`, pending entry, active animal):
1. `list: "rejected", weightKg: 402, notes: " leve "` → writes `["insert weighings", "update manejo_session_animals"]`; last update set `{ outcome: "rejected", weightKg: 402, weighingId: 99, notes: "leve" }`; result `weighing` `{ date: "2026-09-23", weightKg: 402 }`; no `update animals`.
2. `list: "held"` without weight → writes `["update manejo_session_animals"]`, set `{ outcome: "held", weightKg: null, weighingId: null, notes: null }`.
3. a `health` session → `{ conflict: "entry_not_actionable" }`, no writes.
4. entry `outcome: "done"` → `{ conflict: "entry_not_actionable" }`.
5. inactive animal → `{ conflict: "animal_inactive" }`.

`ReopenAnimal.test.ts` add (sale session, entry `outcome: "rejected", weighingId: 5`, active animal):

```ts
it("undoes a refugo without touching the animal", async () => {
  state.selectResults = [[SALE_SESSION], [{ id: "a-1", earTag: "V-01", lotId: "lot-1", active: true }], [{ ...DONE_ENTRY, outcome: "rejected", breedingId: null, weighingId: 5 }]];
  await new ReopenAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1" });
  expect(state.writes).toEqual(["update weighings", "update manejo_session_animals"]);
  expect(state.updates.at(-1)).toMatchObject({ outcome: "pending", carcassYieldPct: null });
});
```

(`SALE_SESSION = { ...SESSION_ROW, kind: "sale", semenBullIds: null }`.)

`CompleteAnimal.test.ts` add: sale session `pricePerArroba: 320, carcassYieldPct: 52, weighing: true`, data `{ weightKg: 546, carcassYieldPct: 54 }` → the `manejo_session_animals` update set contains `carcassYieldPct: 54` and `amountBrl` ≈ `((546*0.54)/15)*320`.

`SetCarcassYield.test.ts`: sale session (`pricePerArroba: 300`), entries select returns `[{ animalId: "a", weightKg: 500, carcassYieldPct: null, earTag: "A" }, { animalId: "b", weightKg: 500, carcassYieldPct: 54, earTag: "B" }]` → result `amounts` has only `A` (≈ `saleAmount(500, 300, 55)` for new pct 55); exactly one `update manejo_session_animals`.

`EditWeighing.test.ts` add: the manejo entry select returns `{ sessionId: "s-1", kind: "sale", pricePerArroba: 300, carcassYieldPct: 50, outcome: "rejected", entryYieldPct: null }` → result `manejo.amountBrl` undefined and the entry update has no `amountBrl`; and with `outcome: "done", entryYieldPct: 54` → `amountBrl ≈ saleAmount(weight, 300, 54)`.

`Close.test.ts` (Close uses `this.repository` directly, no transaction — stub `db.select` → queued rows and `db.update` → `returning` `[{ id: "s-1" }]`):
1. held select returns `[{ animalId: "a" }]` → `{ conflict: "held_pending" }`, no update.
2. held select returns `[]` → `true`.

`manejo.controller.test.ts` add: `POST /api/herd/manejo/s-1/animals/a-1/set-aside` with `{ list: "held" }` calls the stubbed `SetAsideAnimalUseCase.run` and returns its value; `POST …/complete` with `{ weightKg: 500, carcassYieldPct: 54 }` under permissions without Financeiro edit calls `CompleteAnimalUseCase.run` with `data.carcassYieldPct` undefined; `…/close` returning `{ conflict: "held_pending" }` answers 409 `{ error: "held_pending" }`. Follow the file's existing stub pattern for use cases and permissions.

- [ ] **Step 2:** `pnpm vitest run lib/api` → the new cases FAIL.

- [ ] **Step 3: Implement.**

Schema:

```ts
/** Body of POST /manejo/:id/animals/:animalId/complete (ManejoPassData). */
export const ManejoPassBody = t.Object({
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  /** Bull whose dose an inseminação pass uses; the session's first touro when absent. */
  semenBullId: t.Optional(t.String({ minLength: 1 })),
  notes: t.Optional(t.String()),
  /** Rendimento (%) of this boiada, set at the brete of a venda per arroba. */
  carcassYieldPct: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100 })),
});

/**
 * Body of POST /manejo/:id/animals/:animalId/set-aside — a venda's animal sent
 * to the refugo (stays on the farm) or to the dúvida (decided before closing).
 */
export const SetAsideBody = t.Object({
  list: t.Union([t.Literal("rejected"), t.Literal("held")]),
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
});
```

`CompleteAnimal`: in the entry update `.set({...})` add `carcassYieldPct: effects.carcassYieldPct ?? null,`.

`SetAsideAnimal.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals, weighings } from "@/lib/db/schema";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { conflict, lockEntry, type ManejoConflict } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ManejoSessionAnimal, Weighing } from "@/lib/types";

/** Refugo (stays on the farm) or dúvida (decided before the venda closes). */
export type SetAsideList = "rejected" | "held";

export interface SetAsideResult {
  entry: ManejoSessionAnimal;
  /** The scale reading the pass kept, when the venda weighs. */
  weighing?: Weighing;
}

interface SetAsideAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  input: { list: SetAsideList; weightKg?: number; notes?: string };
}

type SetAsideAnimalUseCaseResponse = SetAsideResult | { conflict: ManejoConflict } | null;

type CurrUseCase = _UseCase<SetAsideAnimalUseCaseProps, SetAsideAnimalUseCaseResponse>;

/**
 * Sets a venda's animal apart at the brete: it passed the scale but is not
 * sold. The weight read is kept as a pesagem; the animal stays in the herd.
 */
export class SetAsideAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetAsideAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, input }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (session.kind !== "sale" || entry.outcome !== "pending") {
        return conflict("entry_not_actionable");
      }
      if (!animal.active) return conflict("animal_inactive");

      let weighing: Weighing | undefined;
      let weighingId: number | null = null;
      if (session.weighing && input.weightKg !== undefined) {
        weighing = { date: session.date, weightKg: input.weightKg };
        const [row] = await tx
          .insert(weighings)
          .values({ animalId, ...weighing })
          .returning();
        weighingId = row.id;
      }

      const notes = input.notes?.trim();
      const [updated] = await tx
        .update(manejoSessionAnimals)
        .set({
          outcome: input.list,
          weightKg: weighing?.weightKg ?? null,
          weighingId,
          notes: notes ? notes : null,
        })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animalId)
          )
        )
        .returning();
      return { entry: toManejoSessionAnimal(updated, animal.earTag), weighing };
    });
  };
}
```

`ReopenAnimal`: replace the patch condition and set:

```ts
      // Put the animal back where the pass found it: in its old lot after a
      // transferência, and back in the active herd after a boiada. A refugo
      // or a dúvida never left it.
      let patch: AnimalPatch | undefined;
      if (entry.previousLotId !== null || soldHere) {
        const [row] = await tx
          .update(animals)
          .set({
            ...(entry.previousLotId !== null ? { lotId: entry.previousLotId } : {}),
            ...(soldHere ? { active: true, inactiveReason: null, inactiveDate: null } : {}),
          })
```

and add `carcassYieldPct: null,` to the reset `.set({...})`.

`SetCarcassYield`: select `carcassYieldPct: manejoSessionAnimals.carcassYieldPct` in the entries query and `if (entry.weightKg === null || entry.carcassYieldPct !== null) continue;`. Update the class doc: "…repricing the passes that follow the padrão; a boiada priced at its own rendimento at the brete keeps it."

`EditWeighing`: select also `outcome: manejoSessionAnimals.outcome, entryYieldPct: manejoSessionAnimals.carcassYieldPct`; then

```ts
      const priced = entry.kind === "sale" && entry.pricePerArroba !== null && entry.outcome === "done";
      …
              amountBrl: saleAmount(
                input.weightKg,
                entry.pricePerArroba as number,
                entry.entryYieldPct ?? entry.carcassYieldPct ?? undefined
              ),
```

`_shared/session.ts` `ManejoConflict` add:

```ts
  /** A venda still has a dúvida to decide: it cannot close yet. */
  | "held_pending";
```

`Close.useCase.ts`:

```ts
type CloseSessionUseCaseResponse = boolean | { conflict: ManejoConflict };
…
  public run: CurrUseCase["run"] = async ({ farmId, sessionId }) => {
    // A venda closes with every dúvida decided: boiada or refugo.
    const [held] = await this.repository
      .select({ animalId: manejoSessionAnimals.animalId })
      .from(manejoSessionAnimals)
      .innerJoin(manejoSessions, eq(manejoSessions.id, manejoSessionAnimals.sessionId))
      .where(
        and(
          eq(manejoSessionAnimals.sessionId, sessionId),
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessionAnimals.outcome, "held")
        )
      )
      .limit(1);
    if (held) return conflict("held_pending");
    const rows = await this.repository.update(manejoSessions)…  // unchanged
```

(imports: `manejoSessionAnimals`, `conflict`, `type ManejoConflict` from `../_shared/session`; the Close test stub needs `innerJoin` returning the builder.)

Controller: import `SetAsideAnimalUseCase` and `SetAsideBody`; in `complete` pass
`data: can(permissions, "finance", "edit") ? body : { ...body, carcassYieldPct: undefined },` (comment: "The rendimento reprices money: only Financeiro edit may set it."); add after `skip`:

```ts
  .post(
    "/:id/animals/:animalId/set-aside",
    async ({ farmId, params, body, status }) => {
      const result = await new SetAsideAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
        input: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: SetAsideBody }
  )
```

and in `close`: `if (typeof closed === "object") return status(409, { error: closed.conflict });` before the 404 check.

`routeRequirements.ts` after the `skip` line: `"POST /api/herd/manejo/:id/animals/:animalId/set-aside": edit("manejo"),`.

- [ ] **Step 4:** `pnpm vitest run lib/api` → PASS; `pnpm tsc --noEmit` → only store/UI errors left.

---

### Task 4: Store actions

**Files:**
- Modify: `lib/store/useHerdStore.ts` (interface near :268-294, implementations near :776-1041)

**Interfaces:**
- Consumes: Task 3 routes.
- Produces: `setAsideManejoAnimal(sessionId: string, earTag: string, input: { list: "rejected" | "held"; weightKg?: number; notes?: string }) => Promise<boolean>`; `closeManejoSession` unchanged signature, but a 409 `held_pending` toasts "Decida as dúvidas antes de encerrar a venda." and leaves the session open.

- [ ] **Step 1: Implement** (store has no unit tests; covered by smoke):

Interface, after `skipManejoAnimal`:

```ts
  /**
   * A venda's animal set apart at the brete: refugo (stays on the farm) or
   * dúvida (decided before closing). The weight read becomes a pesagem. False
   * when refused (409) — the animal had a baixa meanwhile, or a stale screen.
   */
  setAsideManejoAnimal: (
    sessionId: string,
    earTag: string,
    input: { list: "rejected" | "held"; weightKg?: number; notes?: string }
  ) => Promise<boolean>;
```

Implementation, after `skipManejoAnimal`:

```ts
  setAsideManejoAnimal: async (sessionId, earTag, input) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .manejo({ id: sessionId })
      .animals({ animalId })["set-aside"]
      .post(input);
    if (error) {
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string };
        if (detail.error === "animal_inactive") {
          toast.error(inactiveAnimalMessage(earTag));
          await reloadHerd(set);
        }
        return false;
      }
      apiFail("apartar o animal", error);
    }
    const result = data as { entry: ManejoSessionAnimal; weighing?: Weighing };
    set((s) => {
      const weighing = result.weighing;
      const animals = weighing
        ? s.animals.map((a) =>
            a.earTag === earTag
              ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
              : a
          )
        : s.animals;
      return {
        animals,
        manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
      };
    });
    return true;
  },
```

`closeManejoSession`:

```ts
  closeManejoSession: async (sessionId) => {
    const { error } = await api.manejo({ id: sessionId }).close.post();
    if (error) {
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string };
        if (detail.error === "held_pending") {
          toast.error("Decida as dúvidas antes de encerrar a venda.");
          return;
        }
      }
      apiFail("encerrar o manejo", error);
    }
    …unchanged set
  },
```

`setSaleCarcassYield` already merges only the returned amounts — no change.

- [ ] **Step 2:** `pnpm tsc --noEmit` → only UI errors (if any) left.

---

### Task 5: Brete UI (direction A)

**Files:**
- Modify: `components/manejo/progress-bar.tsx`
- Create: `components/manejo/sale-chute.tsx` (brete card of a venda)
- Create: `components/manejo/sale-lists.tsx` (Boiada / Dúvida / Refugo cards)
- Modify: `components/manejo/sale-summary.tsx`
- Modify: `components/manejo/session-runner.tsx`

**Interfaces:**
- Consumes: `setAsideManejoAnimal`, `completeManejoAnimal(…, { weightKg, notes, carcassYieldPct })`, `skipManejoAnimal`, `reopenManejoAnimal`, `ManejoProgress.rejected/held`, `saleSummary().yieldVaries/rejectedHeads/heldHeads`, `passYieldPct`.
- Produces: `SaleChuteCard`, `SaleLists` components (below).

- [ ] **Step 1: Progress bar.** In `ManejoProgressBar` add a `sale?: boolean` prop. When `sale`, draw segments in order done `bg-brand`, held `bg-attention`, rejected `bg-fmd`, skipped `bg-ink-soft/40`, and the line:

```tsx
<p className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-soft">
  <span>
    <span className="font-mono font-medium text-ink">{handled}/{progress.total}</span> apartados
  </span>
  <Key className="bg-brand">{progress.done} boiada</Key>
  {progress.held > 0 ? <Key className="bg-attention">{progress.held} dúvida</Key> : null}
  {progress.rejected > 0 ? <Key className="bg-fmd">{progress.rejected} refugo</Key> : null}
  {progress.skipped > 0 ? <span>{progress.skipped} pulados</span> : null}
  <span>{progress.pending > 0 ? `${progress.pending} pendentes` : "concluído"}</span>
</p>
```

with `handled = progress.total - progress.pending` and a local `Key` (`inline-flex items-center gap-1.5` + an 8px `rounded-full` dot of the given class). Non-sale output stays identical; `aria-valuenow` becomes `handled` for both.

- [ ] **Step 2: `sale-chute.tsx`.**

```tsx
"use client";

/**
 * The brete of a venda: the animal on the scale goes to the Boiada (sold now,
 * at its own rendimento), to the Dúvida (decided before the venda closes) or
 * to the Refugo (stays on the farm). Enter sends it to the Boiada.
 */
import { useState, type FormEvent } from "react";
import { CircleHelp, House, Truck } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { Animal, ManejoSession, ManejoSessionAnimal } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { carcassArrobas, currentWeight, DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { formatArroba, formatCurrency, formatKg, formatPercent } from "@/lib/domain/format";
import { saleAmount } from "@/lib/domain/movements";
import { breedLabel, ChuteEditAnimal } from "@/components/manejo/chute-animal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

interface SaleChuteCardProps {
  session: ManejoSession;
  entry: ManejoSessionAnimal;
  animal: Animal | undefined;
  /** Weight and note a dúvida carried back to the brete. */
  prefill?: { weightKg?: number; notes?: string };
  /** The rendimento field: a venda per arroba, and Financeiro edit. */
  setsYield: boolean;
  onDone: () => void;
  onSaved: (earTag: string) => void;
}
```

Body (keep it keyed by `entry.earTag` from the runner so state resets per animal):
- state: `weight` (from `prefill?.weightKg?.toString() ?? ""`), `note` (`prefill?.notes ?? ""`), `yieldText` (`String(padrao)` where `padrao = session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT`), `error`, `busy`.
- `perArroba = session.pricePerArroba !== undefined`; `yieldPct` = parsed `yieldText` when `setsYield` and valid (0 < x ≤ 100) else `padrao`; `adjusted = setsYield && yieldPct !== padrao`.
- `passValue` = `perArroba && weight valid ? saleAmount(kg, session.pricePerArroba, yieldPct) : null`.
- `onBoiada(e: FormEvent)`: preventDefault; when `session.weighing` require a valid weight (`"Informe o peso (kg) do animal na balança."`); invalid rendimento → `"Rendimento entre 1 e 100%."`; `await completeManejoAnimal(session.id, entry.earTag, { weightKg, notes, carcassYieldPct: setsYield ? yieldPct : undefined })`; on `true` call `onDone()`.
- `onSetAside(list)`: weight optional (send only when valid); `await setAsideManejoAnimal(session.id, entry.earTag, { list, weightKg, notes })`; on `true` `onDone()`.
- `onSkip()`: `await skipManejoAnimal(session.id, entry.earTag, notes)`; `onDone()`.
- Every action guarded by `busy`.

Markup, matching canvas A (Tailwind tokens `brand`, `attention`, `fmd`, `*-soft`, `hairline`, `ink`, `ink-soft`):

```tsx
<SectionCard title="No brete agora" action={<span className="hidden text-xs text-ink-soft md:inline">Enter = Boiada</span>}>
  <div className="space-y-4">
    {/* brinco line + ChuteEditAnimal, outside the form (same as the runner's comment) */}
    <form onSubmit={onBoiada} className="space-y-4">
      <div className={cn("grid gap-4", setsYield ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2")}>
        {session.weighing ? /* Peso na balança (kg), autoFocus, font-mono text-lg, min-h-11 */ : null}
        {setsYield ? (
          <div className="grid gap-1.5">
            <Label htmlFor="pass-yield">Rendimento (%)</Label>
            <div className="relative">
              <Input id="pass-yield" inputMode="decimal" value={yieldText} onChange={…}
                className={cn("min-h-11 font-mono text-lg", adjusted && "border-attention pr-24")} />
              {adjusted ? <StatusPill tone="attention" className="absolute right-2 top-1/2 -translate-y-1/2">ajustado</StatusPill> : null}
            </div>
            <p className="text-xs text-ink-soft">
              Padrão da venda {formatPercent(padrao)}
              {adjusted ? <> · <button type="button" className="font-medium text-brand hover:underline" onClick={() => setYieldText(String(padrao))}>voltar ao padrão</button></> : null}
            </p>
          </div>
        ) : null}
        <div className={cn("grid gap-1.5", setsYield ? "col-span-2 sm:col-span-1" : !session.weighing && "sm:col-span-2")}>
          {/* Observação (opcional), placeholder "Ex.: acabamento, casco…" */}
        </div>
      </div>
      {perArroba ? /* value line: "{@} de carcaça (rend. {pct}) × {R$}/@ = {R$}" or "Digite o peso para calcular o valor deste animal." */ : null}
      {error ? <p className="text-xs text-overdue">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <button type="submit" disabled={busy} className="col-span-2 flex min-h-16 items-center gap-3 rounded-xl bg-brand px-4 text-left text-white disabled:opacity-60 sm:col-span-1">
          <Truck className="size-5.5 shrink-0" aria-hidden />
          <span className="flex flex-col">
            <span className="text-base font-semibold">Boiada</span>
            <span className="text-xs opacity-90">{passValue !== null ? `Vende agora · ${formatCurrency(passValue)}` : "Vende agora"}</span>
          </span>
        </button>
        <SortButton tone="attention" icon={CircleHelp} label="Dúvida" sub="Aparta, decide depois" onClick={() => onSetAside("held")} disabled={busy} />
        <SortButton tone="fmd" icon={House} label="Refugo" sub="Fica na fazenda" onClick={() => onSetAside("rejected")} disabled={busy} />
      </div>
      <button type="button" onClick={onSkip} disabled={busy} className="min-h-11 text-sm font-medium text-ink-soft hover:text-ink">
        Pular (não passou)
      </button>
    </form>
  </div>
</SectionCard>
```

`SortButton` (same file): `type="button"`, `flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left`, tone classes `attention` → `border-attention/20 bg-attention-soft text-attention`, `fmd` → `border-fmd/20 bg-fmd-soft text-fmd`; label `text-base font-semibold`, sub `text-xs text-ink`.
Check `StatusPill`'s real props in `components/ui/status-pill.tsx` before using it; if it has no `attention` tone, use a `span` with `rounded-md bg-attention-soft px-2 py-0.5 text-[11px] font-medium text-attention`.

- [ ] **Step 3: `sale-lists.tsx`.**

```tsx
interface SaleListsProps {
  session: ManejoSession;
  /** Chute actions allowed (open session, Manejo edit). */
  operable: boolean;
  onUndo: (earTag: string) => void;
  /** Dúvida → back to the brete with its weight and note. */
  onDecide: (entry: ManejoSessionAnimal) => void;
  /** The animal had a baixa: its row reads "Baixa" instead of the undo. */
  leftHerd: (entry: ManejoSessionAnimal) => boolean;
}
```

Renders `grid items-start gap-4 lg:grid-cols-3` with three `ListCard`s, then a "Pulados (n)" `SectionCard` with plain rows (brinco, note, desfazer) when any `skipped`.
- `ListCard({ tone, icon, title, count, sub, defaultOpen, children })`: `section` with `rounded-[10px] border border-hairline bg-panel overflow-hidden`, a 4px top bar in the tone (`bg-brand` / `bg-attention` / `bg-fmd`); header is a `button` (`aria-expanded`) that toggles `open` below `lg` (`lg:pointer-events-none`, chevron `lg:hidden`); body `cn(open ? "block" : "hidden", "lg:block")`. Count badge `rounded-full px-1.5 font-mono text-xs` in the tone's soft bg.
- Boiada: `sub` = `{formatKg(totalKg)} · {formatCurrency(totalBrl)}` (R$ only when any `amountBrl` defined). Rows: brinco (`font-mono text-sm font-medium`), kg, rendimento `formatPercent(passYieldPct(session, e))` (`text-attention font-medium` when `e.carcassYieldPct !== undefined`, shown only when `session.pricePerArroba !== undefined`), R$ right-aligned when defined, undo icon button (`aria-label="Desfazer {brinco}"`, `Undo2`) when `operable && !leftHerd(e)`, else "Baixa" when `operable`. Show the first 5 (newest first: reverse session order) and a "ver todos (n)" / "mostrar menos" toggle.
- Dúvida: `defaultOpen`; sub "Decidir leva o animal de volta ao brete, com o peso já lido."; rows: brinco, kg + note stacked, a "Decidir →" button (`min-h-9 rounded-[10px] border border-attention/30 bg-attention-soft px-2.5 text-sm font-medium text-attention`) when `operable`.
- Refugo: sub "Continuam no rebanho; o peso fica registrado."; rows: brinco, kg, note (truncate), undo.
- Empty list body: `<p className="py-1 text-xs text-ink-soft">Nenhum animal.</p>`.

- [ ] **Step 4: `sale-summary.tsx`.** Header action: `Padrão {formatPercent(session.carcassYieldPct ?? 50)}` + the existing Alterar button (only when `summary.carcassYieldPct !== null`). Lead line: "Só a boiada entra na venda: " prefix when `summary.rejectedHeads + summary.heldHeads > 0`. Per-head column: first row `SummaryRow label={summary.yieldVaries ? "Rendimento médio" : "Rendimento"} value={formatPercent(summary.carcassYieldPct)}` when not null.

- [ ] **Step 5: Runner wiring** (`session-runner.tsx`), venda only; every other kind unchanged:
- Pass `sale={isSale}` to `ManejoProgressBar`.
- State `const [prefill, setPrefill] = useState<{ weightKg?: number; notes?: string } | undefined>();` cleared in `resetPassForm`.
- `async function onDecide(entry: ManejoSessionAnimal) { const carried = { weightKg: entry.weightKg, notes: entry.notes }; await reopenManejoAnimal(session.id, entry.earTag); setPrefill(carried); setSelectedTag(entry.earTag); }` (guard `session` non-null like the other handlers).
- Replace the generic brete condition with `!isSale && …` and add, for `operable && isSale && !needsYield && current`:

```tsx
<div className="grid items-start gap-4 lg:grid-cols-3">
  <div className="lg:col-span-2">
    <SaleChuteCard
      key={current.earTag}
      session={session}
      entry={current}
      animal={currentAnimal}
      prefill={prefill}
      setsYield={setsYield && perArroba}
      onDone={resetPassForm}
      onSaved={setSelectedTag}
    />
  </div>
  {pendingCard}
</div>
```

where `pendingCard` is the existing "Pendentes" `SectionCard` JSX hoisted into a `const pendingCard = (…)` so both layouts render the same element (non-sale keeps it inside its old grid).
- For a venda, replace the "Manejados/Pulados" grid with `{pendingCard}` only when the brete is not showing, then `<SaleLists session={session} operable={operable} onUndo={(t) => reopenManejoAnimal(session.id, t)} onDecide={onDecide} leftHerd={leftHerd} />` above `SaleSummaryCard`.
- `leftHerd` for a venda: `byTag.get(entry.earTag)?.active === false && !(isSale && entry.outcome === "done")` (unchanged; refugo/dúvida animals are active).
- Encerrar: for a venda with `progress.held > 0` render the button `disabled` and before it `<p className="flex items-center gap-1.5 text-sm text-attention"><CircleHelp className="size-4" aria-hidden />Decida as {progress.held} {progress.held === 1 ? "dúvida" : "dúvidas"} para encerrar a venda.</p>`; wrap both in `flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end`.
- The all-done empty state ("Todos os animais manejados") for a venda reads description "Decida as dúvidas, se houver, e encerre a venda."

- [ ] **Step 6:** `pnpm tsc --noEmit && pnpm lint && pnpm vitest run` → all PASS.

---

### Task 6: Verification

- [ ] **Step 1:** Full gates: `pnpm tsc --noEmit`, `pnpm lint`, `TZ=America/Sao_Paulo pnpm vitest run`.
- [ ] **Step 2: Smoke in the app** (dev server from the worktree on a free port; login and seed per memory `meubov-smoke-test-setup`): start a venda per arroba (R$ 320/@, rendimento 52%) with 5 animals. At the brete: AZ-1 Boiada at 546 kg keeping 52%; AZ-2 Boiada at 540 kg with 54% (field shows "ajustado"; value line uses 54%); AZ-3 Refugo at 402 kg; AZ-4 Dúvida at 468 kg; AZ-5 Pular. Check: columns and counts; progress line; AZ-3 has a pesagem of 402 kg in its ficha and is active. Try Encerrar → disabled with the dúvida message. Decidir AZ-4 → it is in the brete with 468 filled; send to Boiada. Alterar padrão to 50% → AZ-1 repriced, AZ-2 unchanged. Encerrar → closed; sale detail page labels AZ-3 "refugo", romaneio lists 3 boiada with their own arrobas. Screenshot desktop 1440 and phone 390.
- [ ] **Step 3:** Review agent over the whole diff (`git diff main`) against the spec and the Review Focus list.
