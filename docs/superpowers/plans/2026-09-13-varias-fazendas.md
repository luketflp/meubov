# Várias fazendas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create more farms (named at creation, optionally starting from the open farm's raças, categorias and protocolos), list them in Configurações > Fazendas, soft-delete a farm they own, and guide an empty farm with a Primeiros passos card.

**Architecture:** The rules are pure functions in `lib/domain/farms.ts`. Two new use cases, `CreateFarmUseCase` and `DeleteFarmUseCase`, sit behind session-only routes `POST /farms` and `DELETE /farms/:id`. A new `farm.deleted_at` column is filtered wherever a user is turned into a farm: the farm macro, the farm list, lazy first-farm creation and `hasFarm`. On the client, the store gains `createFarm` and `deleteFarm`, and the rail and phone switchers become one `FarmSwitcher` dropdown. New components: `NewFarmDialog`, `FarmsPage`, `DeleteFarmDialog` and `FirstStepsCard`.

**Tech Stack:** Next.js 16 (app router), Elysia 1.4 + Eden Treaty, Drizzle ORM on Postgres, Better Auth, Zustand, Vitest, Tailwind 4, shadcn/radix UI, sonner.

**Spec:** `docs/superpowers/specs/2026-09-13-varias-fazendas-design.md` (read it first; this plan argues from it).

**Design canvas:** https://claude.ai/code/artifact/79f32d52-c855-4149-bf59-0cc3d39383e7

## Global Constraints

- **No commit after each task.** The feature lands as one `feat(farms): ...` commit at the very end, with the spec and this plan, only after the user picks "commit". No `Co-Authored-By` or session trailers.
- **Workspace:** the isolated worktree `/home/luketa/meubov/.claude/worktrees/varias-fazendas` (branch `worktree-varias-fazendas`, from `main` at `1241d17`, which already has the Reprodução row and weighing edits). Run every command from that directory; never `cd` or `git -C` into the main checkout. Before applying an anchor, confirm it matches, and if it does not, apply the same intent to the current code.
- `AGENTS.md`: this Next.js has breaking changes. Before creating `app/(app)/settings/fazendas/page.tsx`, read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`.
- UI copy is pt-BR and matches the spec word for word. Code identifiers and comments are English, in the voice of the surrounding code.
- Colors only through the palette tokens in `app/globals.css` (no loose hex in components).
- Toasts in new code use `sonner` (`import { toast } from "sonner"`), like `components/team/*`.
- A new farm's name and município are trimmed, required, at most 80 characters.
- Commands, run inside the worktree. Baseline at `1241d17`: 809 tests pass, tsc and lint are clean. Anywhere below that shows `--exclude '.claude/**'` or `--ignore-pattern '.claude/**'`, drop that flag inside the worktree.
  - Tests: `pnpm exec vitest run <path>`, or `pnpm exec vitest run` for the whole suite.
  - Types: `pnpm exec tsc --noEmit`.
  - Lint: `pnpm lint`.
- Test-first for `lib/domain/farms.ts` and the use cases. React components have no unit tests in this repo; they are checked in the running app (Task 12).

## File map

| file | responsibility |
| --- | --- |
| `lib/domain/farms.ts` (+ `__tests__/farms.test.ts`) | `farmLabel`, `validateNewFarm`, `deleteVerdict`, `confirmsFarmName`, `copySummary`, `firstSteps`, `showFirstSteps` |
| `lib/db/schema.ts`, `drizzle/0016_farm-soft-delete.sql` | `farm.deleted_at` |
| `lib/api/plugins/farm.ts` | skip deleted farms when resolving the active farm |
| `lib/api/domains/farm/useCases/EnsureForUser.useCase.ts` | deleted farms do not count as a first farm |
| `lib/api/domains/farm/useCases/Browse.useCase.ts` (+ test) | skip deleted farms, add `municipality` |
| `lib/api/domains/invites/useCases/BrowseMine.useCase.ts` (+ test) | `hasFarm` counts live farms only |
| `lib/api/__tests__/dbStub.ts` | `execute()` for the advisory lock |
| `lib/api/domains/farm/useCases/Create.useCase.ts` (+ test) | create and copy setup |
| `lib/api/domains/farm/useCases/Delete.useCase.ts` (+ test) | soft delete and cancel convites |
| `lib/api/domains/farm/schemas/farm.schema.ts`, `farm.controller.ts` | the two routes |
| `lib/api/permissions/routeRequirements.ts` | `DELETE /farms/:id` is session-only |
| `lib/store/useHerdStore.ts` | `FarmOption.municipality`, `createFarm`, `deleteFarm` |
| `components/farms/NewFarmDialog.tsx`, `components/farms/useNewFarm.ts` | the create dialog and its store wiring |
| `components/farms/FarmSwitcher.tsx` | switcher dropdown for rail and "Mais" |
| `components/layout/Sidebar.tsx`, `components/layout/MobileTabBar.tsx` | use the switcher |
| `lib/nav.ts`, `lib/__tests__/nav.test.ts` | Fazendas child |
| `app/(app)/settings/fazendas/page.tsx`, `components/farms/FarmsPage.tsx`, `components/farms/DeleteFarmDialog.tsx` | Configurações > Fazendas |
| `components/dashboard/FirstStepsCard.tsx`, `app/(app)/dashboard/page.tsx` | Primeiros passos |
| `components/invites/InvitesScreen.tsx`, `InviteCard.tsx`, `PendingInviteBanner.tsx`, `components/settings/MembershipCard.tsx` | dialog on `/convites`, `farmLabel` |
| `ROADMAP.md` | item 3 |

---

### Task 1: Farms domain

**Files:**
- Create: `lib/domain/farms.ts`
- Test: `lib/domain/__tests__/farms.test.ts`

**Interfaces:**
- Consumes: `FarmRole` from `lib/domain/permissions.ts`; `Animal`, `FarmData`, `Invernada` from `lib/types.ts`.
- Produces:
  - `FARM_FIELD_MAX = 80`
  - `farmLabel(farm: { id: number; name: string }): string`
  - `type NewFarmProblem = "name_required" | "name_too_long" | "municipality_required" | "municipality_too_long"`
  - `validateNewFarm(input: { name: string; municipality: string }): { ok: true; name: string; municipality: string } | { ok: false; problem: NewFarmProblem }`
  - `type DeleteVerdict = "ok" | "not_owner" | "last_farm"`
  - `deleteVerdict(input: { role: FarmRole; liveFarmCount: number }): DeleteVerdict`
  - `confirmsFarmName(typed: string, label: string): boolean`
  - `copySummary(counts: { breeds: number; categories: number; protocols: number }): string | null`
  - `type FirstStepId = "headquarters" | "invernada" | "animal"`
  - `firstSteps(farm: Pick<FarmData, "headquarters">, invernadas: readonly Invernada[], animals: readonly Animal[]): { id: FirstStepId; done: boolean }[]`
  - `showFirstSteps(animals: readonly Animal[]): boolean`

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/__tests__/farms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Animal, Invernada } from "@/lib/types";
import {
  FARM_FIELD_MAX,
  confirmsFarmName,
  copySummary,
  deleteVerdict,
  farmLabel,
  firstSteps,
  showFirstSteps,
  validateNewFarm,
} from "@/lib/domain/farms";

// The functions only count these arrays, so bare objects stand in for the records.
const animal = {} as Animal;
const invernada = {} as Invernada;

describe("farmLabel", () => {
  it("uses the trimmed name", () => {
    expect(farmLabel({ id: 3, name: "  Fazenda Boa Vista " })).toBe("Fazenda Boa Vista");
  });

  it("falls back to the id for a farm never named", () => {
    expect(farmLabel({ id: 12, name: "   " })).toBe("Fazenda #12");
  });
});

describe("validateNewFarm", () => {
  it("trims both fields", () => {
    expect(validateNewFarm({ name: " Fazenda Boa Vista ", municipality: " Sorriso - MT " })).toEqual({
      ok: true,
      name: "Fazenda Boa Vista",
      municipality: "Sorriso - MT",
    });
  });

  it("requires a name", () => {
    expect(validateNewFarm({ name: "  ", municipality: "Sorriso - MT" })).toEqual({
      ok: false,
      problem: "name_required",
    });
  });

  it("requires a município", () => {
    expect(validateNewFarm({ name: "Fazenda Boa Vista", municipality: "" })).toEqual({
      ok: false,
      problem: "municipality_required",
    });
  });

  it("refuses a name longer than the limit", () => {
    expect(validateNewFarm({ name: "x".repeat(FARM_FIELD_MAX + 1), municipality: "Sorriso - MT" })).toEqual({
      ok: false,
      problem: "name_too_long",
    });
  });

  it("refuses a município longer than the limit", () => {
    expect(validateNewFarm({ name: "Fazenda", municipality: "x".repeat(FARM_FIELD_MAX + 1) })).toEqual({
      ok: false,
      problem: "municipality_too_long",
    });
  });

  it("accepts exactly the limit", () => {
    expect(validateNewFarm({ name: "x".repeat(FARM_FIELD_MAX), municipality: "y" }).ok).toBe(true);
  });
});

describe("deleteVerdict", () => {
  it("lets the Dono delete when another farm is left", () => {
    expect(deleteVerdict({ role: "owner", liveFarmCount: 2 })).toBe("ok");
  });

  it("refuses a member", () => {
    expect(deleteVerdict({ role: "member", liveFarmCount: 3 })).toBe("not_owner");
  });

  it("refuses the last farm", () => {
    expect(deleteVerdict({ role: "owner", liveFarmCount: 1 })).toBe("last_farm");
  });
});

describe("confirmsFarmName", () => {
  it("accepts the label typed exactly", () => {
    expect(confirmsFarmName("Fazenda Boa Vista", "Fazenda Boa Vista")).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(confirmsFarmName("  fazenda boa vista ", "Fazenda Boa Vista")).toBe(true);
  });

  it("refuses a partial name", () => {
    expect(confirmsFarmName("Fazenda Boa", "Fazenda Boa Vista")).toBe(false);
  });

  it("refuses an empty field", () => {
    expect(confirmsFarmName("", "Fazenda Boa Vista")).toBe(false);
  });
});

describe("copySummary", () => {
  it("lists all three kinds", () => {
    expect(copySummary({ breeds: 8, categories: 3, protocols: 5 })).toBe(
      "Traz 8 raças, 3 categorias e 5 protocolos sanitários."
    );
  });

  it("uses the singular", () => {
    expect(copySummary({ breeds: 1, categories: 1, protocols: 1 })).toBe(
      "Traz 1 raça, 1 categoria e 1 protocolo sanitário."
    );
  });

  it("leaves out the kinds at zero", () => {
    expect(copySummary({ breeds: 2, categories: 0, protocols: 4 })).toBe(
      "Traz 2 raças e 4 protocolos sanitários."
    );
    expect(copySummary({ breeds: 0, categories: 0, protocols: 1 })).toBe(
      "Traz 1 protocolo sanitário."
    );
  });

  it("is null when there is nothing to copy", () => {
    expect(copySummary({ breeds: 0, categories: 0, protocols: 0 })).toBeNull();
  });
});

describe("firstSteps", () => {
  it("has every step pending on a brand-new farm", () => {
    expect(firstSteps({}, [], [])).toEqual([
      { id: "headquarters", done: false },
      { id: "invernada", done: false },
      { id: "animal", done: false },
    ]);
  });

  it("marks the sede once a map view is saved", () => {
    expect(firstSteps({ headquarters: { lat: -13, lng: -56 } }, [], [])[0]).toEqual({
      id: "headquarters",
      done: true,
    });
  });

  it("marks the invernadas once one exists and the animals once one exists", () => {
    expect(firstSteps({}, [invernada], [animal])).toEqual([
      { id: "headquarters", done: false },
      { id: "invernada", done: true },
      { id: "animal", done: true },
    ]);
  });
});

describe("showFirstSteps", () => {
  it("shows the card on a farm without animals", () => {
    expect(showFirstSteps([])).toBe(true);
  });

  it("hides it once any animal exists, active or not", () => {
    expect(showFirstSteps([animal])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/domain/__tests__/farms.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/domain/farms"`.

- [ ] **Step 3: Write the module**

Create `lib/domain/farms.ts`:

```ts
/**
 * Creating, listing and deleting farms: the rules the farm routes enforce and
 * the screens repeat, so no button is offered that the server would refuse.
 *
 * Node-safe and pure, shared by the use cases and the components.
 */
