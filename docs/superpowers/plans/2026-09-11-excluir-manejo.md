# Excluir manejo (soft delete com reversão) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the farmer discard a manejo still running at the chute and delete one already closed, undoing what it did to the herd and leaving both the session and its effects in the database with a `deleted_at` stamp.

**Architecture:** A new pure module decides what one delete reverts and what blocks it, from per-animal facts the service gathers with SQL. `deleteSession` in the manejo service applies that decision in a single transaction, the way `reopenAnimal` already reverts one pass. `DELETE /manejo/:id` carries it, the store merges the result into the snapshot, and one dialog serves both the chute screen and the history row.

**Tech Stack:** Next.js 16 app router, React 19, Zustand store, Elysia API (`lib/api/app.ts`), Drizzle ORM on PostgreSQL, vitest with a chainable db stub, Tailwind 4 tokens, shadcn `Dialog`/`Button`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-11-excluir-manejo-design.md`

## Global Constraints

- pt-BR copy, verbatim from the spec. Tokens only (`text-ink`, `text-ink-soft`, `bg-panel`, `bg-surface`, `border-hairline`, `text-brand`, `text-overdue`); never loose hex.
- 44px touch targets on mobile: `min-h-11`, desktop may drop to `md:min-h-9`.
- Read `node_modules/next/dist/docs/` before writing any Next-specific code. This version differs from training data.
- Business rules are pure functions in `lib/domain`; persistence stays in `lib/api/services`. Never put a rule in a component.
- A refusal writes nothing. Every guard check happens before the first write, inside the same transaction.
- Nothing is erased except an entrada's own animals: sessions, treatments and weighings take `deleted_at`.
- **No commits from implementation agents.** One commit at the end by the orchestrator. Tasks end at "tests pass" / "lint and typecheck pass".
- Commands: `pnpm exec vitest run <file>`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/db/schema.ts` | `deletedAt` on `manejoSessions` and `weighings` |
| `drizzle/0013_manejo-soft-delete.sql` | the two `ALTER TABLE`s (generated) |
| `lib/api/services/herd.ts` | filter deleted sessions, session animals and weighings out of the load |
| `lib/api/services/animals.ts` | filter deleted weighings out of the per-animal payload |
| `lib/domain/manejoRevert.ts` (+ test) | `revertDecision`: what a delete reverts, what blocks it |
| `lib/api/services/manejo.ts` | `deleteSession`, and `reopenAnimal` stamping instead of deleting a weighing |
| `lib/api/services/animals.ts` | `deleteWeighings` for a history row with no session |
| `lib/api/app.ts` | `DELETE /manejo/:id`, `DELETE /weighings` |
| `lib/api/models.ts` | `DeleteWeighingsBody` |
| `lib/store/useHerdStore.ts` | `deleteManejoSession`, `deleteWeighingGroup` |
| `components/manejo/delete-manejo-dialog.tsx` | the confirmation and the blocked list |
| `components/manejo/session-runner.tsx` | "Descartar manejo" in the chute header |
| `components/manejo/manejo-history.tsx` | the row's ••• menu with "Excluir manejo" |

---

### Task 1: Schema, migration and read filters

**Files:**
- Modify: `lib/db/schema.ts` (manejoSessions block at :452, weighings block at :328)
- Create: `drizzle/0013_manejo-soft-delete.sql` (generated, do not hand-write)
- Modify: `lib/api/services/herd.ts:96`, `:110`, `:143`
- Modify: `lib/api/services/animals.ts:613-619`

**Interfaces:**
- Consumes: nothing.
- Produces: `manejoSessions.deletedAt` and `weighings.deletedAt` columns, both `timestamp` nullable; every read path already filtered, so later tasks only have to write the stamp.

- [ ] **Step 1: Add the columns to the schema**

In `lib/db/schema.ts`, inside `weighings`, after the existing columns:

```ts
    /** Soft delete: the reading stays for audit, the herd stops seeing it. */
    deletedAt: timestamp("deleted_at"),
```

And inside `manejoSessions`, after `planNotes`:

```ts
    /** Soft delete: the manejo leaves the history, the row stays for audit. */
    deletedAt: timestamp("deleted_at"),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm exec drizzle-kit generate --name manejo-soft-delete --config drizzle.config.ts`

Expected: a new `drizzle/0013_manejo-soft-delete.sql` plus an updated `drizzle/meta/_journal.json` with `"idx": 13`.

- [ ] **Step 3: Read the generated SQL and confirm it is exactly two ALTERs**

Run: `cat drizzle/0013_manejo-soft-delete.sql`
Expected:

```sql
ALTER TABLE "manejo_sessions" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "weighings" ADD COLUMN "deleted_at" timestamp;
```

If it contains anything else (a dropped column, a renamed table), stop and report — the schema drifted and the generated file must not be edited by hand.

- [ ] **Step 4: Apply it locally**

Run: `pnpm db:up && pnpm migration:run`
Expected: `✅ Migrations applied to Local environment`

- [ ] **Step 5: Filter the deleted rows out of the herd load**

In `lib/api/services/herd.ts`, the sessions query at :96:

```ts
      .from(manejoSessions)
      .where(and(eq(manejoSessions.farmId, farmId), isNull(manejoSessions.deletedAt)))
```

The weighings query at :110:

```ts
      .innerJoin(animals, eq(weighings.animalId, animals.id))
      .where(and(eq(animals.farmId, farmId), isNull(weighings.deletedAt)))
```

The session-animals query at :143:

```ts
      .where(and(eq(manejoSessions.farmId, farmId), isNull(manejoSessions.deletedAt)))
```

`and` and `isNull` are already imported in this file (the treatments query at :119 uses both).

- [ ] **Step 6: Filter the per-animal weighings payload**

In `lib/api/services/animals.ts`, the `animalWeighings` helper at :613:

```ts
    .from(weighings)
    .where(and(eq(weighings.animalId, animalId), isNull(weighings.deletedAt)))
    .orderBy(asc(weighings.date), asc(weighings.id));
```