import type { FarmRole } from "@/lib/domain/permissions";
import type { Animal, FarmData, Invernada } from "@/lib/types";

/** Longest name or município a new farm accepts. */
export const FARM_FIELD_MAX = 80;

/** "Fazenda Boa Vista", or "Fazenda #12" for a farm that was never named. */
export function farmLabel(farm: { id: number; name: string }): string {
  return farm.name.trim() || `Fazenda #${farm.id}`;
}

export type NewFarmProblem =
  | "name_required"
  | "name_too_long"
  | "municipality_required"
  | "municipality_too_long";

export type NewFarmCheck =
  | { ok: true; name: string; municipality: string }
  | { ok: false; problem: NewFarmProblem };

/** Trims both fields and names the first one that cannot be saved. */
export function validateNewFarm(input: { name: string; municipality: string }): NewFarmCheck {
  const name = input.name.trim();
  const municipality = input.municipality.trim();
  if (name === "") return { ok: false, problem: "name_required" };
  if (name.length > FARM_FIELD_MAX) return { ok: false, problem: "name_too_long" };
  if (municipality === "") return { ok: false, problem: "municipality_required" };
  if (municipality.length > FARM_FIELD_MAX) return { ok: false, problem: "municipality_too_long" };
  return { ok: true, name, municipality };
}

export type DeleteVerdict = "ok" | "not_owner" | "last_farm";

/**
 * Only the Dono deletes, and never the last farm the account can open: nobody
 * is left with nothing, and the lazy first-farm creation never hands them an
 * empty farm behind their back.
 */
export function deleteVerdict(input: { role: FarmRole; liveFarmCount: number }): DeleteVerdict {
  if (input.role !== "owner") return "not_owner";
  if (input.liveFarmCount <= 1) return "last_farm";
  return "ok";
}

/** The delete confirmation: the farm's label typed again, case and outer spaces aside. */
export function confirmsFarmName(typed: string, label: string): boolean {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  return typed.trim() !== "" && normalize(typed) === normalize(label);
}

function counted(count: number, singular: string, plural: string): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The hint under "Usar o cadastro da …": "Traz 8 raças, 3 categorias e 5
 * protocolos sanitários." Null when the open farm has nothing to copy, which
 * is what hides the switch.
 */
export function copySummary(counts: {
  breeds: number;
  categories: number;
  protocols: number;
}): string | null {
  const parts = [
    counted(counts.breeds, "raça", "raças"),
    counted(counts.categories, "categoria", "categorias"),
    counted(counts.protocols, "protocolo sanitário", "protocolos sanitários"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `Traz ${list}.`;
}

export type FirstStepId = "headquarters" | "invernada" | "animal";

export interface FirstStep {
  id: FirstStepId;
  done: boolean;
}

/**
 * The Primeiros passos of a farm, each done because the data says so — the
 * saved sede, a first invernada, a first animal — with no "onboarding done"
 * flag to go stale, the same idea as lib/domain/mapSetup.ts.
 */
export function firstSteps(
  farm: Pick<FarmData, "headquarters">,
  invernadas: readonly Invernada[],
  animals: readonly Animal[]
): FirstStep[] {
  return [
    { id: "headquarters", done: farm.headquarters !== undefined },
    { id: "invernada", done: invernadas.length > 0 },
    { id: "animal", done: animals.length > 0 },
  ];
}

/**
 * The card shows only while the farm has no animal at all, sold and dead
 * included, so a farm that already has a herd never sees it.
 */
export function showFirstSteps(animals: readonly Animal[]): boolean {
  return animals.length === 0;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/domain/__tests__/farms.test.ts`
Expected: PASS, 24 tests.

---

### Task 2: `farm.deleted_at` and migration 0016

**Files:**
- Modify: `lib/db/schema.ts` (the `farm` table)
- Create: `drizzle/0016_farm-soft-delete.sql`, plus the snapshot and journal entry that drizzle-kit writes

**Interfaces:**
- Produces: `farm.deletedAt` (nullable `timestamp`, column `deleted_at`).

- [ ] **Step 1: Add the column**

In `lib/db/schema.ts`, replace:

```ts
  headquartersZoom: integer("headquarters_zoom"),
});

/** Membership of a user in a farm (a user can join many farms). */
```

with:

```ts
  headquartersZoom: integer("headquarters_zoom"),
  /**
   * Set when the Dono deletes the farm. Its rows stay; every lookup that turns
   * a user into a farm (the farm macro, the farm list, the lazy first farm)
   * skips it from then on.
   */
  deletedAt: timestamp("deleted_at"),
});

/** Membership of a user in a farm (a user can join many farms). */
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm exec drizzle-kit generate --name farm-soft-delete`
Expected: writes `drizzle/0016_farm-soft-delete.sql`, `drizzle/meta/0016_snapshot.json` and a new `_journal.json` entry. No database is needed.

If the other session landed a migration numbered 0016 first, drizzle-kit numbers this one 0017. That is fine, but use the real file name in the rest of this plan.

- [ ] **Step 3: Read the SQL**

Run: `cat drizzle/0016_farm-soft-delete.sql`
Expected, exactly one statement:

```sql
ALTER TABLE "farm" ADD COLUMN "deleted_at" timestamp;
```

Do not run the migration against the shared dev volume. Task 12 migrates an isolated throwaway database.

- [ ] **Step 4: Types**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

---

### Task 3: Skip deleted farms where a user becomes a farm

**Files:**
- Modify: `lib/api/plugins/farm.ts`
- Modify: `lib/api/domains/farm/useCases/EnsureForUser.useCase.ts`
- Modify: `lib/api/domains/farm/useCases/Browse.useCase.ts`
- Modify: `lib/api/domains/invites/useCases/BrowseMine.useCase.ts`
- Test: `lib/api/domains/farm/useCases/__tests__/Browse.test.ts`, `lib/api/domains/invites/useCases/__tests__/BrowseMine.test.ts`

**Interfaces:**
- Consumes: `farm.deletedAt` (Task 2).
- Produces: `FarmSummary` gains `municipality: string` (serialized by `GET /farms`).

- [ ] **Step 1: Update the Browse test first**

In `lib/api/domains/farm/useCases/__tests__/Browse.test.ts`:

1. Replace the hoisted state

```ts
const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
  },
}));
```

with

```ts
const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
    wheres: [] as unknown[],
  },
}));
```

2. Replace the mock's `where` method

```ts
        where() {
          return builder;
        },
```

with

```ts
        where(condition: unknown) {
          state.wheres.push(condition);
          return builder;
        },
```

3. Replace

```ts
import { BrowseFarmsUseCase } from "../Browse.useCase";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

beforeEach(() => {
  state.rows = [];
});
```

with

```ts
import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";
import { BrowseFarmsUseCase } from "../Browse.useCase";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

beforeEach(() => {
  state.rows = [];
  state.wheres = [];
});
```

4. Add `municipality: "Sorriso - MT"` right after every `name: "Fazenda …"` property in the file, fixture rows and expected objects alike. That is seven places; the third test's fixture is a one-line object, so the property goes inside that line. The first test's fixture and expectation then read, for example:

```ts
      {
        id: 1,
        name: "Fazenda A",
        municipality: "Sorriso - MT",
        role: "member",
```

5. Before the final `});` of `describe("browseFarms", …)`, add:

```ts
  it("skips deleted farms for a member", async () => {
    await new BrowseFarmsUseCase().run({ userId: "u1", superuser: false });
    expect(renderSql(state.wheres[0] as SQL).sql).toContain('"farm"."deleted_at" is null');
  });

  it("skips deleted farms for a superuser too", async () => {
    await new BrowseFarmsUseCase().run({ userId: "root", superuser: true });
    expect(renderSql(state.wheres[0] as SQL).sql).toContain('"farm"."deleted_at" is null');
  });
```

- [ ] **Step 2: Update the BrowseMine test first**

In `lib/api/domains/invites/useCases/__tests__/BrowseMine.test.ts`:

1. Add `wheres: [] as unknown[],` after `returning: [] as unknown[][],` in the hoisted state.
2. Replace

```ts
import { BrowseMyInvitesUseCase } from "../BrowseMine.useCase";
```

with

```ts
import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";
import { BrowseMyInvitesUseCase } from "../BrowseMine.useCase";
```

3. Replace

```ts
beforeEach(() => {
  state.selectResults = [];
});
```

with

```ts
beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});
```

4. Before the final `});` of `describe("browseMyInvites", …)`, add:

```ts
  it("counts only live farms as having a farm", async () => {
    state.selectResults = [[], []];
    await new BrowseMyInvitesUseCase().run({ userId: "u-zeca", email: "zeca@hotmail.com", now });
    const membership = renderSql(state.wheres[1] as SQL);
    expect(membership.sql).toContain('"farm"."deleted_at" is null');
    expect(membership.params).toContain("u-zeca");
  });
```

- [ ] **Step 3: Run both tests to see the new ones fail**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/domains/farm/useCases/__tests__/Browse.test.ts lib/api/domains/invites/useCases/__tests__/BrowseMine.test.ts`
Expected: FAIL. The municipality expectations differ, and `state.wheres[0]` is undefined or lacks `deleted_at`.

- [ ] **Step 4: Browse use case**

In `lib/api/domains/farm/useCases/Browse.useCase.ts`:

Replace `import { and, asc, eq } from "drizzle-orm";` with `import { and, asc, eq, isNull } from "drizzle-orm";`.

Replace

```ts
  id: number;
  name: string;
  role: FarmRole;
```

with

```ts
  id: number;
  name: string;
  municipality: string;
  role: FarmRole;
```

Replace

```ts
 * Lists the farms the user can access, first item being the default farm.
```

with

```ts
 * Lists the live farms the user can access, first item being the default farm.
 * A deleted farm (`deleted_at` set) is gone from here for everyone.
```

Replace

```ts
      id: farm.id,
      name: farm.name,
      role: farmUsers.role,
```

with

```ts
      id: farm.id,
      name: farm.name,
      municipality: farm.municipality,
      role: farmUsers.role,
```

Replace

```ts
        .leftJoin(farmUsers, and(eq(farmUsers.farmId, farm.id), eq(farmUsers.userId, userId)))
        .orderBy(asc(farm.id));
```

with

```ts
        .leftJoin(farmUsers, and(eq(farmUsers.farmId, farm.id), eq(farmUsers.userId, userId)))
        .where(isNull(farm.deletedAt))
        .orderBy(asc(farm.id));
```

In the superuser `rows.map`, replace

```ts
          id: row.id,
          name: row.name,
          role,
```

with

```ts
          id: row.id,
          name: row.name,
          municipality: row.municipality,
          role,
```

Replace

```ts
      .innerJoin(farm, eq(farm.id, farmUsers.farmId))
      .where(eq(farmUsers.userId, userId))
      .orderBy(asc(farmUsers.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
```

with

```ts
      .innerJoin(farm, eq(farm.id, farmUsers.farmId))
      .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)))
      .orderBy(asc(farmUsers.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      municipality: row.municipality,
```

- [ ] **Step 5: BrowseMine use case**

In `lib/api/domains/invites/useCases/BrowseMine.useCase.ts`, add `isNull` to the `drizzle-orm` import (keep the other names already imported there). Then replace

```ts
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .where(eq(farmUsers.userId, userId))
        .limit(1),
```

with

```ts
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)))
        .limit(1),
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/domains/farm/useCases/__tests__/Browse.test.ts lib/api/domains/invites/useCases/__tests__/BrowseMine.test.ts`
Expected: PASS.

- [ ] **Step 7: Lazy first farm**

In `lib/api/domains/farm/useCases/EnsureForUser.useCase.ts`, replace `import { sql } from "drizzle-orm";` with `import { and, eq, isNull, sql } from "drizzle-orm";`. Then replace

```ts
      const memberships = await tx
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .where(sql`${farmUsers.userId} = ${userId}`)
        .orderBy(farmUsers.createdAt)
        .limit(1);
```

with

```ts
      const memberships = await tx
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)))
        .orderBy(farmUsers.createdAt)
        .limit(1);
```

and replace the doc line `* Returns the id of the user's first farm, creating an empty farm (with the` with `* Returns the id of the user's first live farm, creating an empty farm (with the`.

- [ ] **Step 8: The farm macro**

In `lib/api/plugins/farm.ts`, replace `import { and, asc, eq, gt } from "drizzle-orm";` with `import { and, asc, eq, gt, isNull } from "drizzle-orm";`.

Replace the doc sentence

```ts
 * `x-farm-id` header (403 unless the user is a member of that farm) or the
 * user's oldest membership. A user with no membership but a pending convite
```

with

```ts
 * `x-farm-id` header (403 unless the user is a member of that farm) or the
 * user's oldest membership. A deleted farm counts as no farm at all: its
 * members get 403 not_a_member, as a removed member does. A user with no
 * membership but a pending convite
```

Replace the header-path membership query

```ts
          .from(farmUsers)
          .where(and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, user.id)))
          .limit(1);
```

with

```ts
          .from(farmUsers)
          .innerJoin(farm, eq(farm.id, farmUsers.farmId))
          .where(
            and(
              eq(farmUsers.farmId, farmId),
              eq(farmUsers.userId, user.id),
              isNull(farm.deletedAt)
            )
          )
          .limit(1);
```

Replace

```ts
          .select({ id: farm.id })
          .from(farm)
          .where(eq(farm.id, farmId))
          .limit(1);
```

with

```ts
          .select({ id: farm.id })
          .from(farm)
          .where(and(eq(farm.id, farmId), isNull(farm.deletedAt)))
          .limit(1);
```

Replace the default-farm query

```ts
        .from(farmUsers)
        .where(eq(farmUsers.userId, user.id))
        .orderBy(asc(farmUsers.createdAt))
        .limit(1);
```

with

```ts
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, user.id), isNull(farm.deletedAt)))
        .orderBy(asc(farmUsers.createdAt))
        .limit(1);
```

Replace the superuser fallback

```ts
          .select({ id: farm.id })
          .from(farm)
          .orderBy(asc(farm.id))
          .limit(1);
```

with

```ts
          .select({ id: farm.id })
          .from(farm)
          .where(isNull(farm.deletedAt))
          .orderBy(asc(farm.id))
          .limit(1);
```

- [ ] **Step 9: Run the API tests and types**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api`
Expected: PASS. `permissions.test.ts` mocks `innerJoin` and `where` already.

Run: `pnpm exec tsc --noEmit`
Expected: clean.

---

### Task 4: `CreateFarmUseCase`

**Files:**
- Create: `lib/api/domains/farm/useCases/Create.useCase.ts`
- Test: `lib/api/domains/farm/useCases/__tests__/Create.test.ts`

**Interfaces:**
- Consumes: `validateNewFarm`, `NewFarmProblem` (Task 1); `farm.deletedAt` (Task 2).
- Produces: `new CreateFarmUseCase().run({ userId: string; name: string; municipality: string; copyFromFarmId?: number }): Promise<{ farmId: number } | { invalid: NewFarmProblem } | "not_a_member">`.

- [ ] **Step 1: Write the failing test**

Create `lib/api/domains/farm/useCases/__tests__/Create.test.ts`:

```ts
/** createFarm: a farm the caller owns, optionally started from a farm they belong to. */
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
import { CreateFarmUseCase } from "../Create.useCase";

const input = { userId: "u-lucas", name: " Fazenda Boa Vista ", municipality: "Sorriso - MT " };

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
  state.wheres = [];
});

describe("createFarm", () => {
  it("refuses an invalid farm before touching the database", async () => {
    const result = await new CreateFarmUseCase().run({ ...input, name: "  " });
    expect(result).toEqual({ invalid: "name_required" });
    expect(state.inserts).toEqual([]);
  });

  it("creates the farm with trimmed fields and the caller as Dono", async () => {
    state.returning = [[{ id: 42 }]];
    const result = await new CreateFarmUseCase().run(input);
    expect(result).toEqual({ farmId: 42 });
    expect(state.inserts).toEqual([
      { name: "Fazenda Boa Vista", municipality: "Sorriso - MT", stateRegistration: "", manager: "" },
      { farmId: 42, userId: "u-lucas", role: "owner" },
    ]);
  });

  it("refuses a source farm the caller does not belong to", async () => {
    state.selectResults = [[]];
    const result = await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });
    expect(result).toBe("not_a_member");
    expect(state.inserts).toEqual([]);
    const source = renderSql(state.wheres[0] as SQL);
    expect(source.sql).toContain('"farm"."deleted_at" is null');
    expect(source.params).toEqual(expect.arrayContaining([7, "u-lucas"]));
  });

  it("copies raças, categorias and protocolos with fresh ids", async () => {
    state.selectResults = [
      [{ farmId: 7 }],
      [{ name: "Nelore" }, { name: "Angus" }],
      [{ name: "Matriz", baseCategory: "cow" }],
      [{ name: "Aftosa", type: "vaccine", intervalMonths: 6, withdrawalDays: 0, mandatory: true }],
    ];
    state.returning = [[{ id: 42 }]];

    const result = await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });

    expect(result).toEqual({ farmId: 42 });
    expect(state.inserts.slice(2)).toEqual([
      [
        { farmId: 42, name: "Nelore" },
        { farmId: 42, name: "Angus" },
      ],
      [{ id: expect.any(String), farmId: 42, name: "Matriz", baseCategory: "cow" }],
      [
        {
          id: expect.any(String),
          farmId: 42,
          name: "Aftosa",
          type: "vaccine",
          intervalMonths: 6,
          withdrawalDays: 0,
          mandatory: true,
        },
      ],
    ]);
  });

  it("skips a kind the source does not have", async () => {
    state.selectResults = [[{ farmId: 7 }], [{ name: "Nelore" }], [], []];
    state.returning = [[{ id: 42 }]];
    await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });
    expect(state.inserts).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/domains/farm/useCases/__tests__/Create.test.ts`
Expected: FAIL, `Failed to resolve import "../Create.useCase"`.

- [ ] **Step 3: Write the use case**

Create `lib/api/domains/farm/useCases/Create.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { breeds, customCategories, farm, farmUsers, healthProtocols } from "@/lib/db/schema";
import { validateNewFarm, type NewFarmProblem } from "@/lib/domain/farms";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CreateFarmUseCaseProps {
  userId: string;
  name: string;
  municipality: string;
  /** The open farm whose raças, categorias and protocolos the new farm starts with. */
  copyFromFarmId?: number;
}

type CreateFarmUseCaseResponse =
  | { farmId: number }
  | { invalid: NewFarmProblem }
  | "not_a_member";

type CurrUseCase = _UseCase<CreateFarmUseCaseProps, CreateFarmUseCaseResponse>;