Check the imports at the top of the file and add `isNull` from `drizzle-orm` if it is not there.

- [ ] **Step 7: Verify nothing regressed**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: all suites pass, tsc silent, eslint silent. No test changes in this task — the columns are nullable, so every existing row reads as not deleted.

---

### Task 2: `lib/domain/manejoRevert.ts` — the decision

**Files:**
- Create: `lib/domain/manejoRevert.ts`
- Test: `lib/domain/__tests__/manejoRevert.test.ts`

**Interfaces:**
- Consumes: `ManejoKind`, `ManejoSessionAnimal` from `@/lib/types`.
- Produces:

```ts
export type RevertBlockReason = "moved_lot" | "not_sold" | "has_history" | "origin_lot_gone";
export interface BlockedAnimal { earTag: string; reason: RevertBlockReason }
export interface AnimalFacts {
  earTag: string;
  lotId: string | null;
  active: boolean;
  hasForeignHistory: boolean;
  originLotMissing: boolean;
}
export interface RevertPlan {
  treatmentIds: string[];
  weighingIds: number[];
  restore: { earTag: string; lotId?: string; reactivate: boolean }[];
  removeEarTags: string[];
}
export interface RevertSession {
  kind: ManejoKind;
  destinationLotId?: string;
  animals: ManejoSessionAnimal[];
}
export function revertDecision(
  session: RevertSession,
  facts: AnimalFacts[]
): { plan: RevertPlan; blocked: BlockedAnimal[] };
```

The service gathers `AnimalFacts` with SQL (Task 3); this module holds the rules alone, so every guard is unit-testable without a database. `RevertSession` is deliberately narrower than `ManejoSession` — a full session satisfies it structurally, and the service can hand it three fields built straight from its own query instead of rebuilding a session through the mappers.

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/__tests__/manejoRevert.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { revertDecision, type AnimalFacts } from "@/lib/domain/manejoRevert";
import type { ManejoSession, ManejoSessionAnimal } from "@/lib/types";

function pass(overrides: Partial<ManejoSessionAnimal> = {}): ManejoSessionAnimal {
  return { earTag: "B-001", outcome: "done", ...overrides };
}

function session(overrides: Partial<ManejoSession> = {}): ManejoSession {
  return {
    id: "s-1",
    name: "Manejo",
    date: "2026-05-12",
    status: "closed",
    kind: "health",
    weighing: false,
    animals: [pass()],
    ...overrides,
  };
}

function facts(overrides: Partial<AnimalFacts> = {}): AnimalFacts {
  return {
    earTag: "B-001",
    lotId: "lot-3",
    active: true,
    hasForeignHistory: false,
    originLotMissing: false,
    ...overrides,
  };
}