/**
 * A new farm owned by the caller, named at creation. With a source farm it
 * starts with that farm's raças, categorias and protocolos sanitários under
 * fresh ids — never its animals, lotes, invernadas, touros or equipe. The
 * caller must still belong to the live source; any role will do, since every
 * member already sees those lists.
 *
 * The plan's maxFarms cap belongs at the top of this transaction when billing
 * lands, behind the per-user advisory lock EnsureFarmForUserUseCase takes.
 */
export class CreateFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CreateFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, name, municipality, copyFromFarmId }) => {
    const check = validateNewFarm({ name, municipality });
    if (!check.ok) return { invalid: check.problem };

    return this.repository.transaction(async (tx) => {
      if (copyFromFarmId !== undefined) {
        const [source] = await tx
          .select({ farmId: farmUsers.farmId })
          .from(farmUsers)
          .innerJoin(farm, eq(farm.id, farmUsers.farmId))
          .where(
            and(
              eq(farmUsers.farmId, copyFromFarmId),
              eq(farmUsers.userId, userId),
              isNull(farm.deletedAt)
            )
          )
          .limit(1);
        if (!source) return "not_a_member" as const;
      }

      const [created] = await tx
        .insert(farm)
        .values({
          name: check.name,
          municipality: check.municipality,
          stateRegistration: "",
          manager: "",
        })
        .returning({ id: farm.id });
      await tx.insert(farmUsers).values({ farmId: created.id, userId, role: "owner" });

      if (copyFromFarmId !== undefined) await copySetup(tx, copyFromFarmId, created.id);
      return { farmId: created.id };
    });
  };
}

/** Copies the lists a farm is set up with, one kind after the other on the transaction. */
async function copySetup(tx: RepositoryType, from: number, to: number): Promise<void> {
  const breedRows = await tx
    .select({ name: breeds.name })
    .from(breeds)
    .where(eq(breeds.farmId, from));
  if (breedRows.length > 0) {
    await tx.insert(breeds).values(breedRows.map((row) => ({ farmId: to, name: row.name })));
  }

  const categoryRows = await tx
    .select({ name: customCategories.name, baseCategory: customCategories.baseCategory })
    .from(customCategories)
    .where(eq(customCategories.farmId, from));
  if (categoryRows.length > 0) {
    await tx
      .insert(customCategories)
      .values(categoryRows.map((row) => ({ id: randomUUID(), farmId: to, ...row })));
  }

  const protocolRows = await tx
    .select({
      name: healthProtocols.name,
      type: healthProtocols.type,
      intervalMonths: healthProtocols.intervalMonths,
      withdrawalDays: healthProtocols.withdrawalDays,
      mandatory: healthProtocols.mandatory,
    })
    .from(healthProtocols)
    .where(eq(healthProtocols.farmId, from));
  if (protocolRows.length > 0) {
    await tx
      .insert(healthProtocols)
      .values(protocolRows.map((row) => ({ id: randomUUID(), farmId: to, ...row })));
  }
}
```

If `tsc` rejects passing the transaction handle as `RepositoryType`, type the parameter as `Tx` (exported beside `RepositoryType` in `lib/api/@types/repoTypes.ts`) instead.

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/domains/farm/useCases/__tests__/Create.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Types**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

---

### Task 5: `DeleteFarmUseCase`

**Files:**
- Modify: `lib/api/__tests__/dbStub.ts`
- Create: `lib/api/domains/farm/useCases/Delete.useCase.ts`
- Test: `lib/api/domains/farm/useCases/__tests__/Delete.test.ts`

**Interfaces:**
- Consumes: `deleteVerdict` (Task 1); `farm.deletedAt` (Task 2).
- Produces: `new DeleteFarmUseCase().run({ userId: string; farmId: number; now: Date }): Promise<"deleted" | "farm_not_found" | "not_owner" | "last_farm">`.

- [ ] **Step 1: Teach the stub `execute`**

In `lib/api/__tests__/dbStub.ts`, replace

```ts
 * `delete()` counts. `transaction(run)` runs `run` against the same handle.
```

with

```ts
 * `delete()` counts. `execute()` (an advisory lock) resolves to no rows.
 * `transaction(run)` runs `run` against the same handle.
```

and replace

```ts
    delete: () => ({
```

with

```ts
    execute: () => Promise.resolve({ rows: [] }),
    delete: () => ({
```

- [ ] **Step 2: Write the failing test**

Create `lib/api/domains/farm/useCases/__tests__/Delete.test.ts`:

```ts
/** deleteFarm: the Dono soft-deletes a farm that is not their last, and its convites go. */
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
import { DeleteFarmUseCase } from "../Delete.useCase";

const now = new Date("2026-09-13T18:00:00Z");

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.wheres = [];
});

describe("deleteFarm", () => {
  it("answers farm_not_found for a farm the caller has no live membership in", async () => {
    state.selectResults = [[{ farmId: 3, role: "owner" }, { farmId: 4, role: "owner" }]];
    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });
    expect(result).toBe("farm_not_found");
    expect(state.updates).toEqual([]);
  });

  it("refuses a member", async () => {
    state.selectResults = [[{ farmId: 9, role: "member" }, { farmId: 3, role: "owner" }]];
    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });
    expect(result).toBe("not_owner");
    expect(state.updates).toEqual([]);
  });

  it("refuses the last farm", async () => {
    state.selectResults = [[{ farmId: 9, role: "owner" }]];
    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });
    expect(result).toBe("last_farm");
    expect(state.updates).toEqual([]);
  });

  it("stamps the farm and cancels its pending convites", async () => {
    state.selectResults = [[{ farmId: 9, role: "owner" }, { farmId: 3, role: "member" }]];

    const result = await new DeleteFarmUseCase().run({ userId: "u-lucas", farmId: 9, now });

    expect(result).toBe("deleted");
    expect(state.updates).toEqual([{ deletedAt: now }, { status: "canceled", respondedAt: now }]);
    expect(renderSql(state.wheres[0] as SQL).sql).toContain('"farm"."deleted_at" is null');
    const invites = renderSql(state.wheres[2] as SQL);
    expect(invites.sql).toContain('"farm_invites"."status"');
    expect(invites.params).toEqual(expect.arrayContaining([9, "pending"]));
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/domains/farm/useCases/__tests__/Delete.test.ts`
Expected: FAIL, `Failed to resolve import "../Delete.useCase"`.

- [ ] **Step 4: Write the use case**

Create `lib/api/domains/farm/useCases/Delete.useCase.ts`:

```ts
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers } from "@/lib/db/schema";
import { deleteVerdict } from "@/lib/domain/farms";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteFarmUseCaseProps {
  userId: string;
  farmId: number;
  now: Date;
}

type DeleteFarmUseCaseResponse = "deleted" | "farm_not_found" | "not_owner" | "last_farm";

type CurrUseCase = _UseCase<DeleteFarmUseCaseProps, DeleteFarmUseCaseResponse>;

/**
 * Soft-deletes a farm its Dono no longer wants: `deleted_at` hides it from
 * every member at once, its rows stay for a mistake to be undone by hand, and
 * its pending convites are canceled so nobody joins a farm that is gone.
 *
 * The per-user advisory lock serializes the count: two tabs cannot each delete
 * one of the user's last two farms. A superuser gets no bypass here.
 */
export class DeleteFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, farmId, now }) => {
    return this.repository.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const live = await tx
        .select({ farmId: farmUsers.farmId, role: farmUsers.role })
        .from(farmUsers)
        .innerJoin(farm, eq(farm.id, farmUsers.farmId))
        .where(and(eq(farmUsers.userId, userId), isNull(farm.deletedAt)));

      const membership = live.find((row) => row.farmId === farmId);
      if (!membership) return "farm_not_found" as const;
      const verdict = deleteVerdict({ role: membership.role, liveFarmCount: live.length });
      if (verdict !== "ok") return verdict;

      await tx.update(farm).set({ deletedAt: now }).where(eq(farm.id, farmId));
      await tx
        .update(farmInvites)
        .set({ status: "canceled", respondedAt: now })
        .where(and(eq(farmInvites.farmId, farmId), eq(farmInvites.status, "pending")));
      return "deleted" as const;
    });
  };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/domains/farm/useCases/__tests__/Delete.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api`
Expected: PASS. The stub change is additive.

---

### Task 6: Routes `POST /farms` and `DELETE /farms/:id`

**Files:**
- Modify: `lib/api/domains/farm/schemas/farm.schema.ts`
- Modify: `lib/api/domains/farm/farm.controller.ts`
- Modify: `lib/api/permissions/routeRequirements.ts`

**Interfaces:**
- Consumes: `CreateFarmUseCase` (Task 4), `DeleteFarmUseCase` (Task 5).
- Produces (Eden client, used by Tasks 7 and 11):
  - `api.farms.post({ name: string; municipality: string; copyFromFarmId?: number })` resolves `{ farmId: number }`. Errors: 400 `{ error: "invalid_farm", problem }`, 403 `{ error: "not_a_member" }`.
  - `api.farms({ id }).delete()` resolves `{ id: number }`. Errors: 404 `{ error: "farm_not_found" }`, 403 `{ error: "not_owner" }`, 409 `{ error: "last_farm" }`.

- [ ] **Step 1: Body schema**

In `lib/api/domains/farm/schemas/farm.schema.ts`, append:

```ts

/**
 * Body of POST /farms: a new farm, optionally started from the open farm's
 * raças, categorias and protocolos. Trimming and limits are the use case's.
 */