describe("revertDecision", () => {
  it("stamps the treatments and the booster of a sanitária", () => {
    const result = revertDecision(
      session({ animals: [pass({ treatmentId: "t-1", boosterId: "t-2" })] }),
      [facts()]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.treatmentIds).toEqual(["t-1", "t-2"]);
    expect(result.plan.restore).toEqual([]);
  });

  it("never blocks a sanitária, whatever happened since", () => {
    const result = revertDecision(
      session({ animals: [pass({ treatmentId: "t-1" })] }),
      [facts({ lotId: "lot-9", active: false, hasForeignHistory: true })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.treatmentIds).toEqual(["t-1"]);
  });

  it("puts a transferência back in the lote it came from", () => {
    const result = revertDecision(
      session({
        kind: "transfer",
        destinationLotId: "lot-4",
        animals: [pass({ previousLotId: "lot-3" })],
      }),
      [facts({ lotId: "lot-4" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.restore).toEqual([{ earTag: "B-001", lotId: "lot-3", reactivate: false }]);
  });

  it("blocks a transferência when the animal is no longer in the destination lote", () => {
    const result = revertDecision(
      session({
        kind: "transfer",
        destinationLotId: "lot-4",
        animals: [pass({ previousLotId: "lot-3" })],
      }),
      [facts({ lotId: "lot-7" })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "moved_lot" }]);
    expect(result.plan.restore).toEqual([]);
  });

  it("brings a venda back to the active herd, in its old lote", () => {
    const result = revertDecision(
      session({ kind: "sale", animals: [pass({ previousLotId: "lot-3" })] }),
      [facts({ active: false, lotId: "lot-3" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.restore).toEqual([{ earTag: "B-001", lotId: "lot-3", reactivate: true }]);
  });

  it("blocks a venda when the animal is active again", () => {
    const result = revertDecision(
      session({ kind: "sale", animals: [pass({ previousLotId: "lot-3" })] }),
      [facts({ active: true })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "not_sold" }]);
  });

  it("removes the animals an entrada registered", () => {
    const result = revertDecision(
      session({ kind: "entry", animals: [pass({ createdAnimal: true })] }),
      [facts()]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.removeEarTags).toEqual(["B-001"]);
  });

  it("blocks an entrada whose animal carries history from elsewhere", () => {
    const result = revertDecision(
      session({ kind: "entry", animals: [pass({ createdAnimal: true })] }),
      [facts({ hasForeignHistory: true })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "has_history" }]);
    expect(result.plan.removeEarTags).toEqual([]);
  });

  it("blocks any kind when the lote of origin was deleted", () => {
    const result = revertDecision(
      session({ kind: "transfer", destinationLotId: "lot-4", animals: [pass({ previousLotId: "lot-3" })] }),
      [facts({ lotId: "lot-4", originLotMissing: true })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "origin_lot_gone" }]);
  });

  it("stamps the weighings of a pesagem and ignores the animals that were skipped", () => {
    const result = revertDecision(
      session({
        kind: "weighing",
        weighing: true,
        animals: [
          pass({ earTag: "B-001", weighingId: 11 }),
          pass({ earTag: "B-002", outcome: "skipped" }),
          pass({ earTag: "B-003", outcome: "pending" }),
        ],
      }),
      [facts({ earTag: "B-001" }), facts({ earTag: "B-002" }), facts({ earTag: "B-003" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.weighingIds).toEqual([11]);
  });
});
```

Note: `weighingId` is not on `ManejoSessionAnimal` in `lib/types.ts` today — the column exists in `lib/db/schema.ts:526` but the domain type stops at `treatmentId`/`boosterId`. Add it in Step 3 before the test can typecheck.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/domain/__tests__/manejoRevert.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain/manejoRevert"`.

- [ ] **Step 3: Add `weighingId` to the domain type**

In `lib/types.ts`, inside `ManejoSessionAnimal`, after `boosterId`:

```ts
  /** Id of the weighing this pass wrote (for undo and for a session delete). */
  weighingId?: number;
```

Then map it in `lib/api/services/mappers.ts`, in `toManejoSessionAnimal`, beside the other effect refs:

```ts
    weighingId: orNothing(row.weighingId),
```

- [ ] **Step 4: Write the module**

Create `lib/domain/manejoRevert.ts`:

```ts
/**
 * What deleting one manejo undoes, and what stops it.
 *
 * A manejo moved the herd, so deleting it has to put the herd back. The rules
 * read the CURRENT state of each animal, never dates: an animal that has moved
 * lote since, or that is active again, is standing on ground this manejo no
 * longer owns, and reverting it would overwrite whatever happened after. The
 * facts come from the service (SQL); the decision lives here, pure.
 */
import type { ManejoKind, ManejoSessionAnimal } from "@/lib/types";

/**
 * What the decision needs of a session: its kind, where a transferência landed
 * the animals, and the passes themselves. A full ManejoSession satisfies it, and
 * so does the row the delete service already has in hand.
 */
export interface RevertSession {
  kind: ManejoKind;
  destinationLotId?: string;
  animals: ManejoSessionAnimal[];
}

/** Why one animal refuses to be reverted. */
export type RevertBlockReason =
  /** Transferência: the animal is no longer in the lote this manejo put it in. */
  | "moved_lot"
  /** Venda: the animal is active again, or left the herd for another reason. */
  | "not_sold"
  /** Entrada: the animal carries effects this manejo did not create. */
  | "has_history"
  /** The lote the pass found it in was deleted, so there is nowhere to put it back. */
  | "origin_lot_gone";

export interface BlockedAnimal {
  earTag: string;
  reason: RevertBlockReason;
}

/** Current state of one animal of the session, gathered by the service. */
export interface AnimalFacts {
  earTag: string;
  lotId: string | null;
  active: boolean;
  /** An effect exists on this animal that this session did not create. */
  hasForeignHistory: boolean;
  /** `previousLotId` points at a lote that is deleted or gone. */
  originLotMissing: boolean;
}

/** Everything the delete has to write to put the herd back. */
export interface RevertPlan {
  /** Treatments and boosters to stamp with deleted_at. */
  treatmentIds: string[];
  /** Weighings to stamp with deleted_at. */
  weighingIds: number[];
  /** Animals to put back: into a lote, into the active herd, or both. */
  restore: { earTag: string; lotId?: string; reactivate: boolean }[];
  /** Animals an entrada created: removed outright, they have no history of their own. */
  removeEarTags: string[];
}

const EMPTY_PLAN = (): RevertPlan => ({
  treatmentIds: [],
  weighingIds: [],
  restore: [],
  removeEarTags: [],
});

/** Only a pass that actually happened produced anything to undo. */
function handled(entry: ManejoSessionAnimal): boolean {
  return entry.outcome === "done";
}

/**
 * Reason this animal cannot be reverted, or null when it can. A sanitária and a
 * pesagem only ever removed a record, so nothing downstream can be standing on
 * them and they are never refused.
 */
function blockReason(
  session: RevertSession,
  entry: ManejoSessionAnimal,
  facts: AnimalFacts
): RevertBlockReason | null {
  if (entry.previousLotId !== undefined && facts.originLotMissing) return "origin_lot_gone";
  if (session.kind === "transfer") {
    return facts.lotId === session.destinationLotId ? null : "moved_lot";
  }
  if (session.kind === "sale") {
    return facts.active ? "not_sold" : null;
  }
  if (session.kind === "entry") {
    return facts.hasForeignHistory ? "has_history" : null;
  }
  return null;
}

/**
 * Decides what one session's delete reverts. A refusal is total: when any
 * animal is blocked the plan comes back empty, because half a reverted venda is
 * worse than none.
 */
export function revertDecision(
  session: RevertSession,
  facts: AnimalFacts[]
): { plan: RevertPlan; blocked: BlockedAnimal[] } {
  const byEarTag = new Map(facts.map((f) => [f.earTag, f]));
  const blocked: BlockedAnimal[] = [];
  const plan = EMPTY_PLAN();

  for (const entry of session.animals) {
    if (!handled(entry)) continue;
    const animal = byEarTag.get(entry.earTag);
    if (!animal) continue;

    const reason = blockReason(session, entry, animal);
    if (reason !== null) {
      blocked.push({ earTag: entry.earTag, reason });
      continue;
    }

    if (entry.treatmentId !== undefined) plan.treatmentIds.push(entry.treatmentId);
    if (entry.boosterId !== undefined) plan.treatmentIds.push(entry.boosterId);
    if (entry.weighingId !== undefined) plan.weighingIds.push(entry.weighingId);

    if (entry.createdAnimal) {
      plan.removeEarTags.push(entry.earTag);
      continue;
    }
    const reactivate = session.kind === "sale";
    if (entry.previousLotId !== undefined || reactivate) {
      plan.restore.push({
        earTag: entry.earTag,
        ...(entry.previousLotId !== undefined ? { lotId: entry.previousLotId } : {}),
        reactivate,
      });
    }
  }

  return blocked.length > 0 ? { plan: EMPTY_PLAN(), blocked } : { plan, blocked };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/domain/__tests__/manejoRevert.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Verify the whole suite and the types**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: all green. `weighingId` is optional, so no existing construction of `ManejoSessionAnimal` breaks.

---

### Task 3: `deleteSession` in the manejo service

**Files:**
- Modify: `lib/api/services/manejo.ts` (add `deleteSession`; change the weighing removal inside `reopenAnimal` at :462-470)
- Test: `lib/api/services/__tests__/deleteManejoSession.test.ts`

**Interfaces:**
- Consumes: `revertDecision`, `AnimalFacts`, `BlockedAnimal`, `RevertPlan` from Task 2.
- Produces:

```ts
export interface DeletedManejo {
  id: string;
  /** Ids stamped, so the client can drop them from its snapshot. */
  treatmentIds: string[];
  /** Ear tags whose weighings of that session must leave the snapshot. */
  weighedEarTags: string[];
  /** Animals put back: the patch the client merges. */
  restored: { earTag: string; lotId: string | null; active: boolean }[];
  /** Ear tags removed outright (entrada). */
  removedEarTags: string[];
}
export async function deleteSession(
  farmId: number,
  id: string
): Promise<DeletedManejo | { blocked: BlockedAnimal[] } | "session_not_found">;
```

- [ ] **Step 1: Write the failing tests**

Create `lib/api/services/__tests__/deleteManejoSession.test.ts`. The db stub is the one `deleteTreatments.test.ts` established — selects answer from a queued list, updates record the columns set:

```ts
/**
 * deleteSession: soft-deletes a manejo and puts the herd back where it was,
 * or refuses in one piece when a later manejo depends on it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    updates: [] as Record<string, unknown>[],
    deletes: [] as string[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
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
          update: () => {
            const builder = {
              set(columns: Record<string, unknown>) {
                state.updates.push(columns);
                return builder;
              },
              where: () => builder,
              returning: () => Promise.resolve([]),
              then: (resolve: (value: unknown) => unknown) => resolve(undefined),
            };
            return builder;
          },
          delete: () => {
            const builder = {
              where: () => {
                state.deletes.push("delete");
                return Promise.resolve(undefined);
              },
            };
            return builder;
          },
        })
      ),
  },
}));

import { deleteSession } from "@/lib/api/services/manejo";

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = [];
});

const SALE_ROW = {
  id: "s-1",
  farmId: 7,
  name: "Venda",
  date: "2026-05-12",
  status: "closed",
  kind: "sale",
  weighing: true,
  destinationLotId: null,
  counterparty: "Frigorífico",
  pricePerArroba: 320,
  carcassYieldPct: 52,
  totalAmountBrl: null,
  notes: null,
  planType: null,
  planName: null,
  planWithdrawalDays: null,
  planDose: null,
  planResponsible: null,
  planCostBrl: null,
  planNextDate: null,
  deletedAt: null,
};

describe("deleteSession", () => {
  it("stamps the session and puts the sold animals back", async () => {
    state.selectResults = [
      [SALE_ROW],
      // session animals joined with their animal row
      [
        {
          earTag: "B-001",
          animalId: "a-1",
          outcome: "done",
          previousLotId: "lot-3",
          createdAnimal: false,
          treatmentId: null,
          boosterId: null,
          weighingId: 11,
          lotId: "lot-3",
          active: false,
        },
      ],
      // lotes of origin that still exist
      [{ id: "lot-3" }],
      // foreign-history probe (entrada only) — not consulted for a venda
    ];

    const result = await deleteSession(7, "s-1");

    expect(result).toEqual({
      id: "s-1",
      treatmentIds: [],
      weighedEarTags: ["B-001"],
      restored: [{ earTag: "B-001", lotId: "lot-3", active: true }],
      removedEarTags: [],
    });
    // session stamp + weighing stamp + animal restore
    expect(state.updates.some((u) => u.deletedAt instanceof Date)).toBe(true);
    expect(state.updates.some((u) => u.active === true && u.inactiveReason === null)).toBe(true);
  });

  it("refuses in one piece and writes nothing when an animal moved on", async () => {
    state.selectResults = [
      [{ ...SALE_ROW }],
      [
        {
          earTag: "B-001",
          animalId: "a-1",
          outcome: "done",
          previousLotId: "lot-3",
          createdAnimal: false,
          treatmentId: null,
          boosterId: null,
          weighingId: null,
          lotId: "lot-3",
          active: true, // sold animal is active again
        },
      ],
      [{ id: "lot-3" }],
    ];

    const result = await deleteSession(7, "s-1");

    expect(result).toEqual({ blocked: [{ earTag: "B-001", reason: "not_sold" }] });
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("does not touch a session of another farm", async () => {
    state.selectResults = [[]];

    const result = await deleteSession(7, "s-9");

    expect(result).toBe("session_not_found");
    expect(state.updates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/api/services/__tests__/deleteManejoSession.test.ts`
Expected: FAIL — `deleteSession is not a function`.

- [ ] **Step 3: Implement `deleteSession`**

Append to `lib/api/services/manejo.ts`, after `closeSession`:

```ts
/** What a delete reverted, as the client must merge it into its snapshot. */
export interface DeletedManejo {
  id: string;
  treatmentIds: string[];
  weighedEarTags: string[];
  restored: { earTag: string; lotId: string | null; active: boolean }[];
  removedEarTags: string[];
}

/**
 * Deletes a manejo — descartar while it runs, excluir once closed — undoing
 * what it did to the herd. The session row and the effects it wrote are stamped
 * with deleted_at rather than removed; only an entrada's own animals go, since
 * they were born with the session. A guard that refuses stops the whole delete:
 * the transaction returns the blocked animals before the first write.
 */
export async function deleteSession(
  farmId: number,
  id: string
): Promise<DeletedManejo | { blocked: BlockedAnimal[] } | "session_not_found"> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(manejoSessions)
      .where(
        and(
          eq(manejoSessions.id, id),
          eq(manejoSessions.farmId, farmId),
          isNull(manejoSessions.deletedAt)
        )
      )
      .limit(1);
    if (!row) return "session_not_found";

    const entries = await tx
      .select({
        earTag: animals.earTag,
        animalId: animals.id,
        outcome: manejoSessionAnimals.outcome,
        previousLotId: manejoSessionAnimals.previousLotId,
        createdAnimal: manejoSessionAnimals.createdAnimal,
        treatmentId: manejoSessionAnimals.treatmentId,
        boosterId: manejoSessionAnimals.boosterId,
        weighingId: manejoSessionAnimals.weighingId,
        lotId: animals.lotId,
        active: animals.active,
      })
      .from(manejoSessionAnimals)
      .innerJoin(animals, eq(manejoSessionAnimals.animalId, animals.id))
      .where(eq(manejoSessionAnimals.sessionId, id));

    // A lote of origin that was soft-deleted has nowhere to put the animal back.
    const originIds = [
      ...new Set(entries.map((e) => e.previousLotId).filter((l): l is string => l !== null)),
    ];
    const liveOrigins = new Set(
      originIds.length === 0
        ? []
        : (
            await tx
              .select({ id: lots.id })
              .from(lots)
              .where(and(eq(lots.farmId, farmId), inArray(lots.id, originIds), isNull(lots.deletedAt)))
          ).map((l) => l.id)
    );

    // Only an entrada asks whether the animal carries history from elsewhere:
    // a weighing or a treatment this session did not write, or another pass.
    const foreign = new Set<string>();
    if (row.kind === "entry") {
      const created = entries.filter((e) => e.createdAnimal).map((e) => e.animalId);
      if (created.length > 0) {
        const [otherPasses, otherTreatments, otherWeighings] = await Promise.all([
          tx
            .select({ animalId: manejoSessionAnimals.animalId })
            .from(manejoSessionAnimals)
            .where(
              and(
                inArray(manejoSessionAnimals.animalId, created),
                ne(manejoSessionAnimals.sessionId, id)
              )
            ),
          tx
            .select({ animalId: treatments.animalId })
            .from(treatments)
            .where(and(inArray(treatments.animalId, created), isNull(treatments.deletedAt))),
          tx
            .select({ id: weighings.id, animalId: weighings.animalId })
            .from(weighings)
            .where(and(inArray(weighings.animalId, created), isNull(weighings.deletedAt))),
        ]);
        // A reading this very session took is not foreign history: compare the
        // WEIGHING ids, never the animal ids.
        const ownWeighingIds = new Set(
          entries.map((e) => e.weighingId).filter((w): w is number => w !== null)
        );
        for (const r of otherPasses) foreign.add(r.animalId);
        for (const r of otherTreatments) foreign.add(r.animalId);
        for (const r of otherWeighings) {
          if (!ownWeighingIds.has(r.id)) foreign.add(r.animalId);
        }
      }
    }

    const byEarTag = new Map(entries.map((e) => [e.earTag, e]));
    // RevertSession asks for three fields, so the rows go in as they came out
    // of the query — no mapper, no cast, no session rebuilt to be thrown away.
    const session: RevertSession = {
      kind: row.kind,
      destinationLotId: row.destinationLotId ?? undefined,
      animals: entries.map((e) => ({
        earTag: e.earTag,
        outcome: e.outcome,
        previousLotId: e.previousLotId ?? undefined,
        createdAnimal: e.createdAnimal,
        treatmentId: e.treatmentId ?? undefined,
        boosterId: e.boosterId ?? undefined,
        weighingId: e.weighingId ?? undefined,
      })),
    };

    const facts: AnimalFacts[] = entries.map((e) => ({
      earTag: e.earTag,
      lotId: e.lotId,
      active: e.active,
      hasForeignHistory: foreign.has(e.animalId),
      originLotMissing: e.previousLotId !== null && !liveOrigins.has(e.previousLotId),
    }));

    const { plan, blocked } = revertDecision(session, facts);
    if (blocked.length > 0) return { blocked };

    const stamp = new Date();

    if (plan.treatmentIds.length > 0) {
      await tx
        .update(treatments)
        .set({ deletedAt: stamp })
        .where(inArray(treatments.id, plan.treatmentIds));
    }
    if (plan.weighingIds.length > 0) {
      await tx
        .update(weighings)
        .set({ deletedAt: stamp })
        .where(inArray(weighings.id, plan.weighingIds));
    }
    for (const item of plan.restore) {
      const entry = byEarTag.get(item.earTag);
      if (!entry) continue;
      await tx
        .update(animals)
        .set({
          ...(item.lotId !== undefined ? { lotId: item.lotId } : {}),
          ...(item.reactivate
            ? { active: true, inactiveReason: null, inactiveDate: null }
            : {}),
        })
        .where(eq(animals.id, entry.animalId));
    }
    const removedIds = plan.removeEarTags
      .map((earTag) => byEarTag.get(earTag)?.animalId)
      .filter((animalId): animalId is string => animalId !== undefined);
    if (removedIds.length > 0) {
      await tx.delete(animals).where(inArray(animals.id, removedIds));
    }

    await tx
      .update(manejoSessions)
      .set({ deletedAt: stamp })
      .where(eq(manejoSessions.id, id));

    return {
      id,
      treatmentIds: plan.treatmentIds,
      weighedEarTags: entries
        .filter((e) => e.weighingId !== null && plan.weighingIds.includes(e.weighingId))
        .map((e) => e.earTag),
      restored: plan.restore.map((item) => ({
        earTag: item.earTag,
        lotId: item.lotId ?? null,
        active: item.reactivate,
      })),
      removedEarTags: plan.removeEarTags,
    };
  });
}
```

Add the imports this needs at the top of the file: `lots`, `weighings` from `@/lib/db/schema`; `inArray`, `isNull`, `ne` from `drizzle-orm`; `revertDecision`, plus the `AnimalFacts`, `BlockedAnimal` and `RevertSession` types from `@/lib/domain/manejoRevert`. `treatments`, `animals`, `manejoSessions`, `manejoSessionAnimals`, `and` and `eq` are already imported.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/api/services/__tests__/deleteManejoSession.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Make `reopenAnimal` stamp the weighing instead of deleting it**

In `lib/api/services/manejo.ts`, inside `reopenAnimal`, replace the weighing removal:

```ts
    let removedWeighing: Weighing | undefined;
    if (entry.weighingId !== null) {
      const [removed] = await tx
        .update(weighings)
        .set({ deletedAt: new Date() })
        .where(eq(weighings.id, entry.weighingId))
        .returning();
      if (removed) {
        removedWeighing = { date: removed.date, weightKg: removed.weightKg };
      }
    }
```

The pass still clears `weighingId` on the session-animal row below, so nothing points at the stamped reading. The client already drops the weight from its snapshot by date and value (`lib/store/useHerdStore.ts:559`), so no store change is needed.

- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: all green.

---

### Task 4: Route and store action for the session delete

**Files:**
- Modify: `lib/api/app.ts` (after the `/manejo/:id/close` route at :485-493)
- Modify: `lib/store/useHerdStore.ts` (action type near :192, implementation near :637)

**Interfaces:**
- Consumes: `deleteSession`, `DeletedManejo` from Task 3.
- Produces: `deleteManejoSession(sessionId): Promise<BlockedAnimal[] | null>` on the store — `null` when the manejo was deleted, the blocked list when it was refused.

- [ ] **Step 1: Add the route**

In `lib/api/app.ts`, after the `/manejo/:id/close` handler:

```ts
  .delete(
    "/manejo/:id",
    async ({ farmId, params, status }) => {
      const result = await manejoService.deleteSession(farmId, params.id);
      if (result === "session_not_found") return status(404, { error: result });
      if ("blocked" in result) return status(409, result);
      return result;
    },
    { farm: true }
  );
```

There is no body and no query, so `lib/api/models.ts` needs nothing for this route.

- [ ] **Step 2: Add the store action type**

In `lib/store/useHerdStore.ts`, in the actions interface beside `closeManejoSession`:

```ts
  /**
   * Deletes a manejo and puts the herd back. Returns null when it went
   * through, or the animals that blocked it when the server refused.
   */
  deleteManejoSession: (sessionId: string) => Promise<BlockedAnimal[] | null>;
```

Import the type: `import type { BlockedAnimal } from "@/lib/domain/manejoRevert";`

- [ ] **Step 3: Implement the action**

Beside `closeManejoSession` in the same file:

```ts
  deleteManejoSession: async (sessionId) => {
    const response = await api.manejo({ id: sessionId }).delete();
    if (response.error) {
      if (response.error.status === CONFLICT) {
        return (response.error.value as { blocked: BlockedAnimal[] }).blocked;
      }
      apiFail("excluir o manejo", response.error.status);
    }
    const result = response.data as DeletedManejo;
    const removedTreatments = new Set(result.treatmentIds);
    const weighed = new Set(result.weighedEarTags);
    const restored = new Map(result.restored.map((r) => [r.earTag, r]));
    const removed = new Set(result.removedEarTags);
    const session = get().manejoSessions.find((m) => m.id === sessionId);
    const sessionDate = session?.date;
    set((s) => ({
      manejoSessions: s.manejoSessions.filter((m) => m.id !== sessionId),
      treatments: s.treatments.filter((t) => !removedTreatments.has(t.id)),
      animals: s.animals
        .filter((a) => !removed.has(a.earTag))
        .map((a) => {
          const back = restored.get(a.earTag);
          const dropsWeighing = weighed.has(a.earTag) && sessionDate !== undefined;
          if (!back && !dropsWeighing) return a;
          return {
            ...a,
            ...(back
              ? {
                  ...(back.lotId !== null ? { lotId: back.lotId } : {}),
                  ...(back.active
                    ? {
                        active: true,
                        inactiveReason: undefined,
                        inactiveDate: undefined,
                      }
                    : {}),
                }
              : {}),
            ...(dropsWeighing
              ? { weighings: a.weighings.filter((w) => w.date !== sessionDate) }
              : {}),
          };
        }),
    }));
    return null;
  },
```

`CONFLICT` and `apiFail` are already used in this file by `completeManejoAnimal`. Import `DeletedManejo` as a type from `@/lib/api/services/manejo`.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: all green. The store has no test harness; the typecheck is the gate here, and Task 6 exercises the path in the browser.

---

### Task 5: Deleting a weighing day (the rows with no session)

**Files:**
- Modify: `lib/api/services/animals.ts` (new `deleteWeighings`, next to the other weighing writes around :465)
- Modify: `lib/api/app.ts`, `lib/api/models.ts`
- Modify: `lib/store/useHerdStore.ts`
- Test: `lib/api/services/__tests__/deleteWeighings.test.ts`

**Interfaces:**
- Consumes: `weighings.deletedAt` from Task 1.
- Produces:

```ts
export async function deleteWeighings(
  farmId: number,
  date: string,
  earTags: string[]
): Promise<{ count: number }>;
```
and `deleteWeighingGroup(date, earTags): Promise<number>` on the store.

- [ ] **Step 1: Write the failing test**

Create `lib/api/services/__tests__/deleteWeighings.test.ts` with the same hoisted db stub as Task 3 (copy the `selectBuilder` and the `vi.mock("@/lib/db", …)` block verbatim from that file), then:

```ts
import { deleteWeighings } from "@/lib/api/services/animals";

describe("deleteWeighings", () => {
  it("stamps the readings of that day for the animals given", async () => {
    state.selectResults = [[{ id: 11 }, { id: 12 }]];

    const result = await deleteWeighings(7, "2026-07-24", ["B-001", "B-002"]);

    expect(result).toEqual({ count: 2 });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].deletedAt).toBeInstanceOf(Date);
  });

  it("writes nothing when the day has no reading of this farm", async () => {
    state.selectResults = [[]];

    const result = await deleteWeighings(7, "2026-07-24", ["B-001"]);

    expect(result).toEqual({ count: 0 });
    expect(state.updates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/api/services/__tests__/deleteWeighings.test.ts`
Expected: FAIL — `deleteWeighings is not a function`.

- [ ] **Step 3: Implement the service**

In `lib/api/services/animals.ts`:

```ts
/**
 * Soft-deletes the weight readings of one day for the animals given — the
 * "Pesagem" row of the manejo history that no session ever wrote (a ficha, an
 * import). Farm-scoped through the animal, so an ear tag of another farm is
 * simply not found.
 */
export async function deleteWeighings(
  farmId: number,
  date: string,
  earTags: string[]
): Promise<{ count: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: weighings.id })
      .from(weighings)
      .innerJoin(animals, eq(weighings.animalId, animals.id))
      .where(
        and(
          eq(animals.farmId, farmId),
          eq(weighings.date, date),
          inArray(animals.earTag, earTags),
          isNull(weighings.deletedAt)
        )
      );
    if (rows.length === 0) return { count: 0 };
    await tx
      .update(weighings)
      .set({ deletedAt: new Date() })
      .where(
        inArray(
          weighings.id,
          rows.map((r) => r.id)
        )
      );
    return { count: rows.length };
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run lib/api/services/__tests__/deleteWeighings.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add the model and the route**

In `lib/api/models.ts`, beside `DeleteTreatmentQuery`:

```ts
export const DeleteWeighingsBody = t.Object({
  date: t.String(),
  earTags: t.Array(t.String(), { minItems: 1 }),
});
```

In `lib/api/app.ts`, beside the other weighing routes:

```ts
  .delete(
    "/weighings",
    async ({ farmId, body }) => animalsService.deleteWeighings(farmId, body.date, body.earTags),
    { farm: true, body: DeleteWeighingsBody }
  )
```

Match the service import alias already used in that file for `lib/api/services/animals`.

- [ ] **Step 6: Add the store action**

In `lib/store/useHerdStore.ts`, type:

```ts
  /** Deletes the weight readings of one day (a "Pesagem" row of the history). */
  deleteWeighingGroup: (date: string, earTags: string[]) => Promise<number>;
```

Implementation:

```ts
  deleteWeighingGroup: async (date, earTags) => {
    const { data, error } = await api.weighings.delete({ date, earTags });
    if (error) apiFail("excluir a pesagem", error.status);
    const affected = new Set(earTags);
    set((s) => ({
      animals: s.animals.map((a) =>
        affected.has(a.earTag)
          ? { ...a, weighings: a.weighings.filter((w) => w.date !== date) }
          : a
      ),
    }));
    return (data as { count: number }).count;
  },
```

- [ ] **Step 7: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: all green.

---

### Task 6: The dialog and its two homes

**Files:**
- Create: `components/manejo/delete-manejo-dialog.tsx`
- Modify: `components/manejo/session-runner.tsx:169-180` (header actions)
- Modify: `components/manejo/manejo-history.tsx` (row menu)

**Interfaces:**
- Consumes: `deleteManejoSession`, `deleteWeighingGroup` (Tasks 4 and 5), `deleteTreatment(id, "batch")` (already on the store), `BlockedAnimal` from Task 2.
- Produces: `<DeleteManejoDialog target={…} open={…} onOpenChange={…} onDeleted={…} />`, where `target` is one of

```ts
export type DeleteTarget =
  | { kind: "session"; session: ManejoSession }
  | { kind: "treatments"; treatmentId: string; name: string; headCount: number }
  | { kind: "weighings"; date: string; earTags: string[] };
```

- [ ] **Step 1: Write the dialog**

Create `components/manejo/delete-manejo-dialog.tsx`, following the controlled-dialog idiom of `components/lots/archive-lot-dialog.tsx` (`open`/`onOpenChange` props, `saving` state, an error line):

```tsx
"use client";

/**
 * "Excluir manejo" / "Descartar manejo": one confirmation for every row of the
 * histórico. It spells the reversal out in the farmer's terms — how many
 * animals come back and where to — and, when the server refuses, lists the
 * animals standing in the way instead of the delete button. There is no undo:
 * registering the manejo again is the way back.
 */
import { useState } from "react";
import type { ManejoSession } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { BlockedAnimal, RevertBlockReason } from "@/lib/domain/manejoRevert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteTarget =
  | { kind: "session"; session: ManejoSession }
  | { kind: "treatments"; treatmentId: string; name: string; headCount: number }
  | { kind: "weighings"; date: string; earTags: string[] };

interface DeleteManejoDialogProps {
  target: DeleteTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the server accepted the deletion. */
  onDeleted?: () => void;
}

/** One line per animal that refuses to be reverted. */
const BLOCK_REASON: Record<RevertBlockReason, (earTag: string) => string> = {
  moved_lot: (earTag) => `${earTag} está em outro lote desde este manejo.`,
  not_sold: (earTag) => `${earTag} voltou ao rebanho ativo depois deste manejo.`,
  has_history: (earTag) => `${earTag} já tem histórico registrado depois da entrada.`,
  origin_lot_gone: (earTag) => `${earTag} veio de um lote que foi excluído.`,
};

/** How many animals the delete actually puts back. */
function headCount(target: DeleteTarget): number {
  if (target.kind === "treatments") return target.headCount;
  if (target.kind === "weighings") return target.earTags.length;
  return target.session.animals.filter((a) => a.outcome === "done").length;
}

/** What the farmer gets back, in their own terms. */
function consequence(target: DeleteTarget): string {
  const n = headCount(target);
  if (target.kind === "treatments") return `As aplicações de ${n} animais saem do histórico.`;
  if (target.kind === "weighings") return `As pesagens de ${n} animais saem do histórico.`;
  switch (target.session.kind) {
    case "sale":
      return `${n} animais voltam ao rebanho ativo.`;
    case "transfer":
      return `${n} animais voltam para o lote de origem.`;
    case "entry":
      return `${n} animais deixam de existir no rebanho.`;
    case "weighing":
      return `As pesagens de ${n} animais saem do histórico.`;
    default:
      return `As aplicações de ${n} animais saem do histórico.`;
  }
}

/** A venda also takes its money out of the financeiro. */
function moneyLine(target: DeleteTarget): string | null {
  if (target.kind !== "session" || target.session.kind !== "sale") return null;
  const total =
    target.session.totalAmountBrl ??
    target.session.animals.reduce((sum, a) => sum + (a.amountBrl ?? 0), 0);
  return total > 0 ? `O valor de ${formatCurrency(total)} sai do financeiro.` : null;
}

function title(target: DeleteTarget): string {
  if (target.kind === "treatments") return `Excluir ${target.name} do histórico?`;
  if (target.kind === "weighings") return `Excluir a pesagem de ${formatDate(target.date)}?`;
  const { session } = target;
  return session.status === "open"
    ? `Descartar o manejo de ${formatDate(session.date)}?`
    : `Excluir ${session.name.toLowerCase()} de ${formatDate(session.date)}?`;
}

function confirmLabel(target: DeleteTarget): string {
  return target.kind === "session" && target.session.status === "open"
    ? "Descartar manejo"
    : "Excluir manejo";
}

export function DeleteManejoDialog({
  target,
  open,
  onOpenChange,
  onDeleted,
}: DeleteManejoDialogProps) {
  const deleteManejoSession = useHerdStore((s) => s.deleteManejoSession);
  const deleteTreatment = useHerdStore((s) => s.deleteTreatment);
  const deleteWeighingGroup = useHerdStore((s) => s.deleteWeighingGroup);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<BlockedAnimal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (saving) return;
    if (!next) {
      setBlocked(null);
      setError(null);
    }
    onOpenChange(next);
  }

  async function confirm() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      if (target.kind === "session") {
        const refused = await deleteManejoSession(target.session.id);
        if (refused) {
          setBlocked(refused);
          return;
        }
      } else if (target.kind === "treatments") {
        await deleteTreatment(target.treatmentId, "batch");
      } else {
        await deleteWeighingGroup(target.date, target.earTags);
      }
      onOpenChange(false);
      onDeleted?.();
    } catch {
      setError("Não foi possível excluir agora. Tente de novo em instantes.");
    } finally {
      setSaving(false);
    }
  }

  if (!target) return null;
  const money = moneyLine(target);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        {blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>Não dá para excluir este manejo</DialogTitle>
              <DialogDescription>
                Um manejo mais recente depende dos animais deste aqui.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 text-sm text-ink">
              {blocked.map((animal) => (
                <li key={animal.earTag}>{BLOCK_REASON[animal.reason](animal.earTag)}</li>
              ))}
            </ul>
            <p className="text-sm text-ink-soft">Exclua o manejo mais recente primeiro.</p>
            <DialogFooter>
              <Button type="button" className="min-h-11 md:min-h-9" onClick={() => change(false)}>
                Entendi
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title(target)}</DialogTitle>
              <DialogDescription>{consequence(target)}</DialogDescription>
            </DialogHeader>
            {money ? <p className="text-sm text-ink-soft">{money}</p> : null}
            <p className="text-sm text-ink-soft">
              O manejo sai do histórico e não tem como desfazer — para voltar atrás, registre
              o manejo de novo.
            </p>
            {error ? <p className="text-sm text-overdue">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={() => change(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={confirm}
              >
                {saving ? "Excluindo…" : confirmLabel(target)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Check `components/ui/dialog.tsx` for the exact exports before writing — use the same subcomponents `archive-lot-dialog.tsx` imports, and drop `DialogTrigger` here because both callers open the dialog themselves.

- [ ] **Step 2: Wire the chute screen**

In `components/manejo/session-runner.tsx`, add to the `PageHeader` `actions` at :178 a ghost button opening the dialog with `{ kind: "session", session }`, labelled "Descartar manejo", with `Trash2` from lucide-react and `className="min-h-11 text-ink-soft hover:text-overdue md:min-h-9"`. On `onDeleted`, `router.push("/manejo")`.

- [ ] **Step 3: Wire the history rows**

In `components/manejo/manejo-history.tsx`, give each row a `•••` menu using `components/ui/dropdown-menu.tsx`, the way `components/lots/lot-card-menu.tsx` does. The single item is "Excluir manejo", and it opens the dialog with the target built from the row:

- a row whose `key` is a session id → `{ kind: "session", session }`
- a treatment group → `{ kind: "treatments", treatmentId, name, headCount }`, deleted with `deleteTreatment(treatmentId, "batch")`
- a `weighing` row → `{ kind: "weighings", date, earTags }`

`ManejoHistoryRow` does not carry the ids the last two need. Add them in `components/manejo/helpers.ts`, in `manejoHistory`: keep the first treatment's id on the treatment groups (`treatmentId`), and collect the ear tags on the weighing rows (`earTags`). Both fields optional, so nothing else changes.

- [ ] **Step 4: Verify the build and the suite**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: all green. `components/manejo/__tests__/helpers.test.ts` must still pass — the two new fields are additive.

- [ ] **Step 5: Check it in the real app**

Run: `pnpm db:up && pnpm dev`, sign in with a `teste.*` user, seed the farm, then, on `/manejo`:

1. delete a pesagem row → the weights disappear from the animals' fichas and from the GMD;
2. delete a transferência → the animals are back in the lote of origin;
3. delete a venda → the animals are active again and the value is gone from `/finance`;
4. start a manejo, pass two animals, "Descartar manejo" → back on `/manejo`, no row, no treatments;
5. delete a transferência whose animals were moved afterwards → the blocked list names them and nothing changes.

---

## Final verification

- [ ] `pnpm test` — every suite passes
- [ ] `pnpm exec tsc --noEmit` — silent
- [ ] `pnpm lint` — silent
- [ ] `pnpm build` — the production build compiles
- [ ] `pnpm migration:check` — the journal and the SQL agree
- [ ] One commit, `feat(manejo): delete a manejo and put the herd back`, with the spec and this plan in it