export const NewFarmBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  copyFromFarmId: t.Optional(t.Integer()),
});
```

- [ ] **Step 2: Controller**

Replace the whole of `lib/api/domains/farm/farm.controller.ts` with:

```ts
/**
 * The farm itself — its registration data and saved map view — and the
 * account's farms: the list the switcher shows, a new farm, a deleted one.
 *
 * The singular /farm is the active farm's record and /farm/headquarters its
 * sede; the plural /farms belongs to the account. POST and DELETE /farms run
 * behind the session macro: creating needs no farm yet ("Criar minha fazenda"
 * on /convites), and deleting names its farm in the path, not in x-farm-id.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { sessionPlugin } from "@/lib/api/plugins/session";

import { BrowseFarmsUseCase } from "./useCases/Browse.useCase";
import { CreateFarmUseCase } from "./useCases/Create.useCase";
import { DeleteFarmUseCase } from "./useCases/Delete.useCase";
import { SaveFarmUseCase } from "./useCases/Save.useCase";
import { SaveHeadquartersUseCase } from "./useCases/SaveHeadquarters.useCase";
import { FarmDataBody, HeadquartersBody, NewFarmBody } from "./schemas/farm.schema";

export const farmController = new Elysia()
  .use(farmPlugin)
  .use(sessionPlugin)
  .put(
    "/farm",
    ({ farmId, body }) => new SaveFarmUseCase().run({ farmId, data: body }),
    { farm: true, body: FarmDataBody }
  )
  .put(
    "/farm/headquarters",
    ({ farmId, body }) =>
      new SaveHeadquartersUseCase().run({ farmId, headquarters: body.headquarters }),
    { farm: true, body: HeadquartersBody }
  )
  .get(
    "/farms",
    async ({ user, farmId, superuser }) => ({
      farms: await new BrowseFarmsUseCase().run({ userId: user.id, superuser }),
      activeFarmId: farmId,
    }),
    { farm: true }
  )
  .post(
    "/farms",
    async ({ user, body, status }) => {
      const result = await new CreateFarmUseCase().run({ userId: user.id, ...body });
      if (result === "not_a_member") return status(403, { error: result });
      if ("invalid" in result) {
        return status(400, { error: "invalid_farm", problem: result.invalid });
      }
      return result;
    },
    { session: true, body: NewFarmBody }
  )
  .delete(
    "/farms/:id",
    async ({ user, params, status }) => {
      const farmId = Number(params.id);
      const result = Number.isInteger(farmId)
        ? await new DeleteFarmUseCase().run({ userId: user.id, farmId, now: new Date() })
        : "farm_not_found";
      if (result === "farm_not_found") return status(404, { error: result });
      if (result === "not_owner") return status(403, { error: result });
      if (result === "last_farm") return status(409, { error: result });
      return { id: farmId };
    },
    { session: true }
  );
```

- [ ] **Step 3: Session-only list**

In `lib/api/permissions/routeRequirements.ts`, replace

```ts
  "POST /api/herd/farms",
];
```

with

```ts
  "POST /api/herd/farms",
  "DELETE /api/herd/farms/:id",
];
```

- [ ] **Step 4: Route tests and types**

Run: `pnpm exec vitest run --exclude '.claude/**' lib/api/__tests__`
Expected: PASS. `routeRequirements.test.ts` proves the new route is mounted and session-only; the pinned `ROUTE_REQUIREMENTS` snapshot does not change. If a route snapshot such as `routeTable.test.ts.snap` lists every mounted route and now fails only by the added `DELETE /api/herd/farms/:id` line, update it with `pnpm exec vitest run --exclude '.claude/**' -u <that test>` and check that the diff is exactly that line.

Run: `pnpm exec tsc --noEmit`
Expected: one error, in `components/invites/InvitesScreen.tsx`: `api.farms.post()` is now missing its body. Task 11 fixes it. Every other file is clean.

---

### Task 7: Store — `municipality`, `createFarm`, `deleteFarm`

**Files:**
- Modify: `lib/store/useHerdStore.ts`

**Interfaces:**
- Consumes: the routes of Task 6.
- Produces:
  - `FarmOption.municipality: string`
  - `export interface NewFarmInput { name: string; municipality: string; copy: boolean }`
  - `useHerdStore.getState().createFarm(input: NewFarmInput): Promise<number>` opens the new farm and throws after a toast when refused.
  - `useHerdStore.getState().deleteFarm(farmId: number): Promise<void>` throws after a toast when refused.

- [ ] **Step 1: Types**

Replace

```ts
export interface FarmOption {
  id: number;
  name: string;
  role: FarmRole;
```

with

```ts
export interface FarmOption {
  id: number;
  name: string;
  municipality: string;
  role: FarmRole;
```

Right after the closing `}` of `FarmOption`, add:

```ts

/** What the Nova fazenda dialog sends: `copy` starts it from the open farm's setup. */
export interface NewFarmInput {
  name: string;
  municipality: string;
  copy: boolean;
}
```

Replace

```ts
  /** Farms the user can access; the picker only renders with more than one. */
  farms: FarmOption[];
```

with

```ts
  /** Farms the user can access; the switcher lists them all, even just one. */
  farms: FarmOption[];
```

Replace

```ts
  /** Re-reads the farm list and the herd after the caller's access changed. */
  refreshAccess: () => Promise<void>;
```

with

```ts
  /** Re-reads the farm list and the herd after the caller's access changed. */
  refreshAccess: () => Promise<void>;
  /**
   * Creates a farm the caller owns, starting from the open farm's raças,
   * categorias and protocolos when `copy` is on, and opens it. Resolves the new
   * id; throws after a toast when the server refused.
   */
  createFarm: (input: NewFarmInput) => Promise<number>;
  /**
   * Deletes a farm the caller owns. When it was the open farm the store moves
   * to the default one; throws after a toast when the server refused.
   */
  deleteFarm: (farmId: number) => Promise<void>;
```

- [ ] **Step 2: Error copy**

Right above `/** Default repository; swap the implementation here to change the backend. */`, add:

```ts
/** What a refused DELETE /farms/:id tells the Dono. */
const DELETE_FARM_ERRORS: Record<string, string> = {
  farm_not_found: "Esta fazenda já foi excluída.",
  not_owner: "Só o dono pode excluir a fazenda.",
  last_farm: "Crie ou entre em outra fazenda antes de excluir esta.",
};
```

- [ ] **Step 3: Actions**

Replace

```ts
  switchFarm: async (farmId) => {
    if (farmId === get().activeFarmId) return;
    setActiveFarmId(farmId);
    set({ loaded: false });
    const data = await repository.load();
    set({ ...data, activeFarmId: farmId, loaded: true });
  },
```

with

```ts
  switchFarm: async (farmId) => {
    if (farmId === get().activeFarmId) return;
    setActiveFarmId(farmId);
    set({ loaded: false });
    const data = await repository.load();
    set({ ...data, activeFarmId: farmId, loaded: true });
  },

  createFarm: async ({ name, municipality, copy }) => {
    const source = get().activeFarmId;
    const { data, error } = await api.farms.post({
      name,
      municipality,
      copyFromFarmId: copy && source !== null ? source : undefined,
    });
    if (error || !data) {
      toast.error("Não foi possível criar a fazenda.");
      throw new Error(`create farm failed (status ${error?.status})`);
    }
    setActiveFarmId(data.farmId);
    set({ loaded: false });
    const [herd, farmsRes] = await Promise.all([repository.load(), api.farms.get()]);
    set({
      ...herd,
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: data.farmId,
      loaded: true,
    });
    return data.farmId;
  },

  deleteFarm: async (farmId) => {
    const { error } = await api.farms({ id: farmId }).delete();
    if (error) {
      const code = (error.value as { error?: string } | null | undefined)?.error ?? "";
      toast.error(DELETE_FARM_ERRORS[code] ?? "Não foi possível excluir a fazenda.");
      if (code === "farm_not_found") await get().refreshAccess();
      throw new Error(`delete farm failed (status ${error.status})`);
    }
    // Without a stored choice the server answers with the default farm, and
    // refreshAccess takes the herd and the list from there.
    if (farmId === get().activeFarmId) clearActiveFarmId();
    await get().refreshAccess();
  },
```

- [ ] **Step 4: Types**

Run: `pnpm exec tsc --noEmit`
Expected: only the `InvitesScreen.tsx` error from Task 6.

---

### Task 8: `NewFarmDialog` and `useNewFarm`

**Files:**
- Create: `components/farms/NewFarmDialog.tsx`
- Create: `components/farms/useNewFarm.ts`

**Interfaces:**
- Consumes: `validateNewFarm`, `FARM_FIELD_MAX`, `copySummary`, `farmLabel` (Task 1); `NewFarmInput`, `createFarm` (Task 7).
- Produces:
  - `NEW_FARM_DESCRIPTION: string` and `FIRST_FARM_DESCRIPTION: string`
  - `interface CopySource { label: string; summary: string; defaultOn: boolean }`
  - `<NewFarmDialog open onOpenChange source description onSubmit />`, where `onSubmit: (input: NewFarmInput) => Promise<void>`; a rejection keeps the dialog open.
  - `useNewFarm(): { source: CopySource | null; description: string; onSubmit: (input: NewFarmInput) => Promise<void> }`

- [ ] **Step 1: The dialog**

Create `components/farms/NewFarmDialog.tsx`:

```tsx
"use client";

/**
 * "Nova fazenda": nome and município, and — when the open farm has any — the
 * switch that starts the new farm from its raças, categorias and protocolos.
 * The form mounts with each opening, so every time it starts empty.
 */
import { useState, type FormEvent } from "react";
import { FARM_FIELD_MAX, validateNewFarm } from "@/lib/domain/farms";
import type { NewFarmInput } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const NEW_FARM_DESCRIPTION =
  "Você será o dono. A equipe desta fazenda não vai junto: convide quem precisar depois, em Configurações > Equipe.";

export const FIRST_FARM_DESCRIPTION =
  "Você será o dono. Depois é só convidar a equipe em Configurações > Equipe.";

/** The open farm's setup, offered to the new farm. */
export interface CopySource {
  /** farmLabel of the open farm. */
  label: string;
  /** copySummary of what it holds. */
  summary: string;
  /** On for the Dono of the open farm. */
  defaultOn: boolean;
}

export interface NewFarmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null where there is nothing to copy from (/convites, an empty open farm). */
  source: CopySource | null;
  description: string;
  /** Saves the farm; a rejection keeps the dialog open with the fields as typed. */
  onSubmit: (input: NewFarmInput) => Promise<void>;
}

export function NewFarmDialog({ open, onOpenChange, source, description, onSubmit }: NewFarmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <NewFarmForm
          source={source}
          description={description}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface NewFarmFormProps extends Pick<NewFarmDialogProps, "source" | "description" | "onSubmit"> {
  onCancel: () => void;
}

function NewFarmForm({ source, description, onSubmit, onCancel }: NewFarmFormProps) {
  const [name, setName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [copy, setCopy] = useState(source?.defaultOn ?? false);
  const [busy, setBusy] = useState(false);
  const ready = validateNewFarm({ name, municipality }).ok;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name, municipality, copy: source !== null && copy });
    } catch {
      // The store already said why in a toast; the fields stay as typed.
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova fazenda</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="new-farm-name">Nome</Label>
          <Input
            id="new-farm-name"
            autoFocus
            autoComplete="off"
            maxLength={FARM_FIELD_MAX}
            placeholder="Ex.: Fazenda Boa Vista"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="new-farm-municipality">Município</Label>
          <Input
            id="new-farm-municipality"
            autoComplete="off"
            maxLength={FARM_FIELD_MAX}
            placeholder="Ex.: Sorriso - MT"
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            className="min-h-11"
          />
        </div>

        {source ? (
          <label
            htmlFor="new-farm-copy"
            className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-3"
          >
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-sm font-medium text-ink">Usar o cadastro da {source.label}</span>
              <span className="text-xs text-pretty text-ink-soft">
                {source.summary} Animais, lotes, invernadas, touros e equipe não vêm junto.
              </span>
            </span>
            <Switch id="new-farm-copy" checked={copy} onCheckedChange={setCopy} className="mt-0.5" />
          </label>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11" disabled={!ready || busy}>
            Criar fazenda
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
```

- [ ] **Step 2: The store wiring**

Create `components/farms/useNewFarm.ts`:

```ts
"use client";

/**
 * Everything the Nova fazenda dialog needs inside the app: the open farm's
 * setup to offer, and a submit that creates the farm, opens its Painel and says
 * so. /convites wires the dialog by hand instead — no herd store runs there.
 */
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { copySummary, farmLabel } from "@/lib/domain/farms";
import { useHerdStore, type NewFarmInput } from "@/lib/store/useHerdStore";
import { NEW_FARM_DESCRIPTION, type CopySource } from "@/components/farms/NewFarmDialog";

export function useNewFarm(): {
  source: CopySource | null;
  description: string;
  onSubmit: (input: NewFarmInput) => Promise<void>;
} {
  const router = useRouter();
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const breeds = useHerdStore((s) => s.breeds.length);
  const categories = useHerdStore((s) => s.customCategories.length);
  const protocols = useHerdStore((s) => s.protocols.length);
  const createFarm = useHerdStore((s) => s.createFarm);

  const active = farms.find((farm) => farm.id === activeFarmId);
  const summary = copySummary({ breeds, categories, protocols });
  const source =
    active && summary
      ? { label: farmLabel(active), summary, defaultOn: active.role === "owner" }
      : null;

  async function onSubmit(input: NewFarmInput) {
    await createFarm(input);
    toast.success(`${input.name.trim()} criada`);
    router.push("/dashboard");
  }

  return { source, description: NEW_FARM_DESCRIPTION, onSubmit };
}
```

- [ ] **Step 3: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: only the `InvitesScreen.tsx` error from Task 6.

Run: `pnpm lint --ignore-pattern '.claude/**'`
Expected: clean.

---

### Task 9: `FarmSwitcher` in the rail and in "Mais"

**Files:**
- Create: `components/farms/FarmSwitcher.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/MobileTabBar.tsx`

**Interfaces:**
- Consumes: `farmLabel` (Task 1); `FarmOption.municipality` (Task 7); `NewFarmDialog`, `useNewFarm` (Task 8).
- Produces: `<FarmSwitcher variant="rail" | "field" id? onNavigate? />`.

- [ ] **Step 1: The switcher**

Create `components/farms/FarmSwitcher.tsx`:

```tsx
"use client";

/**
 * The farm switcher of the rail and of the phone's "Mais": every farm of the
 * account with the caller's role and município, then "Nova fazenda" and
 * "Gerenciar fazendas". It shows even with a single farm — it is the way in to
 * a second one. A Radix Select cannot hold those two action rows, hence a menu.
 */
import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, Settings2, Tractor } from "lucide-react";
import { farmLabel } from "@/lib/domain/farms";
import { roleLabel } from "@/lib/domain/permissions";
import { useHerdStore, type NewFarmInput } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewFarmDialog } from "@/components/farms/NewFarmDialog";
import { useNewFarm } from "@/components/farms/useNewFarm";

interface FarmSwitcherProps {
  /** "rail": the green sidebar trigger. "field": the 44px field inside "Mais". */
  variant: "rail" | "field";
  /** For a Label's htmlFor. */
  id?: string;
  /** Runs once the user has gone somewhere, so "Mais" can close itself. */
  onNavigate?: () => void;
}

const TRIGGER_CLASS: Record<FarmSwitcherProps["variant"], string> = {
  rail: "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-sidebar-line/60 bg-sidebar-hover py-2 pr-2 pl-2.5 text-sm text-sidebar-ink outline-none focus-visible:ring-3 focus-visible:ring-sidebar-active/35",
  field:
    "flex min-h-11 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
};

export function FarmSwitcher({ variant, id, onNavigate }: FarmSwitcherProps) {
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const [creating, setCreating] = useState(false);
  const newFarm = useNewFarm();
  const active = farms.find((farm) => farm.id === activeFarmId);

  // "Nova fazenda" opens over "Mais", so "Mais" closes only once the farm exists.
  async function create(input: NewFarmInput) {
    await newFarm.onSubmit(input);
    onNavigate?.();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          id={id}
          aria-label={variant === "rail" ? "Selecionar fazenda" : undefined}
          className={TRIGGER_CLASS[variant]}
        >
          {/* One flex child so justify-between only separates it from the chevron. */}
          <span className="flex min-w-0 items-center gap-2">
            <Tractor className={cn("size-4 shrink-0", variant === "field" && "text-ink-soft")} aria-hidden />
            <span className="truncate">{active ? farmLabel(active) : "Fazenda"}</span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0",
              variant === "rail" ? "text-sidebar-ink-soft" : "text-muted-foreground"
            )}
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64">
          {farms.map((farm) => {
            const open = farm.id === activeFarmId;
            const place = farm.municipality.trim();
            return (
              <DropdownMenuItem
                key={farm.id}
                className="py-1.5"
                onSelect={() => {
                  onNavigate?.();
                  void switchFarm(farm.id);
                }}
              >
                {open ? (
                  <Check className="text-brand!" aria-hidden />
                ) : (
                  <span className="size-4 shrink-0" aria-hidden />
                )}
                <span className="grid min-w-0">
                  <span className={cn("truncate", open && "font-medium")}>{farmLabel(farm)}</span>
                  <span className="truncate text-xs text-ink-soft">
                    {roleLabel(farm.role, farm.preset)}
                    {place ? ` · ${place}` : ""}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus aria-hidden />
            Nova fazenda
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/fazendas" onClick={onNavigate}>
              <Settings2 aria-hidden />
              Gerenciar fazendas
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewFarmDialog
        open={creating}
        onOpenChange={setCreating}
        source={newFarm.source}
        description={newFarm.description}
        onSubmit={create}
      />
    </>
  );
}
```

- [ ] **Step 2: The rail**

In `components/layout/Sidebar.tsx`:

Replace `import { LogOut, Tractor } from "lucide-react";` with `import { LogOut } from "lucide-react";`.

Replace

```tsx
import { NELORE_HEAD_VIEWBOX, NeloreMark } from "@/components/ui/nelore-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

with

```tsx
import { NELORE_HEAD_VIEWBOX, NeloreMark } from "@/components/ui/nelore-mark";
import { FarmSwitcher } from "@/components/farms/FarmSwitcher";
```

Replace

```tsx
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const pendingInvites = useHerdStore((s) => s.pendingInvites);
```

with

```tsx
  const pendingInvites = useHerdStore((s) => s.pendingInvites);
```

Replace the whole block from `{farms.length > 1 && (` down to its closing `)}` (the `<div className="px-2.5 pb-3">` holding the `<Select>`) with:

```tsx
      <div className="px-2.5 pb-3">
        <FarmSwitcher variant="rail" />
      </div>
```

- [ ] **Step 3: "Mais" on the phone**

In `components/layout/MobileTabBar.tsx`:

Delete the import block

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

and add `import { FarmSwitcher } from "@/components/farms/FarmSwitcher";` after `import { Label } from "@/components/ui/label";`.

Replace

```tsx
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);
```

with

```tsx
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);
```

Replace the whole block from `{/* The sidebar's switcher, for the phone: a vaqueiro may belong to two farms. */}` through the `) : null}` that closes `{farms.length > 1 ? (` with:

```tsx
            {/* The sidebar's switcher, for the phone, with the same Nova fazenda and Gerenciar fazendas. */}
            <div className="grid gap-1.5 border-b border-hairline pb-3">
              <Label htmlFor="mobile-farm">Fazenda</Label>
              <FarmSwitcher variant="field" id="mobile-farm" onNavigate={() => setMoreOpen(false)} />
              {activeFarm ? (
                <p className="text-xs text-ink-soft">
                  Você é {roleLabel(activeFarm.role, activeFarm.preset)} nesta fazenda
                </p>
              ) : null}
            </div>
```

- [ ] **Step 4: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: only the `InvitesScreen.tsx` error from Task 6.

Run: `pnpm lint --ignore-pattern '.claude/**'`
Expected: clean. In particular there must be no unused `farms`, `switchFarm`, `Tractor` or `Select` imports left behind.

---

### Task 10: Configurações > Fazendas

**Files:**
- Modify: `lib/nav.ts`, `lib/__tests__/nav.test.ts`
- Create: `app/(app)/settings/fazendas/page.tsx`
- Create: `components/farms/FarmsPage.tsx`
- Create: `components/farms/DeleteFarmDialog.tsx`

**Interfaces:**
- Consumes: `farmLabel`, `deleteVerdict`, `confirmsFarmName` (Task 1); `FarmOption`, `deleteFarm`, `switchFarm` (Task 7); `NewFarmDialog`, `useNewFarm` (Task 8).
- Produces: the `/settings/fazendas` route and nav child.

- [ ] **Step 1: Update the nav tests first**

In `lib/__tests__/nav.test.ts`, replace

```ts
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
    ]);
```

with

```ts
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
    ]);
```

and replace

```ts
    expect(items.find((item) => item.href === "/settings")?.children).toBeUndefined();
```

with

```ts
    // Fazendas belongs to the account, not to the open farm: nobody is gated out.
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Fazendas", href: "/settings/fazendas" },
    ]);
```

Run: `pnpm exec vitest run --exclude '.claude/**' lib/__tests__/nav.test.ts`
Expected: FAIL in both tests.

- [ ] **Step 2: The nav child**

In `lib/nav.ts`, replace

```ts
    children: [{ label: "Equipe", href: "/settings/equipe", area: "team" }],
```

with

```ts
    children: [
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
    ],
```

Run: `pnpm exec vitest run --exclude '.claude/**' lib/__tests__/nav.test.ts`
Expected: PASS.

- [ ] **Step 3: Read the page convention**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and check that a default-exported component with no props is still a valid page in this version.

- [ ] **Step 4: The delete dialog**

Create `components/farms/DeleteFarmDialog.tsx`:

```tsx
"use client";

/**
 * "Excluir {fazenda}?": the Dono types the farm's name to confirm. The farm
 * disappears for everyone at once; the rows stay for a mistake to be undone.
 */
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmsFarmName, farmLabel } from "@/lib/domain/farms";
import { useHerdStore, type FarmOption } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteFarmDialogProps {
  /** The farm to delete; null keeps the dialog closed. */
  farm: FarmOption | null;
  onClose: () => void;
}

export function DeleteFarmDialog({ farm, onClose }: DeleteFarmDialogProps) {
  return (
    <Dialog open={farm !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        {farm ? <DeleteFarmForm farm={farm} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteFarmForm({ farm, onDone }: { farm: FarmOption; onDone: () => void }) {
  const deleteFarm = useHerdStore((s) => s.deleteFarm);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const label = farmLabel(farm);
  const confirmed = confirmsFarmName(typed, label);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await deleteFarm(farm.id);
      toast.success(`${label} excluída`);
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir {label}?</DialogTitle>
        <DialogDescription>
          O rebanho, os manejos e o financeiro desta fazenda deixam de aparecer para todos. Quem é
          da equipe perde o acesso na hora e os convites pendentes são cancelados.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="delete-farm-name">Digite {label} para confirmar</Label>
          <Input
            id="delete-farm-name"
            autoFocus
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-11"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" className="min-h-11" disabled={!confirmed || busy}>
            <Trash2 aria-hidden />
            Excluir fazenda
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
```

- [ ] **Step 5: The page component**

Create `components/farms/FarmsPage.tsx`:

```tsx
"use client";

/**
 * /settings/fazendas: the account's farms rather than the open farm's data, so
 * no area gates it. Each row opens its farm; the Dono's rows also delete.
 */
import { useState } from "react";
import { Ellipsis, Info, Plus, Tractor, Trash2 } from "lucide-react";
import { deleteVerdict, farmLabel } from "@/lib/domain/farms";
import { formatInstantDate } from "@/lib/domain/invites";
import { useHerdStore, type FarmOption } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { RoleBadge } from "@/components/team/RoleBadge";
import { DeleteFarmDialog } from "@/components/farms/DeleteFarmDialog";
import { NewFarmDialog } from "@/components/farms/NewFarmDialog";
import { useNewFarm } from "@/components/farms/useNewFarm";

export function FarmsPage() {
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<FarmOption | null>(null);
  const newFarm = useNewFarm();
  // A superuser also lists farms they do not belong to (joinedAt null); only
  // memberships count toward "the last farm", as on the server.
  const liveFarmCount = farms.filter((farm) => farm.joinedAt !== null).length;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Fazendas"
          subtitle="As fazendas em que você trabalha e o seu papel em cada uma"
          actions={
            <Button className="min-h-11 w-full sm:w-auto" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nova fazenda
            </Button>
          }
        />

        <SectionCard title={`Suas fazendas (${farms.length})`}>
          <ul className="-m-4 divide-y divide-hairline">
            {farms.map((farm) => (
              <FarmRow
                key={farm.id}
                farm={farm}
                open={farm.id === activeFarmId}
                liveFarmCount={liveFarmCount}
                onOpen={() => void switchFarm(farm.id)}
                onDelete={() => setDeleting(farm)}
              />
            ))}
          </ul>
        </SectionCard>

        <p className="flex gap-1.5 text-xs text-ink-soft">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          Para sair de uma fazenda em que você não é dono, abra a fazenda e vá em Configurações &gt; Sua
          participação.
        </p>
      </div>

      <NewFarmDialog open={creating} onOpenChange={setCreating} {...newFarm} />
      <DeleteFarmDialog farm={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

interface FarmRowProps {
  farm: FarmOption;
  open: boolean;
  liveFarmCount: number;
  onOpen: () => void;
  onDelete: () => void;
}

function FarmRow({ farm, open, liveFarmCount, onOpen, onDelete }: FarmRowProps) {
  const label = farmLabel(farm);
  const owned = farm.role === "owner" && farm.joinedAt !== null;
  const verdict = deleteVerdict({ role: farm.role, liveFarmCount });

  return (
    <li className="flex items-center gap-3 px-4 py-3 md:gap-4">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft md:size-8"
      >
        <Tractor className="size-4 text-brand" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 md:w-60 md:shrink-0">
          <p className="truncate text-sm font-medium text-ink">{label}</p>
          {farm.municipality.trim() ? (
            <p className="truncate text-xs text-ink-soft">{farm.municipality}</p>
          ) : null}
        </div>
        {/* Phone: the pill takes the place of "desde". Desktop: "desde" stays and the pill gets its own column. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:flex-1 md:flex-col md:items-start">
          <RoleBadge role={farm.role} preset={farm.preset} />
          {open ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-healthy-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-healthy md:hidden">
              <StatusDot status="healthy" className="size-1.5" />
              Aberta agora
            </span>
          ) : null}
          {farm.joinedAt ? (
            <span className={cn("text-xs text-ink-soft", open && "hidden md:inline")}>
              desde {formatInstantDate(farm.joinedAt)}
            </span>
          ) : null}
        </div>
        {open ? (
          <span className="hidden items-center gap-1.5 rounded-md bg-healthy-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-healthy md:inline-flex">
            <StatusDot status="healthy" className="size-1.5" />
            Aberta agora
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {open ? null : (
          <Button type="button" variant="outline" className="min-h-11 md:min-h-0" onClick={onOpen}>
            Abrir
          </Button>
        )}
        {owned ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações da ${label}`}
                className="min-h-11 min-w-11 text-ink-soft hover:text-ink md:min-h-8 md:min-w-8"
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuItem variant="destructive" disabled={verdict !== "ok"} onSelect={onDelete}>
                <Trash2 aria-hidden />
                Excluir fazenda
              </DropdownMenuItem>
              {verdict === "last_farm" ? (
                <p className="px-2 pb-1.5 pl-[34px] text-xs text-pretty text-ink-soft">
                  Crie ou entre em outra fazenda antes de excluir esta.
                </p>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}
```

- [ ] **Step 6: The route**

Create `app/(app)/settings/fazendas/page.tsx`:

```tsx
import { FarmsPage } from "@/components/farms/FarmsPage";

/** /settings/fazendas: every farm of the account, to open, create or delete. */
export default function FarmsSettingsPage() {
  return <FarmsPage />;
}
```

- [ ] **Step 7: Types, lint, tests**

Run: `pnpm exec tsc --noEmit`
Expected: only the `InvitesScreen.tsx` error from Task 6.

Run: `pnpm lint --ignore-pattern '.claude/**'`
Expected: clean.

---

### Task 11: Primeiros passos, `/convites` and `farmLabel` everywhere

**Files:**
- Create: `components/dashboard/FirstStepsCard.tsx`
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `components/invites/InvitesScreen.tsx`
- Modify: `components/invites/InviteCard.tsx`, `components/invites/PendingInviteBanner.tsx`, `components/settings/MembershipCard.tsx`

**Interfaces:**
- Consumes: `firstSteps`, `showFirstSteps`, `farmLabel` (Task 1); `stepHref` (`lib/domain/mapSetup.ts`); `NewFarmDialog`, `FIRST_FARM_DESCRIPTION` (Task 8); `NewFarmInput` (Task 7).

- [ ] **Step 1: The card**

Create `components/dashboard/FirstStepsCard.tsx`:

```tsx
"use client";

/**
 * Primeiros passos: what a farm with no animal still needs, at the top of the
 * Painel. Each step is done because the data says so, and the card is gone with
 * the first animal — a farm that already has a herd never sees it.
 */
import Link from "next/link";
import { ArrowRight, Check, MapIcon, Plus, type LucideIcon } from "lucide-react";
import { firstSteps, showFirstSteps, type FirstStepId } from "@/lib/domain/farms";
import { stepHref } from "@/lib/domain/mapSetup";
import { can } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";

interface StepCopy {
  title: string;
  hint: string;
  action: string;
  href: string;
  icon: LucideIcon;
  /** The area whose Editar the action needs. */
  area: "lots" | "herd";
  primary?: boolean;
}

const STEPS: Record<FirstStepId, StepCopy> = {
  headquarters: {
    title: "Marque a sede no mapa",
    hint: "O mapa passa a abrir direto na fazenda.",
    action: "Abrir o mapa",
    href: stepHref({ kind: "headquarters" }),
    icon: MapIcon,
    area: "lots",
  },
  invernada: {
    title: "Cadastre as invernadas",
    hint: "Desenhe cada cerca e dê um código ao pasto.",
    action: "Cadastrar invernada",
    href: stepHref({ kind: "first-invernada" }),
    icon: Plus,
    area: "lots",
  },
  animal: {
    title: "Cadastre os animais",
    hint: "Um a um, vários de um padrão ou pela planilha.",
    action: "Ir para o Rebanho",
    href: "/herd",
    icon: ArrowRight,
    area: "herd",
    primary: true,
  },
};

export function FirstStepsCard() {
  const farm = useHerdStore((s) => s.farm);
  const invernadas = useHerdStore((s) => s.invernadas);
  const animals = useHerdStore((s) => s.animals);
  const permissions = useActivePermissions();

  if (!showFirstSteps(animals)) return null;
  if (!can(permissions, "lots", "edit") && !can(permissions, "herd", "edit")) return null;

  const steps = firstSteps(farm, invernadas, animals);
  const done = steps.filter((step) => step.done).length;

  return (
    <SectionCard title={`Primeiros passos (${done} de ${steps.length})`}>
      <ol className="grid gap-5 md:grid-cols-3 md:gap-6">
        {steps.map((step, index) => {
          const copy = STEPS[step.id];
          return (
            <li key={step.id} className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                {step.done ? (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-healthy-soft"
                  >
                    <Check className="size-3.5 text-healthy" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-panel font-mono text-xs text-ink-soft"
                  >
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", step.done ? "text-ink-soft" : "text-ink")}>
                    {copy.title}
                  </p>
                  <p className="mt-0.5 text-xs text-pretty text-ink-soft">{copy.hint}</p>
                </div>
              </div>
              <div className="pl-[34px]">
                {step.done ? (
                  <span className="text-[13px] font-medium text-healthy">Feito</span>
                ) : can(permissions, copy.area, "edit") ? (
                  <Button
                    asChild
                    variant={copy.primary ? "default" : "outline"}
                    className="min-h-11 w-full md:min-h-0 md:w-auto"
                  >
                    <Link href={copy.href}>
                      <copy.icon aria-hidden />
                      {copy.action}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
```

- [ ] **Step 2: The Painel**

In `app/(app)/dashboard/page.tsx`:

Replace

```tsx
import { PendingInviteBanner } from "@/components/invites/PendingInviteBanner";
```

with

```tsx
import { PendingInviteBanner } from "@/components/invites/PendingInviteBanner";
import { FirstStepsCard } from "@/components/dashboard/FirstStepsCard";
```

Replace

```tsx
      <PageHeader title="Painel" subtitle={`${farm.name} · ${farm.municipality}`} />

      <PendingInviteBanner />
```

with

```tsx
      <PageHeader
        title="Painel"
        subtitle={[farm.name, farm.municipality].filter((part) => part.trim() !== "").join(" · ")}
      />

      <PendingInviteBanner />

      <FirstStepsCard />
```

- [ ] **Step 3: `/convites`**

In `components/invites/InvitesScreen.tsx`:

Replace

```tsx
import type { MyInvites } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import { useSignOut } from "@/lib/auth/navigation";
```

with

```tsx
import type { MyInvites } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import { useSignOut } from "@/lib/auth/navigation";
import { farmLabel } from "@/lib/domain/farms";
import type { NewFarmInput } from "@/lib/store/useHerdStore";
import { FIRST_FARM_DESCRIPTION, NewFarmDialog } from "@/components/farms/NewFarmDialog";
```

Replace

```tsx
  const [busy, setBusy] = useState(false);
```

with

```tsx
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
```

Replace the whole `createFarm` function

```tsx
  async function createFarm() {
    setBusy(true);
    const { data, error } = await api.farms.post();
    if (error || !data) {
      setBusy(false);
      toast.error("Não foi possível criar a fazenda.");
      return;
    }
    enter(data.farmId);
  }
```

with

```tsx
  // No herd store runs here: the new farm is stored as active and the app reloads into it.
  async function createFarm(input: NewFarmInput) {
    const { data, error } = await api.farms.post({
      name: input.name,
      municipality: input.municipality,
    });
    if (error || !data) {
      toast.error("Não foi possível criar a fazenda.");
      throw new Error(`create farm failed (status ${error?.status})`);
    }
    enter(data.farmId);
  }
```

Replace

```tsx
                onDecline={() => decline(invite.id, invite.farmName.trim() || `Fazenda #${invite.farmId}`)}
```

with

```tsx
                onDecline={() => decline(invite.id, farmLabel({ id: invite.farmId, name: invite.farmName }))}
```

Replace

```tsx
              <Button type="button" className="min-h-11 w-full" onClick={createFarm} disabled={busy}>
```

with

```tsx
              <Button type="button" className="min-h-11 w-full" onClick={() => setCreating(true)} disabled={busy}>
```

Replace the closing

```tsx
        </p>
      </div>
    </main>
  );
}
```

with

```tsx
        </p>
      </div>

      <NewFarmDialog
        open={creating}
        onOpenChange={setCreating}
        source={null}
        description={FIRST_FARM_DESCRIPTION}
        onSubmit={createFarm}
      />
    </main>
  );
}
```

- [ ] **Step 4: `farmLabel` in the remaining copies**

In `components/invites/InviteCard.tsx`, replace

```tsx
            {invite.farmName.trim() || `Fazenda #${invite.farmId}`}
```

with

```tsx
            {farmLabel({ id: invite.farmId, name: invite.farmName })}
```

and add `import { farmLabel } from "@/lib/domain/farms";` next to the file's other `@/lib` imports.

In `components/invites/PendingInviteBanner.tsx`, replace

```tsx
        const farmName = invite.farmName.trim() || `Fazenda #${invite.farmId}`;
```

with

```tsx
        const farmName = farmLabel({ id: invite.farmId, name: invite.farmName });
```

and add `import { farmLabel } from "@/lib/domain/farms";` after `import { api } from "@/lib/api/client";`.

In `components/settings/MembershipCard.tsx`, replace

```tsx
  const farmName = farm.name.trim() || `Fazenda #${farm.id}`;
```

with

```tsx
  const farmName = farmLabel(farm);
```

and add `import { farmLabel } from "@/lib/domain/farms";` after `import { clearActiveFarmId } from "@/lib/api/activeFarm";`.

Run: `grep -rn "Fazenda #" components lib app --include=*.tsx --include=*.ts | grep -v __tests__`
Expected: only `lib/domain/farms.ts`.

- [ ] **Step 5: Types, lint, all tests**

Run: `pnpm exec tsc --noEmit`
Expected: clean, with the Task 6 error gone.

Run: `pnpm lint --ignore-pattern '.claude/**'`
Expected: clean.

Run: `pnpm exec vitest run --exclude '.claude/**'`
Expected: PASS.

---

### Task 12: Roadmap, build and the running app

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Roadmap**

In `ROADMAP.md`, replace

```md
Ficou de fora: limite de usuários por plano, envio e verificação de e-mail,
transferência de dono, histórico de quem mudou o quê e criar uma segunda
fazenda.
```

with

```md
Desde 13/09/2026 a troca de fazenda também cria uma nova (nome, município e,
se quiser, as raças, categorias e protocolos da fazenda aberta), e
Configurações > Fazendas lista todas as fazendas da conta: o dono exclui a sua,
menos a última. A exclusão é lógica (`farm.deleted_at`) e some para todos na
hora. Uma fazenda sem animais mostra Primeiros passos no Painel.

Ficou de fora: limite de usuários e de fazendas por plano, envio e verificação
de e-mail, transferência de dono, histórico de quem mudou o quê, mover animais
entre fazendas e restaurar uma fazenda excluída pela tela.
```

- [ ] **Step 2: Full checks**

Run each and read the output:

```bash
pnpm exec vitest run --exclude '.claude/**'
pnpm exec tsc --noEmit
pnpm lint --ignore-pattern '.claude/**'
pnpm build
```

Expected: all pass. The build lists `/settings/fazendas` among the routes.

- [ ] **Step 3: An isolated database with the migration**

Do not migrate the shared dev volume. Instead:

```bash
docker run --rm -d --name meubov-smoke-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5441:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
sleep 3
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5441/meubov pnpm db:migrate
docker exec meubov-smoke-db psql -U meubov -c '\d farm' | grep deleted_at
```

Expected: the migration applies from zero, and `deleted_at | timestamp without time zone` is listed.

- [ ] **Step 4: Run the built app against it**

```bash
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5441/meubov BETTER_AUTH_URL=http://localhost:3011 pnpm exec next start -p 3011
```

Run it in the background, then probe it with `curl -s localhost:3011/api/auth/ok`. Create two throwaway users with `POST /api/auth/sign-up/email`: `teste.fazendas@meubov.local` and `teste.fazendas.membro@meubov.local`, both with password `VariasFazendas2026!`. Confirm each with a real `POST /api/auth/sign-in/email`. Then seed the first: `DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5441/meubov pnpm db:seed --email teste.fazendas@meubov.local`.

- [ ] **Step 5: Smoke checklist**

Use a headless Playwright script, per the smoke-test memory: `createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/")`, chromium at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, sign in on the browser context. Take a screenshot of each item into the scratchpad and look at it.

1. Desktop, Painel of the seeded farm: the rail switcher shows with one farm. The menu lists it with a check and "Dono · {município}", followed by "Nova fazenda" and "Gerenciar fazendas".
2. "Nova fazenda": Criar stays disabled until nome and município are filled. The switch reads "Usar o cadastro da {fazenda}" with the counts and is on. Create "Fazenda Boa Vista" / "Sorriso - MT". Expected result:
   - you land on `/dashboard`;
   - a "Fazenda Boa Vista criada" toast shows;
   - the subtitle reads "Fazenda Boa Vista · Sorriso - MT";
   - Primeiros passos shows "(0 de 3)" with three buttons;
   - Configurações lists the same raças, categorias and protocolos as the seeded farm, and Rebanho, Lotes and Mapa are empty.
3. Primeiros passos: "Abrir o mapa" opens `/map/setup/sede`. After saving a sede, the Painel shows step 1 as "Feito" and "(1 de 3)".
4. The switcher lists both farms, and choosing the seeded farm brings its herd back. Its Painel has no Primeiros passos.
5. `/settings/fazendas`:
   - both rows show, the open farm has "Aberta agora", and the other has "Abrir";
   - "Abrir" moves the pill to that row;
   - Configurações in the rail shows the "Fazendas" child as active.
6. As the Dono of Fazenda Boa Vista, open Configurações > Equipe and invite `teste.fazendas.membro@meubov.local` as Vaqueiro. In a second browser context, sign in as the member, accept on `/convites`, and see Fazenda Boa Vista open. Back as Dono, open `/settings/fazendas` and use "…" > "Excluir fazenda" on Boa Vista:
   - "Excluir fazenda" stays disabled until the name is typed, and "fazenda boa vista" in lower case enables it;
   - after deleting, the "Fazenda Boa Vista excluída" toast shows and the list has one row.

   Next, in the member's context, click anything that calls the API. Expected: the page reloads onto the member's own lazy farm, or onto `/convites`, and Boa Vista is gone from their switcher.
7. As Dono, with one farm left, "…" shows "Excluir fazenda" disabled, with "Crie ou entre em outra fazenda antes de excluir esta." under it.
8. Phone viewport (390×844):
   - "Mais" shows the Fazenda field;
   - the menu has 44px rows and "Nova fazenda" opens the dialog with a stacked footer;
   - `/settings/fazendas` rows stack without horizontal scroll.
9. A third fresh user, `teste.fazendas.novo@meubov.local`, not seeded: invite them from the Dono's farm, then decline on `/convites`. "Criar minha fazenda" opens the dialog without the switch and with the `/convites` description. Creating one enters its Painel.

Fix anything that differs and re-run the affected checks.

- [ ] **Step 6: Clean up**

Stop the `next start` process by its pid (`ss -ltnp | grep 3011`), then `docker rm -f meubov-smoke-db`.

- [ ] **Step 7: Hand off**

Report which checks passed and paste any failure verbatim. Then offer the finishing menu. The commit is one `feat(farms): ...` commit with the spec and this plan, and no trailers.
