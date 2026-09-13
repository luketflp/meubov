# Equipe e permissões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a farm's Dono invite people by e-mail, give each member a level (Nada, Ver, Editar) per area, and enforce those levels on every API route and in the UI, money included.

**Architecture:** All rules are pure functions in `lib/domain/permissions.ts`, `lib/domain/moneyRedaction.ts` and `lib/domain/invites.ts`. The existing Elysia `farm` macro resolves the caller's levels from `farm_users` and checks each route against one table, `lib/api/permissions/routeRequirements.ts`. New team and invite controllers use the same use-case pattern as the other domains. The client reads the resolved levels from `GET /farms`, exposes `useCan(area, level)`, filters the nav and hides write controls.

**Tech Stack:** Next.js 16 (app router), Elysia 1.4 + Eden Treaty, Drizzle ORM on Postgres, Better Auth, Zustand, Vitest, Tailwind 4, shadcn/radix UI.

**Spec:** `docs/superpowers/specs/2026-09-12-equipe-permissoes-design.md` (read it first; this plan argues from it).

**Design canvas:** https://claude.ai/code/artifact/884b9d24-3779-49a9-8907-951f344a3490

## Global Constraints

- Work on `main`. No branch, no worktree. **Do not commit after each task**: the feature lands as one `feat(team): ...` commit at the very end, with the spec and this plan, only after the user picks "commit". No `Co-Authored-By` or session trailers.
- `AGENTS.md`: this Next.js has breaking changes. Before creating a new route file (`page.tsx`, `layout.tsx`), read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and `layout.md`.
- UI copy is pt-BR and must match the spec word for word. Code identifiers and comments are English, in the voice of the surrounding code.
- Area keys: `herd`, `manejo`, `reproduction`, `sanitary`, `lots`, `finance`, `farm`, `team`. Levels: `none`, `view`, `edit`. Presets: `gerente`, `vaqueiro`, `consultor`, plus `personalizado`.
- Floors: `view` for every area except `finance` and `team`, which may be `none`.
- Convites expire after 7 days. E-mails are `trim().toLowerCase()` before storing or comparing.
- Colors only through the palette tokens in `app/globals.css` (no loose hex in components).
- Commands: tests `pnpm test` (or `pnpm exec vitest run <path>`), types `pnpm exec tsc --noEmit`, lint `pnpm lint`.
- Test-first for the pure modules and the use cases. React components have no unit tests in this repo; they are checked in the running app (Task 19).
- Other sessions commit to `main` while this plan waits (five features landed while it was written, among them the Coberturas → Reprodução rename). Every "Replace" old string was checked against `main` at `f1fb6a4`; before applying one, confirm it still matches, and when it does not, apply the same intent to the current code rather than forcing the old text.

## File map

| file | responsibility |
| --- | --- |
| `lib/domain/permissions.ts` (+ `__tests__/permissions.test.ts`) | areas, levels, presets, parse/resolve, grant and manage rules, summaries, labels |
| `lib/domain/moneyRedaction.ts` (+ test) | strip BRL values, `valuesHidden`, money write rules, `canDeleteSession` |
| `lib/domain/invites.ts` (+ test) | e-mail normalization, expiry, convite state and date lines |
| `lib/types.ts` | `ManejoSession.valuesHidden` |
| `lib/db/schema.ts`, `drizzle/0014_farm-members-permissions.sql` | enums, `farm_users.preset/permissions`, `farm_invites` |
| `lib/api/permissions/routeRequirements.ts` (+ test) | route → requirement table, `checkRequirement`, `routeKey` |
| `lib/api/plugins/farm.ts` (+ test) | permissions on context, requirement check, `pending_invites` |
| `lib/api/plugins/session.ts` | session-only macro |
| `lib/api/domains/farm/*` | `PUT /farm` without sede, `PUT /farm/headquarters`, `POST /farms`, richer `/farms` |
| `lib/api/domains/herd/herd.controller.ts` | redaction on `GET /` |
| `lib/api/domains/manejo/manejo.controller.ts`, `useCases/Delete.useCase.ts` | money rules and response redaction |
| `lib/api/domains/team/**` | team routes and use cases |
| `lib/api/domains/invites/**` | invitee routes and use cases |
| `lib/api/app.ts` | mount the two new controllers |
| `lib/api/__tests__/dbStub.ts` | chainable db stub shared by the new use-case tests |
| `lib/api/__tests__/permissions.test.ts` | real routes through `herdApi` with mocked auth and db |
| `lib/store/useHerdStore.ts`, `lib/store/selectors.ts`, `lib/store/usePermissions.ts` | farm options, invites, access refresh, `apiFail`, hooks |
| `lib/repository/ApiHerdRepository.ts` | 409 → `/convites` |
| `lib/nav.ts` (+ test) | `area`, Equipe child, `visibleNav` |
| `components/layout/{Sidebar,MobileTabBar,ReadOnlyPill,NoAccess,RequireAccess}.tsx` | filtered nav, avatar dot, phone farm switcher, shared states |
| `components/team/*`, `app/(app)/settings/equipe/**` | Equipe page, convite dialog, permissions editor |
| `components/invites/*`, `app/convites/page.tsx` | invitee screen, Painel banner |
| `components/settings/MembershipCard.tsx`, `app/(app)/settings/page.tsx` | Sua participação |
| gated components (Tasks 15–18) | hide writes and money |
| `ROADMAP.md` | item 3 |

---

### Task 1: Permissions domain

**Files:**
- Create: `lib/domain/permissions.ts`
- Test: `lib/domain/__tests__/permissions.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `AREAS: readonly Area[]`, `LEVELS: readonly Level[]`, `PRESET_IDS: readonly PresetId[]`
  - `type Area`, `type Level`, `type Permissions = Record<Area, Level>`, `type FarmRole = "owner" | "member"`, `type PresetId`, `type MemberPreset = PresetId | "personalizado"`
  - `FLOORS`, `FULL_PERMISSIONS`, `PRESETS: Record<PresetId, Permissions>`
  - `AREA_LABEL`, `AREA_DESCRIPTION`, `LEVEL_LABEL`, `PRESET_LABEL: Record<MemberPreset, string>`
  - `atLeast(level, min): boolean`, `can(permissions, area, level): boolean`
  - `parsePermissions(value: unknown): Permissions`
  - `resolvePermissions(member: { role: FarmRole; permissions: unknown }, superuser: boolean): Permissions`
  - `presetFor(permissions): MemberPreset`, `closestPreset(permissions): PresetId`
  - `canGrant(actor: Permissions, next: Permissions): { ok: true } | { ok: false; area: Area }`
  - `type ManageBlock = "owner" | "self" | "above"`, `type ManageVerdict = { ok: true } | { ok: false; reason: ManageBlock }`
  - `canManage(actor: MemberFacts, target: MemberFacts): ManageVerdict` with `MemberFacts = { userId: string; role: FarmRole; permissions: Permissions }`
  - `accessGroups(permissions): { edit: Area[]; view: Area[]; none: Area[] }`, `joinPt(names: string[]): string`
  - `accessSummary(role: FarmRole, permissions): string`
  - `roleLabel(role: FarmRole, preset: MemberPreset | null): string`

- [ ] **Step 1: Write the failing test**

Create `lib/domain/__tests__/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FLOORS,
  FULL_PERMISSIONS,
  PRESETS,
  accessGroups,
  accessSummary,
  can,
  canGrant,
  canManage,
  closestPreset,
  joinPt,
  parsePermissions,
  presetFor,
  resolvePermissions,
  roleLabel,
  type Permissions,
} from "@/lib/domain/permissions";

const consultor = PRESETS.consultor;

describe("PRESETS", () => {
  it("holds the levels of the spec's table", () => {
    expect(PRESETS.gerente).toEqual(FULL_PERMISSIONS);
    expect(PRESETS.vaqueiro).toEqual({
      herd: "edit",
      manejo: "edit",
      reproduction: "edit",
      sanitary: "edit",
      lots: "edit",
      finance: "none",
      farm: "view",
      team: "none",
    });
    expect(PRESETS.consultor).toEqual({
      herd: "view",
      manejo: "view",
      reproduction: "view",
      sanitary: "view",
      lots: "view",
      finance: "view",
      farm: "view",
      team: "none",
    });
  });

  it("never sits below a floor", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(parsePermissions(preset)).toEqual(preset);
    }
  });
});

describe("parsePermissions", () => {
  it("fills a missing area with its floor", () => {
    expect(parsePermissions({ herd: "edit" })).toEqual({ ...FLOORS, herd: "edit" });
  });

  it("replaces an unknown value with the floor", () => {
    expect(parsePermissions({ finance: "admin", lots: 3 })).toEqual(FLOORS);
  });

  it("raises a level below the floor", () => {
    expect(parsePermissions({ herd: "none", finance: "none" })).toEqual(FLOORS);
  });

  it("reads null as the floors", () => {
    expect(parsePermissions(null)).toEqual(FLOORS);
  });
});

describe("resolvePermissions", () => {
  it("gives the Dono every area at edit", () => {
    expect(resolvePermissions({ role: "owner", permissions: null }, false)).toEqual(
      FULL_PERMISSIONS
    );
  });

  it("gives a superuser every area at edit", () => {
    expect(resolvePermissions({ role: "member", permissions: consultor }, true)).toEqual(
      FULL_PERMISSIONS
    );
  });

  it("parses a member's stored levels", () => {
    expect(resolvePermissions({ role: "member", permissions: consultor }, false)).toEqual(
      consultor
    );
  });
});

describe("can", () => {
  it("compares levels in order", () => {
    expect(can(consultor, "herd", "view")).toBe(true);
    expect(can(consultor, "herd", "edit")).toBe(false);
    expect(can(consultor, "team", "view")).toBe(false);
    expect(can(consultor, "team", "none")).toBe(true);
  });
});

describe("presetFor", () => {
  it("names a matching preset", () => {
    expect(presetFor(PRESETS.vaqueiro)).toBe("vaqueiro");
    expect(presetFor(FULL_PERMISSIONS)).toBe("gerente");
  });

  it("calls anything else personalizado", () => {
    expect(presetFor({ ...consultor, sanitary: "edit" })).toBe("personalizado");
  });
});

describe("closestPreset", () => {
  it("picks the preset with the fewest differing areas", () => {
    expect(closestPreset({ ...consultor, reproduction: "edit", sanitary: "edit" })).toBe(
      "consultor"
    );
    expect(closestPreset({ ...PRESETS.vaqueiro, farm: "edit" })).toBe("vaqueiro");
  });
});

describe("canGrant", () => {
  const marta: Permissions = { ...FULL_PERMISSIONS, finance: "view" };

  it("allows levels at or below the actor's", () => {
    expect(canGrant(marta, { ...PRESETS.vaqueiro, finance: "view" })).toEqual({ ok: true });
  });

  it("names the first area over the ceiling", () => {
    expect(canGrant(marta, PRESETS.gerente)).toEqual({ ok: false, area: "finance" });
  });
});

describe("canManage", () => {
  const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };
  const marta = {
    userId: "u-marta",
    role: "member" as const,
    permissions: { ...FULL_PERMISSIONS, finance: "view" as const },
  };
  const joao = { userId: "u-joao", role: "member" as const, permissions: PRESETS.vaqueiro };
  const roberto = { userId: "u-roberto", role: "member" as const, permissions: PRESETS.gerente };

  it("never manages the Dono", () => {
    expect(canManage(marta, owner)).toEqual({ ok: false, reason: "owner" });
  });

  it("never manages oneself", () => {
    expect(canManage(marta, marta)).toEqual({ ok: false, reason: "self" });
  });

  it("refuses a member holding more in any area", () => {
    expect(canManage(marta, roberto)).toEqual({ ok: false, reason: "above" });
  });

  it("manages a member at or below every level", () => {
    expect(canManage(marta, joao)).toEqual({ ok: true });
    expect(canManage(roberto, { ...roberto, userId: "u-other" })).toEqual({ ok: true });
  });

  it("lets the Dono manage anyone else", () => {
    expect(canManage(owner, roberto)).toEqual({ ok: true });
  });
});

describe("accessGroups", () => {
  it("splits the areas by level, in area order", () => {
    expect(accessGroups(PRESETS.vaqueiro)).toEqual({
      edit: ["herd", "manejo", "reproduction", "sanitary", "lots"],
      view: ["farm"],
      none: ["finance", "team"],
    });
  });
});

describe("joinPt", () => {
  it("joins with commas and a final e", () => {
    expect(joinPt(["Rebanho"])).toBe("Rebanho");
    expect(joinPt(["Rebanho", "Manejo"])).toBe("Rebanho e Manejo");
    expect(joinPt(["Rebanho", "Manejo", "Lotes e Mapa"])).toBe("Rebanho, Manejo e Lotes e Mapa");
  });
});

describe("accessSummary", () => {
  it("reads Acesso total for the Dono", () => {
    expect(accessSummary("owner", FULL_PERMISSIONS)).toBe("Acesso total");
  });

  it("reads Edita tudo when every area is at edit", () => {
    expect(accessSummary("member", PRESETS.gerente)).toBe("Edita tudo");
  });

  it("reads Vê tudo for a member who edits nothing", () => {
    expect(accessSummary("member", consultor)).toBe("Vê tudo · não edita");
  });

  it("names a hidden area on a viewer", () => {
    expect(accessSummary("member", { ...consultor, finance: "none" })).toBe(
      "Vê tudo · sem Financeiro"
    );
  });

  it("names one or two edited areas", () => {
    expect(
      accessSummary("member", { ...consultor, reproduction: "edit", sanitary: "edit" })
    ).toBe("Edita Reprodução e Sanitário · vê o resto");
  });

  it("counts more than two edited areas and names what is hidden", () => {
    expect(accessSummary("member", PRESETS.vaqueiro)).toBe("Edita 5 áreas · sem Financeiro");
    expect(accessSummary("member", { ...FULL_PERMISSIONS, finance: "view" })).toBe(
      "Edita 7 áreas"
    );
  });
});

describe("roleLabel", () => {
  it("reads Dono for the owner and the preset otherwise", () => {
    expect(roleLabel("owner", null)).toBe("Dono");
    expect(roleLabel("member", "vaqueiro")).toBe("Vaqueiro");
    expect(roleLabel("member", null)).toBe("Personalizado");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/domain/__tests__/permissions.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/domain/permissions"`.

- [ ] **Step 3: Write the implementation**

Create `lib/domain/permissions.ts`:

```ts
/**
 * Who may do what on a farm.
 *
 * A member holds one level per area; the Dono and superusers hold every area at
 * edit. Presets are named bundles of levels, and levels that match no preset are
 * "personalizado". Every area but Financeiro and Equipe has a floor of view:
 * the rest of the app hangs off animals and lotes, so hiding them breaks it.
 *
 * Pure and shared by the server (farm macro, team use cases) and the client
 * (useCan, the permissions editor).
 */

export const AREAS = [
  "herd",
  "manejo",
  "reproduction",
  "sanitary",
  "lots",
  "finance",
  "farm",
  "team",
] as const;
export type Area = (typeof AREAS)[number];

export const LEVELS = ["none", "view", "edit"] as const;
export type Level = (typeof LEVELS)[number];

export type Permissions = Record<Area, Level>;
export type FarmRole = "owner" | "member";

export const PRESET_IDS = ["gerente", "vaqueiro", "consultor"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export type MemberPreset = PresetId | "personalizado";

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2 };

/** The lowest level each area may hold. */
export const FLOORS: Permissions = {
  herd: "view",
  manejo: "view",
  reproduction: "view",
  sanitary: "view",
  lots: "view",
  finance: "none",
  farm: "view",
  team: "none",
};

export const FULL_PERMISSIONS: Permissions = {
  herd: "edit",
  manejo: "edit",
  reproduction: "edit",
  sanitary: "edit",
  lots: "edit",
  finance: "edit",
  farm: "edit",
  team: "edit",
};

export const PRESETS: Record<PresetId, Permissions> = {
  gerente: FULL_PERMISSIONS,
  vaqueiro: {
    herd: "edit",
    manejo: "edit",
    reproduction: "edit",
    sanitary: "edit",
    lots: "edit",
    finance: "none",
    farm: "view",
    team: "none",
  },
  consultor: {
    herd: "view",
    manejo: "view",
    reproduction: "view",
    sanitary: "view",
    lots: "view",
    finance: "view",
    farm: "view",
    team: "none",
  },
};

export const AREA_LABEL: Record<Area, string> = {
  herd: "Rebanho",
  manejo: "Manejo",
  reproduction: "Reprodução",
  sanitary: "Sanitário",
  lots: "Lotes e Mapa",
  finance: "Financeiro",
  farm: "Fazenda",
  team: "Equipe",
};

export const AREA_DESCRIPTION: Record<Area, string> = {
  herd: "Animais, pesagens, raças e categorias",
  manejo: "Sessões no brete, trocas de lote, vendas e entradas",
  reproduction: "Coberturas, diagnósticos e partos",
  sanitary: "Calendário, tratamentos e protocolos",
  lots: "Lotes, invernadas e a sede no mapa",
  finance: "Despesas e todos os valores em R$",
  farm: "Nome, município e responsável",
  team: "Membros, convites e permissões",
};

export const LEVEL_LABEL: Record<Level, string> = {
  none: "Nada",
  view: "Ver",
  edit: "Editar",
};

export const PRESET_LABEL: Record<MemberPreset, string> = {
  gerente: "Gerente",
  vaqueiro: "Vaqueiro",
  consultor: "Consultor",
  personalizado: "Personalizado",
};

export function atLeast(level: Level, min: Level): boolean {
  return RANK[level] >= RANK[min];
}

export function can(permissions: Permissions, area: Area, level: Level): boolean {
  return atLeast(permissions[area], level);
}

function isLevel(value: unknown): value is Level {
  return value === "none" || value === "view" || value === "edit";
}

/**
 * Stored or submitted levels as a complete, valid set: a missing or unknown
 * value becomes the area's floor, and a level below the floor is raised to it.
 */
export function parsePermissions(value: unknown): Permissions {
  const source =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const result = { ...FLOORS };
  for (const area of AREAS) {
    const raw = source[area];
    if (isLevel(raw) && atLeast(raw, FLOORS[area])) result[area] = raw;
  }
  return result;
}

/** The levels a membership grants: everything for the Dono and superusers. */
export function resolvePermissions(
  member: { role: FarmRole; permissions: unknown },
  superuser: boolean
): Permissions {
  if (superuser || member.role === "owner") return { ...FULL_PERMISSIONS };
  return parsePermissions(member.permissions);
}

function differences(a: Permissions, b: Permissions): number {
  return AREAS.filter((area) => a[area] !== b[area]).length;
}

export function presetFor(permissions: Permissions): MemberPreset {
  return PRESET_IDS.find((id) => differences(PRESETS[id], permissions) === 0) ?? "personalizado";
}

/** The preset a Personalizado member is nearest to; the first one wins a tie. */
export function closestPreset(permissions: Permissions): PresetId {
  let best: PresetId = PRESET_IDS[0];
  for (const id of PRESET_IDS) {
    if (differences(PRESETS[id], permissions) < differences(PRESETS[best], permissions)) {
      best = id;
    }
  }
  return best;
}

/** Nobody hands out more than they hold: every area of `next` at or below `actor`. */
export function canGrant(
  actor: Permissions,
  next: Permissions
): { ok: true } | { ok: false; area: Area } {
  const area = AREAS.find((key) => RANK[next[key]] > RANK[actor[key]]);
  return area === undefined ? { ok: true } : { ok: false, area };
}

export type ManageBlock = "owner" | "self" | "above";
export type ManageVerdict = { ok: true } | { ok: false; reason: ManageBlock };

export interface MemberFacts {
  userId: string;
  role: FarmRole;
  permissions: Permissions;
}

/**
 * Whether `actor` may change or remove `target`. The Dono is untouchable,
 * nobody edits themselves, and a member who holds more than the actor in any
 * area is out of reach. Equipe edit itself is the route's business.
 */
export function canManage(actor: MemberFacts, target: MemberFacts): ManageVerdict {
  if (target.role === "owner") return { ok: false, reason: "owner" };
  if (actor.userId === target.userId) return { ok: false, reason: "self" };
  if (actor.role === "owner") return { ok: true };
  const above = AREAS.some((area) => RANK[target.permissions[area]] > RANK[actor.permissions[area]]);
  return above ? { ok: false, reason: "above" } : { ok: true };
}

export function accessGroups(permissions: Permissions): {
  edit: Area[];
  view: Area[];
  none: Area[];
} {
  return {
    edit: AREAS.filter((area) => permissions[area] === "edit"),
    view: AREAS.filter((area) => permissions[area] === "view"),
    none: AREAS.filter((area) => permissions[area] === "none"),
  };
}

/** "A", "A e B", "A, B e C". */
export function joinPt(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

const labels = (areas: Area[]) => joinPt(areas.map((area) => AREA_LABEL[area]));

/**
 * The short line under a member's role on the Equipe page. Equipe at none is
 * the common case, so it is left out of the "sem …" tail.
 */
export function accessSummary(role: FarmRole, permissions: Permissions): string {
  if (role === "owner") return "Acesso total";
  const { edit, view, none } = accessGroups(permissions);
  const hidden = none.filter((area) => area !== "team");
  const without = hidden.length > 0 ? `sem ${labels(hidden)}` : null;

  if (edit.length === AREAS.length) return "Edita tudo";
  if (edit.length === 0) return `Vê tudo · ${without ?? "não edita"}`;
  if (edit.length > 2) {
    const head = `Edita ${edit.length} áreas`;
    return without ? `${head} · ${without}` : head;
  }
  const head = `Edita ${labels(edit)}`;
  if (view.length === 0) return without ? `${head} · ${without}` : head;
  return `${head} · ${without ? `vê o resto, ${without}` : "vê o resto"}`;
}

/** "Dono", or the preset's label ("Personalizado" when none was stored). */
export function roleLabel(role: FarmRole, preset: MemberPreset | null): string {
  return role === "owner" ? "Dono" : PRESET_LABEL[preset ?? "personalizado"];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/domain/__tests__/permissions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: No commit** (single commit at the end).

---

### Task 2: Money redaction domain

**Files:**
- Create: `lib/domain/moneyRedaction.ts`
- Modify: `lib/types.ts` (the `ManejoSession` interface)
- Test: `lib/domain/__tests__/moneyRedaction.test.ts`

**Interfaces:**
- Consumes: `can`, `type Permissions` from Task 1.
- Produces:
  - `ManejoSession.valuesHidden?: boolean`
  - `hasMoney(facts: { pricePerArroba?: number | null; totalAmountBrl?: number | null; planCostBrl?: number | null }): boolean`
  - `sessionHasMoney(session: ManejoSession): boolean`
  - `startNeedsFinance(body: { kind: ManejoKind; pricePerArroba?: number; totalAmountBrl?: number; treatment?: { costBrl?: number } }): boolean`
  - `canDeleteSession(permissions: Permissions, session: ManejoSession): boolean`
  - `redactTreatment(t: Treatment): Treatment`, `redactManejoSession(s: ManejoSession): ManejoSession`, `redactPass<T extends { entry: ManejoSessionAnimal; treatments: Treatment[] }>(r: T): T`, `redactHerdMoney(data: HerdData): HerdData`

- [ ] **Step 1: Add the type field**

In `lib/types.ts`, inside `export interface ManejoSession`, replace:

```ts
  /** Closed price in BRL: a sale sold as one lot, or an entry's purchase total. */
  totalAmountBrl?: number;
  notes?: string;
}
```

with:

```ts
  /** Closed price in BRL: a sale sold as one lot, or an entry's purchase total. */
  totalAmountBrl?: number;
  notes?: string;
  /**
   * Set by the server when it stripped the session's values for a member
   * without Financeiro, so "no price" and "a price you may not see" differ.
   */
  valuesHidden?: boolean;
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/domain/__tests__/moneyRedaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { HerdData, ManejoSession, Treatment } from "@/lib/types";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import {
  canDeleteSession,
  hasMoney,
  redactHerdMoney,
  redactManejoSession,
  redactPass,
  sessionHasMoney,
  startNeedsFinance,
} from "@/lib/domain/moneyRedaction";

const treatment: Treatment = {
  id: "t-1",
  animalEarTag: "BR-1",
  type: "vaccine",
  name: "Aftosa",
  date: "2026-09-01",
  status: "done",
  withdrawalDays: 0,
  costBrl: 4.5,
};

const sale: ManejoSession = {
  id: "s-1",
  name: "Venda",
  date: "2026-09-02",
  status: "closed",
  kind: "sale",
  weighing: true,
  animals: [
    { earTag: "BR-1", outcome: "done", weightKg: 500, amountBrl: 5300 },
    { earTag: "BR-2", outcome: "skipped" },
  ],
  pricePerArroba: 320,
  carcassYieldPct: 52,
};

const vaccination: ManejoSession = {
  id: "s-2",
  name: "Vacina",
  date: "2026-09-03",
  status: "open",
  kind: "health",
  weighing: false,
  animals: [{ earTag: "BR-1", outcome: "pending" }],
  treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0 },
};

const herd: HerdData = {
  animals: [],
  treatments: [treatment],
  lots: [],
  invernadas: [],
  lotPlacements: [],
  movements: [
    { id: "m-1", type: "sale", date: "2026-09-02", origin: "Fazenda", destination: "Frigorífico", amountBrl: 5300 },
  ],
  breeds: [],
  protocols: [],
  manejoSessions: [sale, vaccination],
  expenses: [{ id: "e-1", date: "2026-09-01", category: "labor", amountBrl: 1200 }],
  customCategories: [],
  farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "" },
};

describe("hasMoney", () => {
  it("is true when any value is present", () => {
    expect(hasMoney({ pricePerArroba: 320 })).toBe(true);
    expect(hasMoney({ planCostBrl: 0 })).toBe(true);
  });

  it("is false when every value is null or missing", () => {
    expect(hasMoney({ pricePerArroba: null, totalAmountBrl: null, planCostBrl: null })).toBe(false);
    expect(hasMoney({})).toBe(false);
  });
});

describe("sessionHasMoney", () => {
  it("reads the price, the total and the plan cost", () => {
    expect(sessionHasMoney(sale)).toBe(true);
    expect(sessionHasMoney(vaccination)).toBe(false);
    expect(
      sessionHasMoney({ ...vaccination, treatment: { ...vaccination.treatment!, costBrl: 3 } })
    ).toBe(true);
  });

  it("trusts valuesHidden on a redacted session", () => {
    expect(sessionHasMoney(redactManejoSession(sale))).toBe(true);
  });
});

describe("startNeedsFinance", () => {
  it("guards every venda and entrada", () => {
    expect(startNeedsFinance({ kind: "sale" })).toBe(true);
    expect(startNeedsFinance({ kind: "entry" })).toBe(true);
  });

  it("guards a plan cost on a sanitary manejo", () => {
    expect(startNeedsFinance({ kind: "health", treatment: { costBrl: 2 } })).toBe(true);
    expect(startNeedsFinance({ kind: "health", treatment: {} })).toBe(false);
    expect(startNeedsFinance({ kind: "transfer" })).toBe(false);
  });
});

describe("canDeleteSession", () => {
  it("needs Manejo edit, plus Financeiro edit when the session has money", () => {
    expect(canDeleteSession(PRESETS.vaqueiro, vaccination)).toBe(true);
    expect(canDeleteSession(PRESETS.vaqueiro, redactManejoSession(sale))).toBe(false);
    expect(canDeleteSession(FULL_PERMISSIONS, sale)).toBe(true);
    expect(canDeleteSession(PRESETS.consultor, vaccination)).toBe(false);
  });
});

describe("redactManejoSession", () => {
  it("strips price, total and pass values and marks the session", () => {
    const redacted = redactManejoSession(sale);
    expect(redacted).not.toHaveProperty("pricePerArroba");
    expect(redacted.animals[0]).toEqual({ earTag: "BR-1", outcome: "done", weightKg: 500 });
    expect(redacted.carcassYieldPct).toBe(52);
    expect(redacted.valuesHidden).toBe(true);
  });

  it("leaves a session without values unmarked", () => {
    expect(redactManejoSession(vaccination)).toEqual(vaccination);
  });
});

describe("redactPass", () => {
  it("strips the pass value and the treatment cost", () => {
    const result = redactPass({
      entry: sale.animals[0],
      treatments: [treatment],
      weighing: { date: "2026-09-02", weightKg: 500 },
    });
    expect(result.entry).not.toHaveProperty("amountBrl");
    expect(result.treatments[0]).not.toHaveProperty("costBrl");
    expect(result.weighing).toEqual({ date: "2026-09-02", weightKg: 500 });
  });
});

describe("redactHerdMoney", () => {
  it("removes every BRL value and empties the expenses", () => {
    const redacted = redactHerdMoney(herd);
    expect(redacted.expenses).toEqual([]);
    expect(redacted.treatments[0]).not.toHaveProperty("costBrl");
    expect(redacted.movements[0]).not.toHaveProperty("amountBrl");
    expect(redacted.manejoSessions[0]).not.toHaveProperty("pricePerArroba");
    expect(redacted.farm).toEqual(herd.farm);
  });

  it("does not mutate its input", () => {
    redactHerdMoney(herd);
    expect(herd.expenses).toHaveLength(1);
    expect(herd.treatments[0].costBrl).toBe(4.5);
    expect(sale.pricePerArroba).toBe(320);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run lib/domain/__tests__/moneyRedaction.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/domain/moneyRedaction"`.

- [ ] **Step 4: Write the implementation**

Create `lib/domain/moneyRedaction.ts`:

```ts
/**
 * Money is its own permission: a member without Financeiro sees the herd and
 * runs the chute, but no R$ value reaches their browser. These helpers strip
 * the values from what the API returns and decide which writes touch money.
 *
 * `carcassYieldPct` is a percentage, not money, and stays.
 */
import type {
  HerdData,
  ManejoKind,
  ManejoSession,
  ManejoSessionAnimal,
  Movement,
  Treatment,
} from "@/lib/types";
import { can, type Permissions } from "@/lib/domain/permissions";

/** A copy of `value` without `key`. */
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

export interface SessionMoneyFacts {
  pricePerArroba?: number | null;
  totalAmountBrl?: number | null;
  planCostBrl?: number | null;
}

/** True when a session row or body carries any BRL value. */
export function hasMoney(facts: SessionMoneyFacts): boolean {
  return [facts.pricePerArroba, facts.totalAmountBrl, facts.planCostBrl].some(
    (value) => value !== undefined && value !== null
  );
}

/** Client-side twin of the server's delete rule, redacted sessions included. */
export function sessionHasMoney(session: ManejoSession): boolean {
  return (
    session.valuesHidden === true ||
    hasMoney({
      pricePerArroba: session.pricePerArroba,
      totalAmountBrl: session.totalAmountBrl,
      planCostBrl: session.treatment?.costBrl,
    })
  );
}

/** A venda or entrada is money by nature; any other manejo only when it prices something. */
export function startNeedsFinance(body: {
  kind: ManejoKind;
  pricePerArroba?: number;
  totalAmountBrl?: number;
  treatment?: { costBrl?: number };
}): boolean {
  return (
    body.kind === "sale" ||
    body.kind === "entry" ||
    hasMoney({
      pricePerArroba: body.pricePerArroba,
      totalAmountBrl: body.totalAmountBrl,
      planCostBrl: body.treatment?.costBrl,
    })
  );
}

export function canDeleteSession(permissions: Permissions, session: ManejoSession): boolean {
  return (
    can(permissions, "manejo", "edit") &&
    (!sessionHasMoney(session) || can(permissions, "finance", "edit"))
  );
}

export function redactTreatment(treatment: Treatment): Treatment {
  return treatment.costBrl === undefined ? treatment : without(treatment, "costBrl");
}

function redactPassAnimal(animal: ManejoSessionAnimal): ManejoSessionAnimal {
  return animal.amountBrl === undefined ? animal : without(animal, "amountBrl");
}

function redactMovement(movement: Movement): Movement {
  return movement.amountBrl === undefined ? movement : without(movement, "amountBrl");
}

export function redactManejoSession(session: ManejoSession): ManejoSession {
  const hidden =
    session.pricePerArroba !== undefined ||
    session.totalAmountBrl !== undefined ||
    session.treatment?.costBrl !== undefined ||
    session.animals.some((animal) => animal.amountBrl !== undefined);
  if (!hidden) return session;

  const bare = without(without(session, "pricePerArroba"), "totalAmountBrl");
  return {
    ...bare,
    animals: session.animals.map(redactPassAnimal),
    ...(session.treatment ? { treatment: without(session.treatment, "costBrl") } : {}),
    valuesHidden: true,
  };
}

/** A chute pass as the complete route answers it. */
export function redactPass<T extends { entry: ManejoSessionAnimal; treatments: Treatment[] }>(
  result: T
): T {
  return {
    ...result,
    entry: redactPassAnimal(result.entry),
    treatments: result.treatments.map(redactTreatment),
  };
}

export function redactHerdMoney(data: HerdData): HerdData {
  return {
    ...data,
    treatments: data.treatments.map(redactTreatment),
    manejoSessions: data.manejoSessions.map(redactManejoSession),
    movements: data.movements.map(redactMovement),
    expenses: [],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run lib/domain/__tests__/moneyRedaction.test.ts`
Expected: PASS. If TypeScript complains in the fixtures about `Movement.type` or `Expense.category`, check the unions in `lib/types.ts` (`MovementType`, `ExpenseCategory`) and use valid members; do not loosen the types.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: No commit.**

---

### Task 3: Invites domain

**Files:**
- Create: `lib/domain/invites.ts`
- Test: `lib/domain/__tests__/invites.test.ts`

**Interfaces:**
- Produces:
  - `INVITE_TTL_DAYS = 7`
  - `normalizeEmail(email: string): string`, `isValidEmail(email: string): boolean`
  - `inviteExpiry(now: Date): Date`
  - `type InviteStatus = "pending" | "accepted" | "declined" | "canceled"`, `type ListedInviteState = "pending" | "expired" | "declined"`
  - `inviteState(invite: { status: InviteStatus; expiresAt: Date | string }, now: Date): ListedInviteState | null`
  - `daysLeft(expiresAt: Date | string, now: Date): number`
  - `expiresInLabel(expiresAt: Date | string, now: Date): string` ("expira em 6 dias")
  - `expiresInSentence(expiresAt: Date | string, now: Date): string` ("Expira em 6 dias")
  - `formatInstantDate(value: Date | string): string` ("08/09/2026", São Paulo calendar)
  - `inviteDateLine(invite: { state: ListedInviteState; expiresAt: string; respondedAt: string | null }, now: Date): string`

- [ ] **Step 1: Write the failing test**

Create `lib/domain/__tests__/invites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  daysLeft,
  expiresInLabel,
  expiresInSentence,
  formatInstantDate,
  inviteDateLine,
  inviteExpiry,
  inviteState,
  isValidEmail,
  normalizeEmail,
} from "@/lib/domain/invites";

const now = new Date("2026-09-12T15:00:00Z");

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Zeca.Silva@Hotmail.com ")).toBe("zeca.silva@hotmail.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a plain address and refuses the rest", () => {
    expect(isValidEmail("zeca@hotmail.com")).toBe(true);
    expect(isValidEmail("zeca@hotmail")).toBe(false);
    expect(isValidEmail("zeca hotmail.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("inviteExpiry", () => {
  it("lands seven days later", () => {
    expect(inviteExpiry(now).toISOString()).toBe("2026-09-19T15:00:00.000Z");
  });
});

describe("inviteState", () => {
  it("lists a pending convite until it expires", () => {
    expect(inviteState({ status: "pending", expiresAt: "2026-09-18T00:00:00Z" }, now)).toBe("pending");
    expect(inviteState({ status: "pending", expiresAt: "2026-09-12T15:00:00Z" }, now)).toBe("expired");
  });

  it("lists a declined convite and hides accepted and canceled ones", () => {
    expect(inviteState({ status: "declined", expiresAt: "2026-09-01T00:00:00Z" }, now)).toBe("declined");
    expect(inviteState({ status: "accepted", expiresAt: "2026-09-18T00:00:00Z" }, now)).toBeNull();
    expect(inviteState({ status: "canceled", expiresAt: "2026-09-18T00:00:00Z" }, now)).toBeNull();
  });
});

describe("daysLeft and expiresInLabel", () => {
  it("rounds up and never reads zero", () => {
    expect(daysLeft("2026-09-18T15:00:00Z", now)).toBe(6);
    expect(daysLeft("2026-09-12T16:00:00Z", now)).toBe(1);
    expect(expiresInLabel("2026-09-18T15:00:00Z", now)).toBe("expira em 6 dias");
    expect(expiresInLabel("2026-09-13T10:00:00Z", now)).toBe("expira em 1 dia");
    expect(expiresInSentence("2026-09-18T15:00:00Z", now)).toBe("Expira em 6 dias");
  });
});

describe("formatInstantDate", () => {
  it("prints the São Paulo calendar day", () => {
    expect(formatInstantDate("2026-09-08T12:00:00Z")).toBe("08/09/2026");
    expect(formatInstantDate("2026-09-09T02:00:00Z")).toBe("08/09/2026");
  });
});

describe("inviteDateLine", () => {
  it("reads the line under each state", () => {
    expect(
      inviteDateLine({ state: "pending", expiresAt: "2026-09-18T15:00:00Z", respondedAt: null }, now)
    ).toBe("expira em 6 dias");
    expect(
      inviteDateLine({ state: "expired", expiresAt: "2026-09-02T12:00:00Z", respondedAt: null }, now)
    ).toBe("expirou em 02/09/2026");
    expect(
      inviteDateLine(
        { state: "declined", expiresAt: "2026-09-10T12:00:00Z", respondedAt: "2026-09-08T12:00:00Z" },
        now
      )
    ).toBe("recusou em 08/09/2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/domain/__tests__/invites.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the implementation**

Create `lib/domain/invites.ts`:

```ts
/**
 * Convites: an e-mail waiting to be claimed by whoever signs in with it.
 * Nothing is sent; the owner tells the person. Pure helpers for the server's
 * use cases and the lists on both sides.
 */

export const INVITE_TTL_DAYS = 7;

const DAY_MS = 86_400_000;

export type InviteStatus = "pending" | "accepted" | "declined" | "canceled";

/** What the owner's list shows; expired is derived, never stored. */
export type ListedInviteState = "pending" | "expired" | "declined";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
}

export function inviteState(
  invite: { status: InviteStatus; expiresAt: Date | string },
  now: Date
): ListedInviteState | null {
  if (invite.status === "declined") return "declined";
  if (invite.status !== "pending") return null;
  return new Date(invite.expiresAt).getTime() <= now.getTime() ? "expired" : "pending";
}

/** Whole days left, rounded up, at least one while the convite is still valid. */
export function daysLeft(expiresAt: Date | string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS));
}

export function expiresInLabel(expiresAt: Date | string, now: Date): string {
  const days = daysLeft(expiresAt, now);
  return days === 1 ? "expira em 1 dia" : `expira em ${days} dias`;
}

/** The same, opening a sentence. */
export function expiresInSentence(expiresAt: Date | string, now: Date): string {
  const label = expiresInLabel(expiresAt, now);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const INSTANT_DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/** DD/MM/AAAA of a stored timestamp, on the Brazilian calendar. */
export function formatInstantDate(value: Date | string): string {
  return INSTANT_DATE.format(new Date(value));
}

export function inviteDateLine(
  invite: { state: ListedInviteState; expiresAt: string; respondedAt: string | null },
  now: Date
): string {
  if (invite.state === "pending") return expiresInLabel(invite.expiresAt, now);
  if (invite.state === "expired") return `expirou em ${formatInstantDate(invite.expiresAt)}`;
  return `recusou em ${formatInstantDate(invite.respondedAt ?? invite.expiresAt)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/domain/__tests__/invites.test.ts`
Expected: PASS.

- [ ] **Step 5: No commit.**

---

### Task 4: Schema and migration

**Files:**
- Modify: `lib/db/schema.ts` (enums near `farmRoleEnum`, `farmUsers`, new `farmInvites`, row types)
- Create (generated): `drizzle/0014_farm-members-permissions.sql`, `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json` entry

**Interfaces:**
- Consumes: `type MemberPreset`, `type Permissions` (Task 1).
- Produces: `farmMemberPresetEnum`, `farmInviteStatusEnum`, `farmUsers.preset`, `farmUsers.permissions`, `farmInvites` (columns `id, farmId, email, preset, permissions, status, invitedByUserId, createdAt, expiresAt, respondedAt`), `type FarmInviteRow`.

- [ ] **Step 1: Add the enums**

In `lib/db/schema.ts`, add an import below `import { sql } from "drizzle-orm";`:

```ts
import type { Permissions } from "@/lib/domain/permissions";
```

Replace:

```ts
/** Role of a user inside a farm. */
export const farmRoleEnum = pgEnum("farm_role", ["owner", "member"]);
```

with:

```ts
/** Role of a user inside a farm. */
export const farmRoleEnum = pgEnum("farm_role", ["owner", "member"]);

/** Preset a member's levels were picked from (lib/domain/permissions.ts). */
export const farmMemberPresetEnum = pgEnum("farm_member_preset", [
  "gerente",
  "vaqueiro",
  "consultor",
  "personalizado",
]);

/** Lifecycle of a convite. Expired is derived from expires_at, never stored. */
export const farmInviteStatusEnum = pgEnum("farm_invite_status", [
  "pending",
  "accepted",
  "declined",
  "canceled",
]);
```

- [ ] **Step 2: Extend `farm_users` and add `farm_invites`**

Replace:

```ts
    role: farmRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.farmId, t.userId] }),
    index("farm_users_user_id_idx").on(t.userId),
  ]
);
```

with:

```ts
    role: farmRoleEnum("role").notNull().default("member"),
    /** Preset the levels came from; null on the Dono row. */
    preset: farmMemberPresetEnum("preset"),
    /** Level per area; null on the Dono row, who holds everything. */
    permissions: jsonb("permissions").$type<Permissions>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.farmId, t.userId] }),
    index("farm_users_user_id_idx").on(t.userId),
  ]
);

/**
 * A convite to join a farm, claimed by signing in with its e-mail. Accepted,
 * declined and canceled rows stay for history; at most one per e-mail is
 * pending on a farm.
 */
export const farmInvites = pgTable(
  "farm_invites",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Trimmed and lowercased. */
    email: text("email").notNull(),
    preset: farmMemberPresetEnum("preset").notNull(),
    permissions: jsonb("permissions").$type<Permissions>().notNull(),
    status: farmInviteStatusEnum("status").notNull().default("pending"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (t) => [
    uniqueIndex("farm_invites_one_pending_per_email_unique")
      .on(t.farmId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index("farm_invites_email_idx").on(t.email),
  ]
);
```

In the "Inferred row types" block, below `export type FarmUserRow = typeof farmUsers.$inferSelect;`, add:

```ts
export type FarmInviteRow = typeof farmInvites.$inferSelect;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (`seedCli.ts` and `EnsureForUser.useCase.ts` insert owner rows without `preset`/`permissions`, which are nullable.)

- [ ] **Step 4: Generate the migration**

Run: `pnpm exec drizzle-kit generate --name farm-members-permissions`
Expected: `drizzle/0014_farm-members-permissions.sql` created, containing `CREATE TYPE "public"."farm_invite_status"`, `CREATE TYPE "public"."farm_member_preset"`, `CREATE TABLE "farm_invites"`, two `ALTER TABLE "farm_users" ADD COLUMN`, the foreign keys and both indexes. If drizzle-kit asks an interactive rename question, answer "create" for every item; nothing is renamed.

- [ ] **Step 5: Append the data update**

At the end of `drizzle/0014_farm-members-permissions.sql`, append:

```sql
--> statement-breakpoint
UPDATE "farm_users"
SET "preset" = 'gerente',
    "permissions" = '{"herd":"edit","manejo":"edit","reproduction":"edit","sanitary":"edit","lots":"edit","finance":"edit","farm":"edit","team":"edit"}'::jsonb
WHERE "role" = 'member';
```

- [ ] **Step 6: Apply it to the local database**

The compose DB container is `meubov`; `127.0.0.1:5433` on this host may answer as another project's Postgres. Bridge a port into the compose network, migrate, then remove the bridge:

```bash
docker run --rm -d --name meubov-bridge --network meubov_default -p 127.0.0.1:5440:5440 alpine/socat TCP-LISTEN:5440,fork,reuseaddr TCP:db:5432
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5440/meubov pnpm db:migrate
docker exec meubov psql -U meubov -d meubov -c '\d farm_invites'
docker rm -f meubov-bridge
```

Expected: migrate prints the applied migration; `\d farm_invites` lists the ten columns and `farm_invites_one_pending_per_email_unique` with `WHERE status = 'pending'::farm_invite_status`. If the `meubov` container is stopped, start it with `pnpm db:up` first.

- [ ] **Step 7: No commit.**

---

### Task 5: Route requirements table

**Files:**
- Create: `lib/api/permissions/routeRequirements.ts`
- Test: `lib/api/__tests__/routeRequirements.test.ts`

**Interfaces:**
- Consumes: `can`, `type Area`, `type Permissions` (Task 1).
- Produces:
  - `type RouteRequirement = { read: true } | { view: Area } | { edit: readonly Area[] }`
  - `ROUTE_REQUIREMENTS: Readonly<Record<string, RouteRequirement>>` keyed `"METHOD /api/herd/..."`
  - `SESSION_ONLY_ROUTES: readonly string[]`
  - `routeKey(method: string, path: string): string`
  - `type RequirementVerdict = { ok: true } | { ok: false; area: Area | null }`
  - `checkRequirement(requirement: RouteRequirement | undefined, permissions: Permissions): RequirementVerdict`

- [ ] **Step 1: Write the failing test**

Create `lib/api/__tests__/routeRequirements.test.ts`:

```ts
/**
 * The permission each herd API route asks for. Task 10 adds the completeness
 * check against the mounted app; this file starts with the pure rules.
 */
import { describe, expect, it } from "vitest";
import { FLOORS, FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import {
  ROUTE_REQUIREMENTS,
  checkRequirement,
  routeKey,
} from "@/lib/api/permissions/routeRequirements";

describe("routeKey", () => {
  it("drops the trailing slash of a prefixed root route", () => {
    expect(routeKey("get", "/api/herd/")).toBe("GET /api/herd");
  });

  it("keeps any other path as it is", () => {
    expect(routeKey("POST", "/api/herd/manejo/:id/close")).toBe("POST /api/herd/manejo/:id/close");
  });
});

describe("checkRequirement", () => {
  it("lets any member read", () => {
    expect(checkRequirement({ read: true }, FLOORS)).toEqual({ ok: true });
  });

  it("checks a view requirement", () => {
    expect(checkRequirement({ view: "team" }, PRESETS.consultor)).toEqual({ ok: false, area: "team" });
    expect(checkRequirement({ view: "team" }, FULL_PERMISSIONS)).toEqual({ ok: true });
  });

  it("names the first area short of edit", () => {
    expect(
      checkRequirement({ edit: ["herd", "lots"] }, { ...PRESETS.vaqueiro, lots: "view" })
    ).toEqual({ ok: false, area: "lots" });
  });

  it("refuses a route with no requirement", () => {
    expect(checkRequirement(undefined, FULL_PERMISSIONS)).toEqual({ ok: false, area: null });
  });
});

describe("ROUTE_REQUIREMENTS", () => {
  it("keeps reads open and writes behind their area", () => {
    expect(ROUTE_REQUIREMENTS["GET /api/herd"]).toEqual({ read: true });
    expect(ROUTE_REQUIREMENTS["POST /api/herd/animals/import"]).toEqual({ edit: ["herd", "lots"] });
    expect(ROUTE_REQUIREMENTS["POST /api/herd/manejo/:id/carcass-yield"]).toEqual({
      edit: ["manejo", "finance"],
    });
    expect(ROUTE_REQUIREMENTS["PUT /api/herd/farm/headquarters"]).toEqual({ edit: ["lots"] });
    expect(ROUTE_REQUIREMENTS["GET /api/herd/farm/team"]).toEqual({ view: "team" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the implementation**

Create `lib/api/permissions/routeRequirements.ts`:

```ts
/**
 * What each farm-scoped route of the herd API asks of the caller.
 *
 * One table instead of an option per route, so the whole permission surface
 * reads in one place and a test can hold it against the mounted app: a route
 * with no entry is refused by the farm macro. A route declares the area of the
 * action it starts; whatever that action writes on the way belongs to it (a
 * parto inserts the calf, a chute pass inserts the treatment). Money rules that
 * depend on the body live in the manejo controller.
 */
import { can, type Area, type Permissions } from "@/lib/domain/permissions";

export type RouteRequirement = { read: true } | { view: Area } | { edit: readonly Area[] };

const READ = { read: true } as const;
const edit = (...areas: Area[]): RouteRequirement => ({ edit: areas });

export const ROUTE_REQUIREMENTS: Readonly<Record<string, RouteRequirement>> = {
  "GET /api/herd": READ,
  "GET /api/herd/farms": READ,
  "GET /api/herd/health": READ,

  "POST /api/herd/animals": edit("herd"),
  "POST /api/herd/animals/batch": edit("herd"),
  "PATCH /api/herd/animals/:id": edit("herd"),
  "POST /api/herd/animals/:id/deactivate": edit("herd"),
  "POST /api/herd/animals/:id/weighings": edit("herd"),
  "DELETE /api/herd/weighings": edit("herd"),
  "POST /api/herd/breeds": edit("herd"),
  "DELETE /api/herd/breeds/:name": edit("herd"),
  "POST /api/herd/categories": edit("herd"),
  "DELETE /api/herd/categories/:id": edit("herd"),
  "POST /api/herd/animals/import": edit("herd", "lots"),

  "POST /api/herd/manejo": edit("manejo"),
  "DELETE /api/herd/manejo/:id": edit("manejo"),
  "POST /api/herd/manejo/:id/animals": edit("manejo"),
  "POST /api/herd/manejo/:id/animals/:animalId/complete": edit("manejo"),
  "POST /api/herd/manejo/:id/animals/:animalId/reopen": edit("manejo"),
  "POST /api/herd/manejo/:id/animals/:animalId/skip": edit("manejo"),
  "POST /api/herd/manejo/:id/close": edit("manejo"),
  "POST /api/herd/manejo/:id/carcass-yield": edit("manejo", "finance"),

  "POST /api/herd/animals/:id/breedings": edit("reproduction"),
  "POST /api/herd/animals/:id/calvings": edit("reproduction"),
  "POST /api/herd/animals/:id/diagnoses": edit("reproduction"),
  "POST /api/herd/births/import": edit("reproduction"),

  "POST /api/herd/treatments/schedule": edit("sanitary"),
  "POST /api/herd/treatments/complete": edit("sanitary"),
  "DELETE /api/herd/treatments/:id": edit("sanitary"),
  "POST /api/herd/protocols": edit("sanitary"),
  "DELETE /api/herd/protocols/:id": edit("sanitary"),

  "POST /api/herd/lots": edit("lots"),
  "PATCH /api/herd/lots/:id": edit("lots"),
  "DELETE /api/herd/lots/:id": edit("lots"),
  "POST /api/herd/lots/:id/archive": edit("lots"),
  "POST /api/herd/lots/:id/placements": edit("lots"),
  "POST /api/herd/invernadas": edit("lots"),
  "PATCH /api/herd/invernadas/:id": edit("lots"),
  "DELETE /api/herd/invernadas/:id": edit("lots"),
  "PUT /api/herd/farm/headquarters": edit("lots"),

  "POST /api/herd/expenses": edit("finance"),
  "DELETE /api/herd/expenses/:id": edit("finance"),

  "PUT /api/herd/farm": edit("farm"),

  "GET /api/herd/farm/team": { view: "team" },
  "POST /api/herd/farm/invites": edit("team"),
  "DELETE /api/herd/farm/invites/:id": edit("team"),
  "PATCH /api/herd/farm/members/:userId": edit("team"),
  "DELETE /api/herd/farm/members/:userId": edit("team"),
  // Any member may leave; the use case refuses the Dono.
  "POST /api/herd/farm/leave": READ,
};

/** Routes behind the session macro only: they run before the caller has a farm. */
export const SESSION_ONLY_ROUTES: readonly string[] = [
  "GET /api/herd/invites",
  "POST /api/herd/invites/:id/accept",
  "POST /api/herd/invites/:id/decline",
  "POST /api/herd/farms",
];

/** Elysia's route pattern as the table spells it: "/api/herd/" becomes "/api/herd". */
export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/(?<=.)\/$/, "")}`;
}

export type RequirementVerdict = { ok: true } | { ok: false; area: Area | null };

export function checkRequirement(
  requirement: RouteRequirement | undefined,
  permissions: Permissions
): RequirementVerdict {
  if (requirement === undefined) return { ok: false, area: null };
  if ("read" in requirement) return { ok: true };
  if ("view" in requirement) {
    return can(permissions, requirement.view, "view")
      ? { ok: true }
      : { ok: false, area: requirement.view };
  }
  const short = requirement.edit.find((area) => !can(permissions, area, "edit"));
  return short === undefined ? { ok: true } : { ok: false, area: short };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts`
Expected: PASS.

- [ ] **Step 5: No commit.**

---

### Task 6: Permissions in the farm macro

**Files:**
- Modify: `lib/api/plugins/farm.ts` (whole file)
- Test: `lib/api/__tests__/farmPlugin.test.ts` (whole file)

**Interfaces:**
- Consumes: `resolvePermissions`, `FarmRole`, `MemberPreset` (Task 1); `normalizeEmail` (Task 3); `farmInvites`, `farmUsers.preset/permissions` (Task 4); `ROUTE_REQUIREMENTS`, `checkRequirement`, `routeKey` (Task 5).
- Produces: every `{ farm: true }` route context gains `preset: MemberPreset | null` and `permissions: Permissions`. New responses: 403 `{ error: "forbidden", area: Area | null }`, 409 `{ error: "pending_invites" }`.

- [ ] **Step 1: Rewrite the test**

Replace the whole of `lib/api/__tests__/farmPlugin.test.ts` with:

```ts
/**
 * farmPlugin resolution: membership scoping, the SUPERUSER_EMAILS bypass, the
 * route's permission requirement and the pending-convite stop.
 *
 * The db mock is a chainable select stub: `from()` captures the table, and
 * `limit()` resolves with the farm_invites, farm_users or farm fixture
 * depending on which table the query targeted (recognized by a column only
 * that table has). The test app mounts under /api/herd so its routes hit real
 * keys of ROUTE_REQUIREMENTS.
 */
import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, ensureFarmForUser } = vi.hoisted(() => ({
  state: {
    farmUsersRows: [] as Record<string, unknown>[],
    farmRows: [] as Record<string, unknown>[],
    inviteRows: [] as Record<string, unknown>[],
  },
  getSession: vi.fn(),
  ensureFarmForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/api/domains/farm/useCases/EnsureForUser.useCase", () => ({
  EnsureFarmForUserUseCase: class {
    run = ({ userId }: { userId: string }) => ensureFarmForUser(userId);
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      let table: Record<string, unknown> | undefined;
      const builder = {
        from(t: Record<string, unknown>) {
          table = t;
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit() {
          if (table && "expiresAt" in table) return Promise.resolve(state.inviteRows);
          if (table && "userId" in table) return Promise.resolve(state.farmUsersRows);
          return Promise.resolve(state.farmRows);
        },
      };
      return builder;
    },
  },
}));

import { farmPlugin } from "@/lib/api/plugins/farm";

const SUPER_EMAIL = "super@meubov.test";
const app = new Elysia({ prefix: "/api/herd" })
  .use(farmPlugin)
  .get(
    "/health",
    ({ user, farmId, farmRole, superuser }) => ({
      userId: user.id,
      farmId,
      farmRole,
      superuser,
    }),
    { farm: true }
  )
  .get("/farms", ({ preset, permissions }) => ({ preset, permissions }), { farm: true })
  .post("/animals", () => ({ ok: true }), { farm: true })
  .get("/unlisted", () => ({ ok: true }), { farm: true });

const call = (path: string, init: RequestInit = {}) =>
  app.handle(new Request(`http://localhost/api/herd${path}`, init));

const whoami = (headers: Record<string, string> = {}) => call("/health", { headers });

function signIn(email: string) {
  getSession.mockResolvedValue({ user: { id: "user-1", email } });
}

describe("farmPlugin", () => {
  beforeEach(() => {
    vi.stubEnv("SUPERUSER_EMAILS", SUPER_EMAIL);
    state.farmUsersRows = [];
    state.farmRows = [];
    state.inviteRows = [];
    getSession.mockReset();
    ensureFarmForUser.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    const response = await whoami();
    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-integer x-farm-id", async () => {
    signIn(SUPER_EMAIL);
    const response = await whoami({ "x-farm-id": "abc" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_farm_id" });
  });

  it("keeps membership access working with a header (regression)", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: null, permissions: null }];
    const response = await whoami({ "x-farm-id": "7" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 7,
      farmRole: "member",
      superuser: false,
    });
  });

  it("returns 403 for a non-superuser without membership", async () => {
    signIn("user@meubov.test");
    state.farmRows = [{ id: 7 }];
    const response = await whoami({ "x-farm-id": "7" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_a_member" });
  });

  it("grants a superuser owner access to an existing farm without membership", async () => {
    signIn(SUPER_EMAIL);
    state.farmRows = [{ id: 42 }];
    const response = await whoami({ "x-farm-id": "42" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 42,
      farmRole: "owner",
      superuser: true,
    });
  });

  it("returns 404 for a superuser targeting a nonexistent farm", async () => {
    signIn(SUPER_EMAIL);
    const response = await whoami({ "x-farm-id": "999" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "farm_not_found" });
  });

  it("prefers the superuser's own membership when no header is sent", async () => {
    signIn(SUPER_EMAIL);
    state.farmUsersRows = [{ farmId: 7, role: "member", preset: null, permissions: null }];
    state.farmRows = [{ id: 1 }];
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 7,
      farmRole: "member",
      superuser: true,
    });
    expect(ensureFarmForUser).not.toHaveBeenCalled();
  });

  it("falls back to the first farm for a superuser with no membership", async () => {
    signIn(SUPER_EMAIL);
    state.farmRows = [{ id: 3 }];
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 3,
      farmRole: "owner",
      superuser: true,
    });
    expect(ensureFarmForUser).not.toHaveBeenCalled();
  });

  it("lazily creates a farm for a superuser when the database has none", async () => {
    signIn(SUPER_EMAIL);
    ensureFarmForUser.mockResolvedValue(99);
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 99,
      farmRole: "owner",
      superuser: true,
    });
    expect(ensureFarmForUser).toHaveBeenCalledWith("user-1");
  });

  it("lazily creates a farm for a user with no membership and no convite", async () => {
    signIn("user@meubov.test");
    ensureFarmForUser.mockResolvedValue(12);
    const response = await whoami();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      farmId: 12,
      farmRole: "owner",
      superuser: false,
    });
  });

  it("stops a user with a pending convite before any farm is created", async () => {
    signIn("user@meubov.test");
    state.inviteRows = [{ id: 5 }];
    const response = await whoami();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "pending_invites" });
    expect(ensureFarmForUser).not.toHaveBeenCalled();
  });

  it("puts a member's stored preset and levels on the context", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: "consultor", permissions: PRESETS.consultor }];
    const response = await call("/farms", { headers: { "x-farm-id": "7" } });
    expect(await response.json()).toEqual({ preset: "consultor", permissions: PRESETS.consultor });
  });

  it("gives the Dono every area", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "owner", preset: null, permissions: null }];
    const response = await call("/farms", { headers: { "x-farm-id": "7" } });
    expect(await response.json()).toEqual({ preset: null, permissions: FULL_PERMISSIONS });
  });

  it("refuses an edit route to a member below its level", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: "consultor", permissions: PRESETS.consultor }];
    const response = await call("/animals", { method: "POST", headers: { "x-farm-id": "7" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "herd" });
  });

  it("lets a member with the level through", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "member", preset: "vaqueiro", permissions: PRESETS.vaqueiro }];
    const response = await call("/animals", { method: "POST", headers: { "x-farm-id": "7" } });
    expect(response.status).toBe(200);
  });

  it("refuses a route missing from the requirements table", async () => {
    signIn("user@meubov.test");
    state.farmUsersRows = [{ role: "owner", preset: null, permissions: null }];
    const response = await call("/unlisted", { headers: { "x-farm-id": "7" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: null });
  });
});
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `pnpm exec vitest run lib/api/__tests__/farmPlugin.test.ts`
Expected: FAIL on "stops a user with a pending convite", "puts a member's stored preset", "gives the Dono every area", "refuses an edit route", "refuses a route missing". The older cases still pass.

- [ ] **Step 3: Rewrite the macro**

Replace the whole of `lib/api/plugins/farm.ts` with:

```ts
/**
 * Elysia farm-scope macro: session, active farm and the caller's permissions.
 *
 * Routes opting in with `{ farm: true }` get `user`, `farmId`, `farmRole`,
 * `preset`, `permissions` and `superuser`. The active farm is the optional
 * `x-farm-id` header (403 unless the user is a member of that farm) or the
 * user's oldest membership. A user with no membership but a pending convite
 * gets 409 `pending_invites`, so the client sends them to /convites before any
 * farm exists for them; any other user with no farm gets one lazily via
 * EnsureFarmForUserUseCase. E-mails in the SUPERUSER_EMAILS allowlist bypass
 * the membership check: any existing farm id in the header is accepted (404 if
 * the farm doesn't exist), and without a header they fall back to the first
 * farm in the database instead of creating an empty one.
 *
 * Once the farm is known, the route's entry in ROUTE_REQUIREMENTS is checked
 * against the resolved levels: 403 `forbidden` names the area that fell short,
 * and a route with no entry is refused. Self-contained (validates the session
 * itself) so routes don't need to combine two macros.
 */
import { Elysia } from "elysia";
import { and, asc, eq, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isSuperuser } from "@/lib/auth/superuser";
import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers } from "@/lib/db/schema";
import { EnsureFarmForUserUseCase } from "@/lib/api/domains/farm/useCases/EnsureForUser.useCase";
import {
  ROUTE_REQUIREMENTS,
  checkRequirement,
  routeKey,
} from "@/lib/api/permissions/routeRequirements";
import { normalizeEmail } from "@/lib/domain/invites";
import {
  resolvePermissions,
  type FarmRole,
  type MemberPreset,
} from "@/lib/domain/permissions";

interface Membership {
  farmId: number;
  role: FarmRole;
  preset: MemberPreset | null;
  permissions: unknown;
}

/** The Dono's row, and what a superuser without a membership acts as. */
const OWNER = { role: "owner" as const, preset: null, permissions: null };

export const farmPlugin = new Elysia({ name: "farm" }).macro({
  farm: {
    resolve: async ({ request, route, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { error: "unauthorized" });
      const user = session.user;
      const superuser = isSuperuser(user.email);

      const enter = (membership: Membership) => {
        const permissions = resolvePermissions(membership, superuser);
        const verdict = checkRequirement(
          ROUTE_REQUIREMENTS[routeKey(request.method, route)],
          permissions
        );
        if (!verdict.ok) return status(403, { error: "forbidden", area: verdict.area });
        return {
          user,
          farmId: membership.farmId,
          farmRole: membership.role,
          preset: membership.preset,
          permissions,
          superuser,
        };
      };

      const header = request.headers.get("x-farm-id");
      if (header !== null) {
        const farmId = Number(header);
        if (!Number.isInteger(farmId)) {
          return status(400, { error: "invalid_farm_id" });
        }
        const [membership] = await db
          .select({
            role: farmUsers.role,
            preset: farmUsers.preset,
            permissions: farmUsers.permissions,
          })
          .from(farmUsers)
          .where(and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, user.id)))
          .limit(1);
        if (membership) return enter({ farmId, ...membership });
        if (!superuser) return status(403, { error: "not_a_member" });
        const [target] = await db
          .select({ id: farm.id })
          .from(farm)
          .where(eq(farm.id, farmId))
          .limit(1);
        if (!target) return status(404, { error: "farm_not_found" });
        return enter({ farmId, ...OWNER });
      }

      const [membership] = await db
        .select({
          farmId: farmUsers.farmId,
          role: farmUsers.role,
          preset: farmUsers.preset,
          permissions: farmUsers.permissions,
        })
        .from(farmUsers)
        .where(eq(farmUsers.userId, user.id))
        .orderBy(asc(farmUsers.createdAt))
        .limit(1);
      if (membership) return enter(membership);

      if (superuser) {
        const [firstFarm] = await db
          .select({ id: farm.id })
          .from(farm)
          .orderBy(asc(farm.id))
          .limit(1);
        if (firstFarm) return enter({ farmId: firstFarm.id, ...OWNER });
      } else {
        const [invite] = await db
          .select({ id: farmInvites.id })
          .from(farmInvites)
          .where(
            and(
              eq(farmInvites.email, normalizeEmail(user.email)),
              eq(farmInvites.status, "pending"),
              gt(farmInvites.expiresAt, new Date())
            )
          )
          .limit(1);
        if (invite) return status(409, { error: "pending_invites" });
      }

      const farmId = await new EnsureFarmForUserUseCase().run({ userId: user.id });
      return enter({ farmId, ...OWNER });
    },
  },
});
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/api/__tests__/farmPlugin.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Typecheck and run the API suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run lib/api`
Expected: no type errors; all API tests pass. If `tsc` reports that a route handler's context lacks `user`/`farmId` because `enter` returns a union, annotate nothing: check the error first — Elysia strips status responses from resolve types. If it still fails, inline the `enter` body at each call site rather than changing the macro's shape.

- [ ] **Step 6: No commit.**

---

### Task 7: Farm routes — sede split, farm list, own farm

**Files:**
- Create: `lib/api/plugins/session.ts`
- Create: `lib/api/domains/farm/useCases/SaveHeadquarters.useCase.ts`
- Test: `lib/api/domains/farm/useCases/__tests__/SaveHeadquarters.test.ts`
- Modify: `lib/api/domains/farm/schemas/farm.schema.ts` (whole file)
- Modify: `lib/api/domains/farm/useCases/Save.useCase.ts` (whole file)
- Modify: `lib/api/domains/farm/useCases/__tests__/Save.test.ts` (whole file)
- Modify: `lib/api/domains/farm/useCases/Browse.useCase.ts` (whole file)
- Modify: `lib/api/domains/farm/farm.controller.ts` (whole file)
- Modify: `lib/store/useHerdStore.ts` (`saveHeadquarters` only)
- Modify: `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` (regenerated)

**Interfaces:**
- Consumes: Task 1 types and `resolvePermissions`; Task 6 context.
- Produces:
  - `sessionPlugin` macro `session: true` → context `user`
  - `PUT /api/herd/farm/headquarters` body `{ headquarters: { lat: number; lng: number; zoom?: number } | null }` → `FarmData`
  - `POST /api/herd/farms` → `{ farmId: number }`
  - `FarmSummary = { id: number; name: string; role: FarmRole; preset: MemberPreset | null; permissions: Permissions; joinedAt: string | null }`

- [ ] **Step 1: Write the failing test for the sede use case**

Create `lib/api/domains/farm/useCases/__tests__/SaveHeadquarters.test.ts`:

```ts
/**
 * saveHeadquarters: where and how close the map opens, written from the map
 * alone now that the registration fields have their own route.
 *
 * The db mock is a chainable update stub that captures the columns set and
 * answers `returning()` with the stored row fixture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    columns: undefined as Record<string, unknown> | undefined,
    row: {} as Record<string, unknown>,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: () => {
      const builder = {
        set(columns: Record<string, unknown>) {
          state.columns = columns;
          return builder;
        },
        where() {
          return builder;
        },
        returning() {
          return Promise.resolve([state.row]);
        },
      };
      return builder;
    },
  },
}));

import { SaveHeadquartersUseCase } from "../SaveHeadquarters.useCase";

const STORED = {
  name: "Fazenda Boa Vista",
  municipality: "Uberaba",
  stateRegistration: "001",
  manager: "Lucas",
  headquartersLat: -19.5,
  headquartersLng: -47.5,
  headquartersZoom: 16,
};

beforeEach(() => {
  state.columns = undefined;
  state.row = { ...STORED };
});

describe("saveHeadquarters", () => {
  it("writes latitude, longitude and zoom and nothing else", async () => {
    await new SaveHeadquartersUseCase().run({
      farmId: 1,
      headquarters: { lat: -19.5, lng: -47.5, zoom: 16 },
    });

    expect(state.columns).toEqual({
      headquartersLat: -19.5,
      headquartersLng: -47.5,
      headquartersZoom: 16,
    });
  });

  it("stores a view without zoom as a null zoom", async () => {
    await new SaveHeadquartersUseCase().run({ farmId: 1, headquarters: { lat: -19.5, lng: -47.5 } });

    expect(state.columns).toMatchObject({ headquartersZoom: null });
  });

  it("clears the view on null", async () => {
    await new SaveHeadquartersUseCase().run({ farmId: 1, headquarters: null });

    expect(state.columns).toEqual({
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    });
  });

  it("returns the farm as the database holds it", async () => {
    const result = await new SaveHeadquartersUseCase().run({
      farmId: 1,
      headquarters: { lat: -19.5, lng: -47.5, zoom: 16 },
    });

    expect(result.headquarters).toEqual({ lat: -19.5, lng: -47.5, zoom: 16 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/api/domains/farm/useCases/__tests__/SaveHeadquarters.test.ts`
Expected: FAIL, unresolved `../SaveHeadquarters.useCase`.

- [ ] **Step 3: Create the use case**

Create `lib/api/domains/farm/useCases/SaveHeadquarters.useCase.ts`:

```ts
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm } from "@/lib/db/schema";
import { toFarmData } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { FarmData } from "@/lib/types";

type SaveHeadquartersUseCaseProps = {
  farmId: number;
  /** The view to open the map on, or null to forget it. */
  headquarters: NonNullable<FarmData["headquarters"]> | null;
};

type SaveHeadquartersUseCaseResponse = FarmData;

type CurrUseCase = _UseCase<SaveHeadquartersUseCaseProps, SaveHeadquartersUseCaseResponse>;

/**
 * Saves the sede: where and how close the farm map opens. It has a route of
 * its own because it belongs to Lotes e Mapa while the registration fields
 * belong to Fazenda, and the two are granted separately.
 */
export class SaveHeadquartersUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SaveHeadquartersUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, headquarters }) => {
    const [row] = await this.repository
      .update(farm)
      .set({
        headquartersLat: headquarters?.lat ?? null,
        headquartersLng: headquarters?.lng ?? null,
        headquartersZoom: headquarters?.zoom ?? null,
      })
      .where(eq(farm.id, farmId))
      .returning();
    return toFarmData(row);
  };
}
```

- [ ] **Step 4: Narrow the registration use case and its test**

Replace the whole of `lib/api/domains/farm/useCases/Save.useCase.ts` with:

```ts
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm } from "@/lib/db/schema";
import { toFarmData } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { FarmData } from "@/lib/types";

type SaveFarmUseCaseProps = { farmId: number; data: Omit<FarmData, "headquarters"> };

type SaveFarmUseCaseResponse = FarmData;

type CurrUseCase = _UseCase<SaveFarmUseCaseProps, SaveFarmUseCaseResponse>;

/**
 * Updates the farm registration data. The sede is saved by
 * SaveHeadquartersUseCase and never touched here. Returns the stored row
 * rather than the input, so the caller's copy is what the database holds.
 */
export class SaveFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SaveFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, data }) => {
    const [row] = await this.repository
      .update(farm)
      .set({
        name: data.name,
        municipality: data.municipality,
        stateRegistration: data.stateRegistration,
        manager: data.manager,
      })
      .where(eq(farm.id, farmId))
      .returning();
    return toFarmData(row);
  };
}
```

Replace the whole of `lib/api/domains/farm/useCases/__tests__/Save.test.ts` with:

```ts
/**
 * saveFarm: the registration fields only; the sede has its own use case.
 *
 * The db mock is a chainable update stub that captures the column values the
 * service asks for and answers `returning()` with the stored row fixture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Columns of the last `.set()` call. */
    columns: undefined as Record<string, unknown> | undefined,
    row: {} as Record<string, unknown>,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: () => {
      const builder = {
        set(columns: Record<string, unknown>) {
          state.columns = columns;
          return builder;
        },
        where() {
          return builder;
        },
        returning() {
          return Promise.resolve([state.row]);
        },
      };
      return builder;
    },
  },
}));

import { SaveFarmUseCase } from "../Save.useCase";

const REGISTRATION = {
  name: "Fazenda Boa Vista",
  municipality: "Uberaba",
  stateRegistration: "001",
  manager: "Lucas",
};

const STORED = {
  ...REGISTRATION,
  headquartersLat: -19.721,
  headquartersLng: -47.911,
  headquartersZoom: 15,
};

beforeEach(() => {
  state.columns = undefined;
  state.row = { ...STORED };
});

describe("saveFarm", () => {
  it("writes the registration fields and never the map view", async () => {
    await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(state.columns).toEqual(REGISTRATION);
  });

  it("returns what the database holds, not what the caller sent", async () => {
    const result = await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(result).toEqual({
      ...REGISTRATION,
      headquarters: { lat: -19.721, lng: -47.911, zoom: 15 },
    });
  });

  it("omits zoom from a stored view that has none", async () => {
    state.row = { ...STORED, headquartersZoom: null };

    const result = await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(result.headquarters).toEqual({ lat: -19.721, lng: -47.911 });
  });

  it("reports no headquarters when the columns are null", async () => {
    state.row = {
      ...STORED,
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    };

    const result = await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(result.headquarters).toBeUndefined();
  });
});
```

- [ ] **Step 5: Split the schema**

Replace the whole of `lib/api/domains/farm/schemas/farm.schema.ts` with:

```ts
/** Request schemas for the farm's registration data and saved map view. */

import { t } from "elysia";

/** Body of PUT /farm: the registration fields. The sede has its own route. */
export const FarmDataBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  stateRegistration: t.String(),
  manager: t.String(),
});

/**
 * Body of PUT /farm/headquarters: the saved map view, or null to clear it. It
 * is split from PUT /farm because the sede belongs to Lotes e Mapa and the
 * registration fields to Fazenda.
 */
export const HeadquartersBody = t.Object({
  headquarters: t.Union([
    t.Object({
      lat: t.Number({ minimum: -90, maximum: 90 }),
      lng: t.Number({ minimum: -180, maximum: 180 }),
      zoom: t.Optional(t.Integer({ minimum: 0, maximum: 24 })),
    }),
    t.Null(),
  ]),
});
```

- [ ] **Step 6: Create the session macro**

Create `lib/api/plugins/session.ts`:

```ts
/**
 * Elysia session-only macro: `{ session: true }` resolves the signed-in `user`
 * or answers 401, without choosing a farm. For the routes a user reaches before
 * belonging to one: their convites and "Criar minha fazenda".
 */
import { Elysia } from "elysia";
import { auth } from "@/lib/auth";

export const sessionPlugin = new Elysia({ name: "session" }).macro({
  session: {
    resolve: async ({ request, status }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return status(401, { error: "unauthorized" });
      return { user: session.user };
    },
  },
});
```

- [ ] **Step 7: Return levels with the farm list**

Replace the whole of `lib/api/domains/farm/useCases/Browse.useCase.ts` with:

```ts
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmUsers } from "@/lib/db/schema";
import {
  resolvePermissions,
  type FarmRole,
  type MemberPreset,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export interface FarmSummary {
  id: number;
  name: string;
  role: FarmRole;
  preset: MemberPreset | null;
  /** Resolved levels: the client never re-derives the Dono or superuser case. */
  permissions: Permissions;
  /** When the membership began; null for a superuser who is not a member. */
  joinedAt: string | null;
}

interface BrowseFarmsUseCaseProps {
  userId: string;
  superuser: boolean;
}

type BrowseFarmsUseCaseResponse = FarmSummary[];

type CurrUseCase = _UseCase<BrowseFarmsUseCaseProps, BrowseFarmsUseCaseResponse>;

/**
 * Lists the farms the user can access, first item being the default farm.
 *
 * Regular users see the farms they are members of (oldest membership first, the
 * same ordering the farm macro uses to pick the default farm). Superusers see
 * every farm, with their real role where a membership exists and "owner"
 * elsewhere, mirroring the bypass in lib/api/plugins/farm.ts.
 */
export class BrowseFarmsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BrowseFarmsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, superuser }) => {
    const columns = {
      id: farm.id,
      name: farm.name,
      role: farmUsers.role,
      preset: farmUsers.preset,
      permissions: farmUsers.permissions,
      joinedAt: farmUsers.createdAt,
    };

    if (superuser) {
      const rows = await this.repository
        .select(columns)
        .from(farm)
        .leftJoin(farmUsers, and(eq(farmUsers.farmId, farm.id), eq(farmUsers.userId, userId)))
        .orderBy(asc(farm.id));
      return rows.map((row) => {
        const role = row.role ?? "owner";
        return {
          id: row.id,
          name: row.name,
          role,
          preset: row.preset,
          permissions: resolvePermissions({ role, permissions: row.permissions }, true),
          joinedAt: row.joinedAt?.toISOString() ?? null,
        };
      });
    }

    const rows = await this.repository
      .select(columns)
      .from(farmUsers)
      .innerJoin(farm, eq(farm.id, farmUsers.farmId))
      .where(eq(farmUsers.userId, userId))
      .orderBy(asc(farmUsers.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      preset: row.preset,
      permissions: resolvePermissions(row, false),
      joinedAt: row.joinedAt.toISOString(),
    }));
  };
}
```

- [ ] **Step 8: Rewrite the controller**

Replace the whole of `lib/api/domains/farm/farm.controller.ts` with:

```ts
/**
 * The farm itself — its registration data and saved map view, the list of
 * farms the caller may switch between, and a first farm of one's own.
 *
 * The singular /farm is the active farm's record and /farm/headquarters its
 * sede; the plural /farms is the picker's list, and POST /farms runs before the
 * caller belongs to any farm ("Criar minha fazenda" on /convites).
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { sessionPlugin } from "@/lib/api/plugins/session";

import { BrowseFarmsUseCase } from "./useCases/Browse.useCase";
import { EnsureFarmForUserUseCase } from "./useCases/EnsureForUser.useCase";
import { SaveFarmUseCase } from "./useCases/Save.useCase";
import { SaveHeadquartersUseCase } from "./useCases/SaveHeadquarters.useCase";
import { FarmDataBody, HeadquartersBody } from "./schemas/farm.schema";

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
    async ({ user }) => ({
      farmId: await new EnsureFarmForUserUseCase().run({ userId: user.id }),
    }),
    { session: true }
  );
```

- [ ] **Step 9: Point the store's sede at the new route**

In `lib/store/useHerdStore.ts`, replace:

```ts
  saveHeadquarters: async (view) => {
    const { name, municipality, stateRegistration, manager } = get().farm;
    const { data, error } = await api.farm.put({
      name,
      municipality,
      stateRegistration,
      manager,
      headquarters: view,
    });
    if (error) apiFail("salvar a sede no mapa", error.status);
    set({ farm: { ...(data as FarmData) } });
  },
```

with:

```ts
  saveHeadquarters: async (view) => {
    const { data, error } = await api.farm.headquarters.put({ headquarters: view });
    if (error) apiFail("salvar a sede no mapa", error.status);
    set({ farm: { ...(data as FarmData) } });
  },
```

- [ ] **Step 10: Run the farm tests and refresh the route table**

Run: `pnpm exec vitest run lib/api/domains/farm && pnpm exec vitest run lib/api/__tests__/routeTable.test.ts -u && git diff lib/api/__tests__/__snapshots__/routeTable.test.ts.snap`
Expected: farm tests PASS; the snapshot diff adds exactly `"POST /api/herd/farms",` and `"PUT /api/herd/farm/headquarters",` and removes nothing.

- [ ] **Step 11: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (`FarmOption` in the store still has the old shape; Task 11 widens it. `farms` from the response is assignable because it has more fields.)

- [ ] **Step 12: No commit.**

---

### Task 8: Money rules in the herd and manejo routes

**Files:**
- Modify: `lib/api/domains/herd/herd.controller.ts` (whole file)
- Modify: `lib/api/domains/manejo/manejo.controller.ts` (the `POST /`, complete and delete handlers)
- Modify: `lib/api/domains/manejo/useCases/Delete.useCase.ts` (props and the row check)
- Test: `lib/api/domains/manejo/useCases/__tests__/Delete.test.ts`

**Interfaces:**
- Consumes: `can` (Task 1); `redactHerdMoney`, `redactManejoSession`, `redactPass`, `hasMoney`, `startNeedsFinance` (Task 2); `permissions` on the context (Task 6).
- Produces: `DeleteSessionUseCase.run({ farmId, id, canEditFinance })` may return `"finance_required"`; `POST /manejo` and `DELETE /manejo/:id` may answer 403 `{ error: "forbidden", area: "finance" }`.

- [ ] **Step 1: Write the failing delete test**

In `lib/api/domains/manejo/useCases/__tests__/Delete.test.ts`, change every existing call `new DeleteSessionUseCase().run({ farmId: 7, id: "s-1" })` to `new DeleteSessionUseCase().run({ farmId: 7, id: "s-1", canEditFinance: true })` and `run({ farmId: 7, id: "s-9" })` to `run({ farmId: 7, id: "s-9", canEditFinance: true })`. Then add, inside `describe("deleteSession", …)` after the last `it`:

```ts
  it("refuses a priced session to a member without Financeiro, before any write", async () => {
    state.selectResults = [[SALE_ROW]];

    const result = await new DeleteSessionUseCase().run({
      farmId: 7,
      id: "s-1",
      canEditFinance: false,
    });

    expect(result).toBe("finance_required");
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("lets a member without Financeiro delete a session with no values", async () => {
    state.selectResults = [
      [{ ...SALE_ROW, kind: "weighing", pricePerArroba: null, carcassYieldPct: null }],
      [],
    ];

    const result = await new DeleteSessionUseCase().run({
      farmId: 7,
      id: "s-1",
      canEditFinance: false,
    });

    expect(result).toMatchObject({ id: "s-1", removedEarTags: [] });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/api/domains/manejo/useCases/__tests__/Delete.test.ts`
Expected: FAIL: the first new case returns an object instead of `"finance_required"` (and `tsc` would flag the unknown `canEditFinance` prop).

- [ ] **Step 3: Add the rule to the use case**

In `lib/api/domains/manejo/useCases/Delete.useCase.ts`:

Add below `import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";`:

```ts
import { hasMoney } from "@/lib/domain/moneyRedaction";
```

Replace:

```ts
interface DeleteSessionUseCaseProps {
  farmId: number;
  id: string;
}

type DeleteSessionUseCaseResponse = DeletedManejo | { blocked: BlockedAnimal[] } | "session_not_found";
```

with:

```ts
interface DeleteSessionUseCaseProps {
  farmId: number;
  id: string;
  /** False for a member without Financeiro edit: a session with values stays. */
  canEditFinance: boolean;
}

type DeleteSessionUseCaseResponse =
  | DeletedManejo
  | { blocked: BlockedAnimal[] }
  | "session_not_found"
  | "finance_required";
```

Replace:

```ts
  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
```

with:

```ts
  public run: CurrUseCase["run"] = async ({ farmId, id, canEditFinance }) => {
```

Replace:

```ts
      if (!row) return "session_not_found";
```

with:

```ts
      if (!row) return "session_not_found";
      // Deleting a priced venda, entrada or costed treatment takes money out of
      // the financeiro, which only Financeiro edit may do.
      if (
        !canEditFinance &&
        hasMoney({
          pricePerArroba: row.pricePerArroba,
          totalAmountBrl: row.totalAmountBrl,
          planCostBrl: row.planCostBrl,
        })
      ) {
        return "finance_required";
      }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run lib/api/domains/manejo/useCases/__tests__/Delete.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the manejo controller**

In `lib/api/domains/manejo/manejo.controller.ts`:

Add below `import { farmPlugin } from "@/lib/api/plugins/farm";`:

```ts
import { can } from "@/lib/domain/permissions";
import {
  redactManejoSession,
  redactPass,
  startNeedsFinance,
} from "@/lib/domain/moneyRedaction";
```

Replace the `POST /` handler:

```ts
    async ({ farmId, body, status }) => {
      // Only an entry (compra) starts with no animals: they are registered as
      // they arrive. Transfers need somewhere to land.
      if (body.earTags.length === 0 && body.kind !== "entry") {
        return status(422, { error: "animals_required" });
      }
      if (
        (body.kind === "transfer" || body.kind === "entry") &&
        body.destinationLotId === undefined
      ) {
        return status(422, { error: "destination_required" });
      }
      const session = await new StartSessionUseCase().run({ farmId, input: body });
      if (session === "lot_not_found") return status(404, { error: session });
      if (session === null) return status(404, { error: "animal_not_found" });
      return session;
    },
```

with:

```ts
    async ({ farmId, permissions, body, status }) => {
      // Only an entry (compra) starts with no animals: they are registered as
      // they arrive. Transfers need somewhere to land.
      if (body.earTags.length === 0 && body.kind !== "entry") {
        return status(422, { error: "animals_required" });
      }
      if (
        (body.kind === "transfer" || body.kind === "entry") &&
        body.destinationLotId === undefined
      ) {
        return status(422, { error: "destination_required" });
      }
      // A venda or entrada is opened with its price by whoever holds the money.
      if (startNeedsFinance(body) && !can(permissions, "finance", "edit")) {
        return status(403, { error: "forbidden", area: "finance" });
      }
      const session = await new StartSessionUseCase().run({ farmId, input: body });
      if (session === "lot_not_found") return status(404, { error: session });
      if (session === null) return status(404, { error: "animal_not_found" });
      return can(permissions, "finance", "view") ? session : redactManejoSession(session);
    },
```

In the `"/:id/animals/:animalId/complete"` handler, replace:

```ts
    async ({ farmId, params, body, status }) => {
      const result = await new CompleteAnimalUseCase().run({
```

with:

```ts
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new CompleteAnimalUseCase().run({
```

and, in the same handler, replace:

```ts
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: ManejoPassBody }
```

with:

```ts
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return can(permissions, "finance", "view") ? result : redactPass(result);
    },
    { farm: true, body: ManejoPassBody }
```

Replace the delete handler:

```ts
    async ({ farmId, params, status }) => {
      const result = await new DeleteSessionUseCase().run({ farmId, id: params.id });
      if (result === "session_not_found") return status(404, { error: result });
      if ("blocked" in result) return status(409, result);
      return result;
    },
```

with:

```ts
    async ({ farmId, permissions, params, status }) => {
      const result = await new DeleteSessionUseCase().run({
        farmId,
        id: params.id,
        canEditFinance: can(permissions, "finance", "edit"),
      });
      if (result === "session_not_found") return status(404, { error: result });
      if (result === "finance_required") {
        return status(403, { error: "forbidden", area: "finance" });
      }
      if ("blocked" in result) return status(409, result);
      return result;
    },
```

- [ ] **Step 6: Redact the herd read**

Replace the whole of `lib/api/domains/herd/herd.controller.ts` with:

```ts
/**
 * The herd read path — the single GET the client hydrates its whole store
 * from, plus a health probe that confirms the session resolved to a farm.
 *
 * A member without Financeiro gets the herd with every BRL value stripped: the
 * payload is the whole farm, so hiding money in the UI alone would still ship
 * it to the browser.
 *
 * Neither route takes a prefix: "/" is the API root.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { can } from "@/lib/domain/permissions";
import { redactHerdMoney } from "@/lib/domain/moneyRedaction";

import { LoadHerdUseCase } from "./useCases/Load.useCase";

export const herdController = new Elysia()
  .use(farmPlugin)
  .get("/health", ({ farmId }) => ({ ok: true, farmId }), { farm: true })
  .get(
    "/",
    async ({ farmId, permissions }) => {
      const data = await new LoadHerdUseCase().run({ farmId });
      return can(permissions, "finance", "view") ? data : redactHerdMoney(data);
    },
    { farm: true }
  );
```

- [ ] **Step 7: Typecheck and run the API suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run lib/api`
Expected: no type errors; all pass.

- [ ] **Step 8: No commit.**

---

### Task 9: Team API

**Files:**
- Create: `lib/api/__tests__/dbStub.ts`
- Create: `lib/api/domains/team/schemas/team.schema.ts`
- Create: `lib/api/domains/team/useCases/BrowseTeam.useCase.ts`
- Create: `lib/api/domains/team/useCases/Invite.useCase.ts`
- Create: `lib/api/domains/team/useCases/CancelInvite.useCase.ts`
- Create: `lib/api/domains/team/useCases/UpdateMember.useCase.ts`
- Create: `lib/api/domains/team/useCases/RemoveMember.useCase.ts`
- Create: `lib/api/domains/team/useCases/Leave.useCase.ts`
- Create: `lib/api/domains/team/team.controller.ts`
- Test: `lib/api/domains/team/useCases/__tests__/Invite.test.ts`, `…/UpdateMember.test.ts`, `…/RemoveMember.test.ts`, `…/Leave.test.ts`, `…/BrowseTeam.test.ts`
- Modify: `lib/api/app.ts`
- Modify: `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` (regenerated)

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 6.
- Produces:
  - `TeamActor = { userId: string; role: FarmRole; permissions: Permissions }`
  - `TeamMember = { userId; name; email; role: FarmRole; preset: MemberPreset | null; permissions: Permissions; joinedAt: string; isYou: boolean; manage: ManageVerdict }`
  - `TeamInvite = { id: number; email: string; preset: MemberPreset; permissions: Permissions; state: ListedInviteState; expiresAt: string; respondedAt: string | null }`
  - `TeamView = { members: TeamMember[]; invites: TeamInvite[] }`
  - Routes: `GET /api/herd/farm/team` → `TeamView`; `POST /api/herd/farm/invites` body `{ email, permissions }` → `TeamInvite` | 422 `invalid_email` | 409 `already_member` | 403 `forbidden`; `DELETE /api/herd/farm/invites/:id` → `{ id }` | 404; `PATCH /api/herd/farm/members/:userId` body `{ permissions }` → `{ preset, permissions }` | 404 | 403 `{ error: "blocked", reason }` | 403 `forbidden`; `DELETE /api/herd/farm/members/:userId` → `{ removed: true }` | 404 | 403 blocked; `POST /api/herd/farm/leave` → `{ left: true }` | 409 `owner_cannot_leave`.

- [ ] **Step 1: Create the shared db stub**

Create `lib/api/__tests__/dbStub.ts`:

```ts
/**
 * Chainable Drizzle stub for use-case tests, the pattern Delete.test.ts
 * established, shared by the team and invite tests.
 *
 * Selects resolve, in call order, to the rows queued in `selectResults`.
 * `update().set()` and `insert().values()` record what they were given, and a
 * `returning()` after either resolves to the next entry of `returning`.
 * `delete()` counts. `transaction(run)` runs `run` against the same handle.
 *
 * Use from a test with a hoisted state:
 *   const { state } = vi.hoisted(() => ({ state: emptyDbState() }));
 *   vi.mock("@/lib/db", async () => ({ db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state) }));
 * `emptyDbState` cannot be imported inside vi.hoisted, so tests inline the
 * object literal it returns.
 */
export interface DbStubState {
  selectResults: unknown[][];
  updates: Record<string, unknown>[];
  inserts: unknown[];
  deletes: number;
  returning: unknown[][];
}

type Resolve = (value: unknown) => unknown;

function thenable<T extends object>(builder: T, value: () => unknown): T & { then: (resolve: Resolve) => unknown } {
  return Object.assign(builder, { then: (resolve: Resolve) => resolve(value()) });
}

export function createDbStub(state: DbStubState) {
  const nextReturning = () => Promise.resolve(state.returning.shift() ?? []);

  const handle = {
    select: () => {
      const rows = state.selectResults.shift() ?? [];
      const builder: Record<string, () => unknown> = {};
      for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
        builder[method] = () => chain;
      }
      const chain = thenable(builder, () => rows);
      return chain;
    },
    update: () => {
      const builder = {
        set(columns: Record<string, unknown>) {
          state.updates.push(columns);
          return chain;
        },
        where: () => chain,
        returning: nextReturning,
      };
      const chain = thenable(builder, () => undefined);
      return chain;
    },
    insert: () => ({
      values(values: unknown) {
        state.inserts.push(values);
        return thenable({ returning: nextReturning }, () => undefined);
      },
    }),
    delete: () => ({
      where: () => {
        state.deletes += 1;
        return thenable({ returning: nextReturning }, () => undefined);
      },
    }),
  };

  return {
    ...handle,
    transaction: (run: (tx: typeof handle) => unknown) => Promise.resolve(run(handle)),
  };
}
```

- [ ] **Step 2: Write the failing use-case tests**

Create `lib/api/domains/team/useCases/__tests__/Invite.test.ts`:

```ts
/**
 * inviteMember: a convite by e-mail, bounded by the inviter's own levels,
 * refreshing a pending one and replacing a declined one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { InviteMemberUseCase } from "../Invite.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };

const storedInvite = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  farmId: 7,
  email: "zeca@hotmail.com",
  preset: "vaqueiro",
  permissions: PRESETS.vaqueiro,
  status: "pending",
  invitedByUserId: "u-owner",
  createdAt: now,
  expiresAt: new Date("2026-09-19T15:00:00Z"),
  respondedAt: null,
  ...overrides,
});

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
});

describe("inviteMember", () => {
  it("refuses a malformed e-mail before touching the database", async () => {
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(result).toBe("invalid_email");
    expect(state.inserts).toEqual([]);
  });

  it("refuses levels above the inviter's", async () => {
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: { ...FULL_PERMISSIONS, finance: "view" } },
      email: "zeca@hotmail.com",
      permissions: PRESETS.gerente,
      now,
    });
    expect(result).toEqual({ forbidden: "finance" });
  });

  it("refuses an e-mail that already belongs to a member", async () => {
    state.selectResults = [[{ userId: "u-zeca" }]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: " Zeca@Hotmail.com ",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(result).toBe("already_member");
    expect(state.inserts).toEqual([]);
  });

  it("refreshes a pending convite instead of adding a second one", async () => {
    state.selectResults = [[], [{ id: 3 }]];
    state.returning = [[storedInvite({ preset: "consultor", permissions: PRESETS.consultor })]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca@hotmail.com",
      permissions: PRESETS.consultor,
      now,
    });
    expect(state.inserts).toEqual([]);
    expect(state.updates[0]).toMatchObject({
      preset: "consultor",
      permissions: PRESETS.consultor,
      expiresAt: new Date("2026-09-19T15:00:00Z"),
    });
    expect(result).toMatchObject({ id: 3, state: "pending", preset: "consultor" });
  });

  it("cancels a declined convite and creates a new pending one", async () => {
    state.selectResults = [[], []];
    state.returning = [[storedInvite({ id: 4 })]];
    const result = await new InviteMemberUseCase().run({
      farmId: 7,
      actor: owner,
      email: "zeca@hotmail.com",
      permissions: PRESETS.vaqueiro,
      now,
    });
    expect(state.updates[0]).toEqual({ status: "canceled", respondedAt: now });
    expect(state.inserts[0]).toMatchObject({
      farmId: 7,
      email: "zeca@hotmail.com",
      preset: "vaqueiro",
      invitedByUserId: "u-owner",
    });
    expect(result).toMatchObject({ id: 4, email: "zeca@hotmail.com", state: "pending" });
  });
});
```

Create `lib/api/domains/team/useCases/__tests__/UpdateMember.test.ts`:

```ts
/** updateMember: new levels for someone the actor may manage and within their ceiling. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { UpdateMemberUseCase } from "../UpdateMember.useCase";

const marta = {
  userId: "u-marta",
  role: "member" as const,
  permissions: { ...FULL_PERMISSIONS, finance: "view" as const },
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
});

describe("updateMember", () => {
  it("answers not_found for someone outside the farm", async () => {
    state.selectResults = [[]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-nobody",
      permissions: PRESETS.consultor,
    });
    expect(result).toBe("not_found");
  });

  it("never touches the Dono", async () => {
    state.selectResults = [[{ role: "owner", permissions: null }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-owner",
      permissions: PRESETS.consultor,
    });
    expect(result).toEqual({ blocked: "owner" });
    expect(state.updates).toEqual([]);
  });

  it("never lets the actor change their own levels", async () => {
    state.selectResults = [[{ role: "member", permissions: marta.permissions }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-marta",
      permissions: FULL_PERMISSIONS,
    });
    expect(result).toEqual({ blocked: "self" });
  });

  it("refuses a member who holds more than the actor", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.gerente }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-roberto",
      permissions: PRESETS.vaqueiro,
    });
    expect(result).toEqual({ blocked: "above" });
  });

  it("refuses a grant above the actor's level", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-joao",
      permissions: { ...PRESETS.vaqueiro, finance: "edit" },
    });
    expect(result).toEqual({ forbidden: "finance" });
  });

  it("stores the parsed levels with the preset they match", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    const result = await new UpdateMemberUseCase().run({
      farmId: 7,
      actor: marta,
      userId: "u-joao",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
    expect(state.updates[0]).toEqual({
      preset: "personalizado",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
    expect(result).toEqual({
      preset: "personalizado",
      permissions: { ...PRESETS.vaqueiro, finance: "view" },
    });
  });
});
```

Create `lib/api/domains/team/useCases/__tests__/RemoveMember.test.ts`:

```ts
/** removeMember: the same reach rules as updateMember, then the membership goes. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { RemoveMemberUseCase } from "../RemoveMember.useCase";

const owner = { userId: "u-owner", role: "owner" as const, permissions: FULL_PERMISSIONS };

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
});

describe("removeMember", () => {
  it("removes a member the actor may manage", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.vaqueiro }]];
    const result = await new RemoveMemberUseCase().run({ farmId: 7, actor: owner, userId: "u-joao" });
    expect(result).toBe("removed");
    expect(state.deletes).toBe(1);
  });

  it("never removes the Dono", async () => {
    state.selectResults = [[{ role: "owner", permissions: null }]];
    const result = await new RemoveMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: FULL_PERMISSIONS },
      userId: "u-owner",
    });
    expect(result).toEqual({ blocked: "owner" });
    expect(state.deletes).toBe(0);
  });

  it("answers not_found for someone outside the farm", async () => {
    state.selectResults = [[]];
    const result = await new RemoveMemberUseCase().run({ farmId: 7, actor: owner, userId: "u-x" });
    expect(result).toBe("not_found");
  });

  it("never removes the actor themselves", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.gerente }]];
    const result = await new RemoveMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-joao", role: "member", permissions: PRESETS.gerente },
      userId: "u-joao",
    });
    expect(result).toEqual({ blocked: "self" });
    expect(state.deletes).toBe(0);
  });

  it("never removes a member who holds more than the actor", async () => {
    state.selectResults = [[{ role: "member", permissions: PRESETS.gerente }]];
    const result = await new RemoveMemberUseCase().run({
      farmId: 7,
      actor: { userId: "u-marta", role: "member", permissions: { ...FULL_PERMISSIONS, finance: "view" } },
      userId: "u-roberto",
    });
    expect(result).toEqual({ blocked: "above" });
    expect(state.deletes).toBe(0);
  });
});
```

Create `lib/api/domains/team/useCases/__tests__/Leave.test.ts`:

```ts
/** leaveFarm: any member but the Dono walks out. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { LeaveFarmUseCase } from "../Leave.useCase";

beforeEach(() => {
  state.deletes = 0;
});

describe("leaveFarm", () => {
  it("refuses the Dono", async () => {
    const result = await new LeaveFarmUseCase().run({ farmId: 7, userId: "u-owner", role: "owner" });
    expect(result).toBe("owner_cannot_leave");
    expect(state.deletes).toBe(0);
  });

  it("deletes a member's own membership", async () => {
    const result = await new LeaveFarmUseCase().run({ farmId: 7, userId: "u-joao", role: "member" });
    expect(result).toBe("left");
    expect(state.deletes).toBe(1);
  });
});
```

Create `lib/api/domains/team/useCases/__tests__/BrowseTeam.test.ts`:

```ts
/** browseTeam: members with what the caller may do to each, and the listed convites. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { BrowseTeamUseCase } from "../BrowseTeam.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const joined = new Date("2026-08-14T12:00:00Z");

beforeEach(() => {
  state.selectResults = [];
});

describe("browseTeam", () => {
  it("lists the Dono first and says who the caller may manage", async () => {
    state.selectResults = [
      [
        { userId: "u-joao", role: "member", preset: "vaqueiro", permissions: PRESETS.vaqueiro, joinedAt: joined, name: "João", email: "joao@gmail.com" },
        { userId: "u-owner", role: "owner", preset: null, permissions: null, joinedAt: joined, name: "Lucas", email: "lucas@maranata.com.br" },
      ],
      [],
    ];
    const view = await new BrowseTeamUseCase().run({
      farmId: 7,
      actor: { userId: "u-owner", role: "owner", permissions: FULL_PERMISSIONS },
      now,
    });
    expect(view.members.map((m) => m.userId)).toEqual(["u-owner", "u-joao"]);
    expect(view.members[0]).toMatchObject({ isYou: true, permissions: FULL_PERMISSIONS, manage: { ok: false, reason: "owner" } });
    expect(view.members[1]).toMatchObject({ isYou: false, joinedAt: "2026-08-14T12:00:00.000Z", manage: { ok: true } });
  });

  it("keeps the latest convite per e-mail and derives expiry", async () => {
    state.selectResults = [
      [],
      [
        { id: 9, farmId: 7, email: "pedro@gmail.com", preset: "vaqueiro", permissions: PRESETS.vaqueiro, status: "pending", invitedByUserId: null, createdAt: now, expiresAt: new Date("2026-09-02T12:00:00Z"), respondedAt: null },
        { id: 8, farmId: 7, email: "rafael@agrocampo.com.br", preset: "consultor", permissions: PRESETS.consultor, status: "declined", invitedByUserId: null, createdAt: now, expiresAt: new Date("2026-09-10T12:00:00Z"), respondedAt: new Date("2026-09-08T12:00:00Z") },
        { id: 2, farmId: 7, email: "pedro@gmail.com", preset: "vaqueiro", permissions: PRESETS.vaqueiro, status: "declined", invitedByUserId: null, createdAt: joined, expiresAt: joined, respondedAt: joined },
      ],
    ];
    const view = await new BrowseTeamUseCase().run({
      farmId: 7,
      actor: { userId: "u-owner", role: "owner", permissions: FULL_PERMISSIONS },
      now,
    });
    expect(view.invites.map((i) => [i.id, i.state])).toEqual([
      [9, "expired"],
      [8, "declined"],
    ]);
    expect(view.invites[1].respondedAt).toBe("2026-09-08T12:00:00.000Z");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm exec vitest run lib/api/domains/team`
Expected: FAIL, the `../*.useCase` modules do not exist.

- [ ] **Step 4: Create the schemas**

Create `lib/api/domains/team/schemas/team.schema.ts`:

```ts
/** Request schemas for the team routes: convites and member levels. */

import { t } from "elysia";

const LevelModel = t.Union([t.Literal("none"), t.Literal("view"), t.Literal("edit")]);

/** One level per area. Floors and the actor's ceiling are enforced by the use cases. */
export const PermissionsBody = t.Object({
  herd: LevelModel,
  manejo: LevelModel,
  reproduction: LevelModel,
  sanitary: LevelModel,
  lots: LevelModel,
  finance: LevelModel,
  farm: LevelModel,
  team: LevelModel,
});

/** Body of POST /farm/invites. The preset is derived from the levels, never sent. */
export const InviteBody = t.Object({
  email: t.String({ minLength: 1, maxLength: 320 }),
  permissions: PermissionsBody,
});

/** Body of PATCH /farm/members/:userId. */
export const MemberPatchBody = t.Object({
  permissions: PermissionsBody,
});
```

- [ ] **Step 5: Create the use cases**

Create `lib/api/domains/team/useCases/BrowseTeam.useCase.ts`:

```ts
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites, farmUsers, user, type FarmInviteRow } from "@/lib/db/schema";
import { inviteState, type ListedInviteState } from "@/lib/domain/invites";
import {
  canManage,
  parsePermissions,
  resolvePermissions,
  type FarmRole,
  type ManageVerdict,
  type MemberPreset,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** Whoever is looking at or changing the team. */
export interface TeamActor {
  userId: string;
  role: FarmRole;
  permissions: Permissions;
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: FarmRole;
  preset: MemberPreset | null;
  permissions: Permissions;
  joinedAt: string;
  isYou: boolean;
  /** Whether the caller may change or remove this member, and why not. */
  manage: ManageVerdict;
}

export interface TeamInvite {
  id: number;
  email: string;
  preset: MemberPreset;
  permissions: Permissions;
  state: ListedInviteState;
  expiresAt: string;
  respondedAt: string | null;
}

export interface TeamView {
  members: TeamMember[];
  invites: TeamInvite[];
}

export function toTeamInvite(row: FarmInviteRow, state: ListedInviteState): TeamInvite {
  return {
    id: row.id,
    email: row.email,
    preset: row.preset,
    permissions: parsePermissions(row.permissions),
    state,
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

interface BrowseTeamUseCaseProps {
  farmId: number;
  actor: TeamActor;
  now: Date;
}

type CurrUseCase = _UseCase<BrowseTeamUseCaseProps, TeamView>;

/**
 * The Equipe page: every member with the Dono first, and the convites the
 * owner's list shows — pending, expired and declined, the latest one per
 * e-mail. Accepted and canceled convites stay in the table for history only.
 */
export class BrowseTeamUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BrowseTeamUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, now }) => {
    const [memberRows, inviteRows] = await Promise.all([
      this.repository
        .select({
          userId: farmUsers.userId,
          role: farmUsers.role,
          preset: farmUsers.preset,
          permissions: farmUsers.permissions,
          joinedAt: farmUsers.createdAt,
          name: user.name,
          email: user.email,
        })
        .from(farmUsers)
        .innerJoin(user, eq(user.id, farmUsers.userId))
        .where(eq(farmUsers.farmId, farmId))
        .orderBy(asc(farmUsers.createdAt)),
      this.repository
        .select()
        .from(farmInvites)
        .where(
          and(eq(farmInvites.farmId, farmId), inArray(farmInvites.status, ["pending", "declined"]))
        )
        .orderBy(desc(farmInvites.createdAt)),
    ]);

    const members = memberRows
      .map((row): TeamMember => {
        const permissions = resolvePermissions(row, false);
        return {
          userId: row.userId,
          name: row.name,
          email: row.email,
          role: row.role,
          preset: row.preset,
          permissions,
          joinedAt: row.joinedAt.toISOString(),
          isYou: row.userId === actor.userId,
          manage: canManage(actor, { userId: row.userId, role: row.role, permissions }),
        };
      })
      .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));

    const seen = new Set<string>();
    const invites: TeamInvite[] = [];
    for (const row of inviteRows) {
      if (seen.has(row.email)) continue;
      seen.add(row.email);
      const state = inviteState(row, now);
      if (state !== null) invites.push(toTeamInvite(row, state));
    }

    return { members, invites };
  };
}
```

Create `lib/api/domains/team/useCases/Invite.useCase.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites, farmUsers, user } from "@/lib/db/schema";
import { inviteExpiry, isValidEmail, normalizeEmail } from "@/lib/domain/invites";
import {
  canGrant,
  parsePermissions,
  presetFor,
  type Area,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { toTeamInvite, type TeamActor, type TeamInvite } from "./BrowseTeam.useCase";

interface InviteMemberUseCaseProps {
  farmId: number;
  actor: TeamActor;
  email: string;
  permissions: Permissions;
  now: Date;
}

type InviteMemberUseCaseResponse =
  | TeamInvite
  | "invalid_email"
  | "already_member"
  | { forbidden: Area };

type CurrUseCase = _UseCase<InviteMemberUseCaseProps, InviteMemberUseCaseResponse>;

/**
 * Creates or refreshes a convite. Nothing is sent: the convite waits for
 * whoever signs in with the e-mail. A pending convite for the same e-mail is
 * updated in place (the partial unique index allows one); a declined one is
 * closed as canceled so the list shows only the new one.
 */
export class InviteMemberUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("InviteMemberUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, email, permissions, now }) => {
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) return "invalid_email";
    const next = parsePermissions(permissions);
    const grant = canGrant(actor.permissions, next);
    if (!grant.ok) return { forbidden: grant.area };

    return this.repository.transaction(async (tx) => {
      const [member] = await tx
        .select({ userId: farmUsers.userId })
        .from(farmUsers)
        .innerJoin(user, eq(user.id, farmUsers.userId))
        .where(and(eq(farmUsers.farmId, farmId), eq(sql`lower(${user.email})`, clean)))
        .limit(1);
      if (member) return "already_member";

      const fields = {
        preset: presetFor(next),
        permissions: next,
        expiresAt: inviteExpiry(now),
        invitedByUserId: actor.userId,
      };

      const [pending] = await tx
        .select({ id: farmInvites.id })
        .from(farmInvites)
        .where(
          and(
            eq(farmInvites.farmId, farmId),
            eq(farmInvites.email, clean),
            eq(farmInvites.status, "pending")
          )
        )
        .limit(1);
      if (pending) {
        const [row] = await tx
          .update(farmInvites)
          .set(fields)
          .where(eq(farmInvites.id, pending.id))
          .returning();
        return toTeamInvite(row, "pending");
      }

      await tx
        .update(farmInvites)
        .set({ status: "canceled", respondedAt: now })
        .where(
          and(
            eq(farmInvites.farmId, farmId),
            eq(farmInvites.email, clean),
            eq(farmInvites.status, "declined")
          )
        );
      const [row] = await tx
        .insert(farmInvites)
        .values({ farmId, email: clean, ...fields })
        .returning();
      return toTeamInvite(row, "pending");
    });
  };
}
```

Create `lib/api/domains/team/useCases/CancelInvite.useCase.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CancelInviteUseCaseProps {
  farmId: number;
  id: number;
  now: Date;
}

type CurrUseCase = _UseCase<CancelInviteUseCaseProps, boolean>;

/**
 * "Cancelar convite" on a pending convite and "Remover da lista" on a declined
 * one: both close it as canceled, which the list never shows. False when the
 * convite is not this farm's or is already closed.
 */
export class CancelInviteUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CancelInviteUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, now }) => {
    const rows = await this.repository
      .update(farmInvites)
      .set({ status: "canceled", respondedAt: now })
      .where(
        and(
          eq(farmInvites.id, id),
          eq(farmInvites.farmId, farmId),
          inArray(farmInvites.status, ["pending", "declined"])
        )
      )
      .returning({ id: farmInvites.id });
    return rows.length > 0;
  };
}
```

Create `lib/api/domains/team/useCases/UpdateMember.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmUsers } from "@/lib/db/schema";
import {
  canGrant,
  canManage,
  parsePermissions,
  presetFor,
  resolvePermissions,
  type Area,
  type ManageBlock,
  type MemberPreset,
  type Permissions,
} from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import type { TeamActor } from "./BrowseTeam.useCase";

interface UpdateMemberUseCaseProps {
  farmId: number;
  actor: TeamActor;
  userId: string;
  permissions: Permissions;
}

type UpdateMemberUseCaseResponse =
  | "not_found"
  | { blocked: ManageBlock }
  | { forbidden: Area }
  | { preset: MemberPreset; permissions: Permissions };

type CurrUseCase = _UseCase<UpdateMemberUseCaseProps, UpdateMemberUseCaseResponse>;

/**
 * Changes a member's levels. The actor must be able to reach the member (not
 * the Dono, not themselves, nobody holding more) and may not grant above their
 * own levels. The preset is derived from the stored levels.
 */
export class UpdateMemberUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateMemberUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, userId, permissions }) => {
    const where = and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, userId));
    const [target] = await this.repository
      .select({ role: farmUsers.role, permissions: farmUsers.permissions })
      .from(farmUsers)
      .where(where)
      .limit(1);
    if (!target) return "not_found";

    const manage = canManage(actor, {
      userId,
      role: target.role,
      permissions: resolvePermissions(target, false),
    });
    if (!manage.ok) return { blocked: manage.reason };

    const next = parsePermissions(permissions);
    const grant = canGrant(actor.permissions, next);
    if (!grant.ok) return { forbidden: grant.area };

    const preset = presetFor(next);
    await this.repository.update(farmUsers).set({ preset, permissions: next }).where(where);
    return { preset, permissions: next };
  };
}
```

Create `lib/api/domains/team/useCases/RemoveMember.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmUsers } from "@/lib/db/schema";
import { canManage, resolvePermissions, type ManageBlock } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import type { TeamActor } from "./BrowseTeam.useCase";

interface RemoveMemberUseCaseProps {
  farmId: number;
  actor: TeamActor;
  userId: string;
}

type RemoveMemberUseCaseResponse = "not_found" | { blocked: ManageBlock } | "removed";

type CurrUseCase = _UseCase<RemoveMemberUseCaseProps, RemoveMemberUseCaseResponse>;

/**
 * Takes a member out of the farm under the same reach rules as a level change.
 * Their next request answers 403 not_a_member, which the client already turns
 * into a return to their own farm.
 */
export class RemoveMemberUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("RemoveMemberUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, actor, userId }) => {
    const where = and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, userId));
    const [target] = await this.repository
      .select({ role: farmUsers.role, permissions: farmUsers.permissions })
      .from(farmUsers)
      .where(where)
      .limit(1);
    if (!target) return "not_found";

    const manage = canManage(actor, {
      userId,
      role: target.role,
      permissions: resolvePermissions(target, false),
    });
    if (!manage.ok) return { blocked: manage.reason };

    await this.repository.delete(farmUsers).where(where);
    return "removed";
  };
}
```

Create `lib/api/domains/team/useCases/Leave.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmUsers } from "@/lib/db/schema";
import type { FarmRole } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface LeaveFarmUseCaseProps {
  farmId: number;
  userId: string;
  role: FarmRole;
}

type CurrUseCase = _UseCase<LeaveFarmUseCaseProps, "owner_cannot_leave" | "left">;

/** "Sair da fazenda": any member but the Dono, who carries the farm and its plan. */
export class LeaveFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("LeaveFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, role }) => {
    if (role === "owner") return "owner_cannot_leave";
    await this.repository
      .delete(farmUsers)
      .where(and(eq(farmUsers.farmId, farmId), eq(farmUsers.userId, userId)));
    return "left";
  };
}
```

- [ ] **Step 6: Run the use-case tests**

Run: `pnpm exec vitest run lib/api/domains/team`
Expected: PASS (all five files).

- [ ] **Step 7: Create the controller and mount it**

Create `lib/api/domains/team/team.controller.ts`:

```ts
/**
 * The farm's team: who is in it, the convites waiting to be claimed, and each
 * member's levels. Permission to reach these routes comes from
 * ROUTE_REQUIREMENTS (Equipe view to read, Equipe edit to change); who may be
 * changed, and how far, is decided by the use cases.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { BrowseTeamUseCase } from "./useCases/BrowseTeam.useCase";
import { CancelInviteUseCase } from "./useCases/CancelInvite.useCase";
import { InviteMemberUseCase } from "./useCases/Invite.useCase";
import { LeaveFarmUseCase } from "./useCases/Leave.useCase";
import { RemoveMemberUseCase } from "./useCases/RemoveMember.useCase";
import { UpdateMemberUseCase } from "./useCases/UpdateMember.useCase";
import { InviteBody, MemberPatchBody } from "./schemas/team.schema";

export const teamController = new Elysia({ prefix: "/farm" })
  .use(farmPlugin)
  .get(
    "/team",
    ({ farmId, user, farmRole, permissions }) =>
      new BrowseTeamUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        now: new Date(),
      }),
    { farm: true }
  )
  .post(
    "/invites",
    async ({ farmId, user, farmRole, permissions, body, status }) => {
      const result = await new InviteMemberUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        email: body.email,
        permissions: body.permissions,
        now: new Date(),
      });
      if (result === "invalid_email") return status(422, { error: result });
      if (result === "already_member") return status(409, { error: result });
      if ("forbidden" in result) {
        return status(403, { error: "forbidden", area: result.forbidden });
      }
      return result;
    },
    { farm: true, body: InviteBody }
  )
  .delete(
    "/invites/:id",
    async ({ farmId, params, status }) => {
      const id = Number(params.id);
      const canceled =
        Number.isInteger(id) &&
        (await new CancelInviteUseCase().run({ farmId, id, now: new Date() }));
      if (!canceled) return status(404, { error: "not_found" });
      return { id };
    },
    { farm: true }
  )
  .patch(
    "/members/:userId",
    async ({ farmId, user, farmRole, permissions, params, body, status }) => {
      const result = await new UpdateMemberUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        userId: params.userId,
        permissions: body.permissions,
      });
      if (result === "not_found") return status(404, { error: result });
      if ("blocked" in result) return status(403, { error: "blocked", reason: result.blocked });
      if ("forbidden" in result) {
        return status(403, { error: "forbidden", area: result.forbidden });
      }
      return result;
    },
    { farm: true, body: MemberPatchBody }
  )
  .delete(
    "/members/:userId",
    async ({ farmId, user, farmRole, permissions, params, status }) => {
      const result = await new RemoveMemberUseCase().run({
        farmId,
        actor: { userId: user.id, role: farmRole, permissions },
        userId: params.userId,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result !== "removed") return status(403, { error: "blocked", reason: result.blocked });
      return { removed: true };
    },
    { farm: true }
  )
  .post(
    "/leave",
    async ({ farmId, user, farmRole, status }) => {
      const result = await new LeaveFarmUseCase().run({
        farmId,
        userId: user.id,
        role: farmRole,
      });
      if (result === "owner_cannot_leave") return status(409, { error: result });
      return { left: true };
    },
    { farm: true }
  );
```

In `lib/api/app.ts`, add below `import { protocolsController } from "@/lib/api/domains/protocols/protocols.controller";`:

```ts
import { teamController } from "@/lib/api/domains/team/team.controller";
```

and replace:

```ts
  .use(farmController)
  .use(protocolsController)
```

with:

```ts
  .use(farmController)
  .use(teamController)
  .use(protocolsController)
```

- [ ] **Step 8: Refresh the route table and typecheck**

Run: `pnpm exec vitest run lib/api/__tests__/routeTable.test.ts -u && git diff lib/api/__tests__/__snapshots__/routeTable.test.ts.snap && pnpm exec tsc --noEmit`
Expected: the diff adds exactly `DELETE /api/herd/farm/invites/:id`, `DELETE /api/herd/farm/members/:userId`, `GET /api/herd/farm/team`, `PATCH /api/herd/farm/members/:userId`, `POST /api/herd/farm/invites`, `POST /api/herd/farm/leave` (plus the two from Task 7 already present). No type errors.

- [ ] **Step 9: No commit.**

---

### Task 10: Invitee API, route completeness and an end-to-end permission test

**Files:**
- Create: `lib/api/domains/invites/useCases/BrowseMine.useCase.ts`
- Create: `lib/api/domains/invites/useCases/Accept.useCase.ts`
- Create: `lib/api/domains/invites/useCases/Decline.useCase.ts`
- Create: `lib/api/domains/invites/invites.controller.ts`
- Test: `lib/api/domains/invites/useCases/__tests__/Accept.test.ts`, `…/BrowseMine.test.ts`
- Modify: `lib/api/app.ts`
- Modify: `lib/api/__tests__/routeRequirements.test.ts` (append completeness tests)
- Create: `lib/api/__tests__/permissions.test.ts`
- Modify: `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` (regenerated); new snapshot for route requirements

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 7 (`sessionPlugin`), 9.
- Produces:
  - `MyInvite = { id: number; farmId: number; farmName: string; municipality: string; invitedByName: string | null; preset: MemberPreset; permissions: Permissions; expiresAt: string }`
  - `MyInvites = { invites: MyInvite[]; hasFarm: boolean }`
  - Routes: `GET /api/herd/invites` → `MyInvites`; `POST /api/herd/invites/:id/accept` → `{ farmId: number }` | 404; `POST /api/herd/invites/:id/decline` → `{ id: number }` | 404.

- [ ] **Step 1: Write the failing tests**

Create `lib/api/domains/invites/useCases/__tests__/Accept.test.ts`:

```ts
/** acceptInvite: the signed-in e-mail claims a pending, unexpired convite and joins the farm. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { AcceptInviteUseCase } from "../Accept.useCase";

const now = new Date("2026-09-12T15:00:00Z");
const invite = {
  id: 3,
  farmId: 7,
  email: "zeca@hotmail.com",
  preset: "vaqueiro",
  permissions: PRESETS.vaqueiro,
  status: "pending",
  invitedByUserId: "u-owner",
  createdAt: now,
  expiresAt: new Date("2026-09-19T15:00:00Z"),
  respondedAt: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
});

describe("acceptInvite", () => {
  it("answers not_found when no pending convite matches the e-mail", async () => {
    state.selectResults = [[]];
    const result = await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "other@hotmail.com",
      now,
    });
    expect(result).toBe("not_found");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("joins the farm with the convite's levels and closes it", async () => {
    state.selectResults = [[invite], []];
    const result = await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toEqual({ farmId: 7 });
    expect(state.inserts[0]).toEqual({
      farmId: 7,
      userId: "u-zeca",
      role: "member",
      preset: "vaqueiro",
      permissions: PRESETS.vaqueiro,
    });
    expect(state.updates[0]).toEqual({ status: "accepted", respondedAt: now });
  });

  it("keeps an existing membership as it is", async () => {
    state.selectResults = [[invite], [{ role: "member" }]];
    const result = await new AcceptInviteUseCase().run({
      inviteId: 3,
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toEqual({ farmId: 7 });
    expect(state.inserts).toEqual([]);
    expect(state.updates[0]).toEqual({ status: "accepted", respondedAt: now });
  });
});
```

Create `lib/api/domains/invites/useCases/__tests__/BrowseMine.test.ts`:

```ts
/** browseMyInvites: the convites waiting for the signed-in e-mail, and whether a farm exists. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/lib/domain/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { BrowseMyInvitesUseCase } from "../BrowseMine.useCase";

const now = new Date("2026-09-12T15:00:00Z");

beforeEach(() => {
  state.selectResults = [];
});

describe("browseMyInvites", () => {
  it("serializes each convite and says the user has no farm yet", async () => {
    state.selectResults = [
      [
        {
          id: 3,
          farmId: 7,
          preset: "vaqueiro",
          permissions: { herd: "edit" },
          expiresAt: new Date("2026-09-18T15:00:00Z"),
          farmName: "Fazenda Maranata",
          municipality: "Nova Mutum",
          invitedByName: null,
        },
      ],
      [],
    ];
    const result = await new BrowseMyInvitesUseCase().run({
      userId: "u-zeca",
      email: "zeca@hotmail.com",
      now,
    });
    expect(result).toEqual({
      invites: [
        {
          id: 3,
          farmId: 7,
          preset: "vaqueiro",
          permissions: { ...PRESETS.consultor, herd: "edit", finance: "none" },
          expiresAt: "2026-09-18T15:00:00.000Z",
          farmName: "Fazenda Maranata",
          municipality: "Nova Mutum",
          invitedByName: null,
        },
      ],
      hasFarm: false,
    });
  });

  it("says the user has a farm when a membership exists", async () => {
    state.selectResults = [[], [{ farmId: 2 }]];
    const result = await new BrowseMyInvitesUseCase().run({ userId: "u", email: "u@x.com", now });
    expect(result).toEqual({ invites: [], hasFarm: true });
  });
});
```

(The stored `{ herd: "edit" }` parses to the floors plus Rebanho at edit: every other area at view except Financeiro and Equipe at none, which is `{ ...PRESETS.consultor, herd: "edit", finance: "none" }`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run lib/api/domains/invites`
Expected: FAIL, modules missing.

- [ ] **Step 3: Create the use cases**

Create `lib/api/domains/invites/useCases/BrowseMine.useCase.ts`:

```ts
import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { farm, farmInvites, farmUsers, user } from "@/lib/db/schema";
import { parsePermissions, type MemberPreset, type Permissions } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export interface MyInvite {
  id: number;
  farmId: number;
  farmName: string;
  municipality: string;
  invitedByName: string | null;
  preset: MemberPreset;
  permissions: Permissions;
  expiresAt: string;
}

export interface MyInvites {
  invites: MyInvite[];
  /** Lets /convites choose between "Criar minha fazenda" and "Ir para o painel"
      without calling a farm-scoped route, which would create a farm. */
  hasFarm: boolean;
}

interface BrowseMyInvitesUseCaseProps {
  userId: string;
  /** Normalized e-mail of the signed-in user. */
  email: string;
  now: Date;
}

type CurrUseCase = _UseCase<BrowseMyInvitesUseCaseProps, MyInvites>;

/** The convites waiting for the signed-in e-mail, oldest first. */
export class BrowseMyInvitesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BrowseMyInvitesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, email, now }) => {
    const [rows, memberships] = await Promise.all([
      this.repository
        .select({
          id: farmInvites.id,
          farmId: farmInvites.farmId,
          preset: farmInvites.preset,
          permissions: farmInvites.permissions,
          expiresAt: farmInvites.expiresAt,
          farmName: farm.name,
          municipality: farm.municipality,
          invitedByName: user.name,
        })
        .from(farmInvites)
        .innerJoin(farm, eq(farm.id, farmInvites.farmId))
        .leftJoin(user, eq(user.id, farmInvites.invitedByUserId))
        .where(
          and(
            eq(farmInvites.email, email),
            eq(farmInvites.status, "pending"),
            gt(farmInvites.expiresAt, now)
          )
        )
        .orderBy(asc(farmInvites.createdAt)),
      this.repository
        .select({ farmId: farmUsers.farmId })
        .from(farmUsers)
        .where(eq(farmUsers.userId, userId))
        .limit(1),
    ]);

    return {
      invites: rows.map((row) => ({
        id: row.id,
        farmId: row.farmId,
        preset: row.preset,
        permissions: parsePermissions(row.permissions),
        expiresAt: row.expiresAt.toISOString(),
        farmName: row.farmName,
        municipality: row.municipality,
        invitedByName: row.invitedByName ?? null,
      })),
      hasFarm: memberships.length > 0,
    };
  };
}
```

Create `lib/api/domains/invites/useCases/Accept.useCase.ts`:

```ts
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites, farmUsers } from "@/lib/db/schema";
import { parsePermissions } from "@/lib/domain/permissions";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface AcceptInviteUseCaseProps {
  inviteId: number;
  userId: string;
  /** Normalized e-mail of the signed-in user: only its own convites can be claimed. */
  email: string;
  now: Date;
}

type CurrUseCase = _UseCase<AcceptInviteUseCaseProps, { farmId: number } | "not_found">;

/**
 * Claims a convite: the membership is created with the convite's levels and
 * the convite closes as accepted, in one transaction. Someone who is already a
 * member keeps the levels they have.
 */
export class AcceptInviteUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AcceptInviteUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ inviteId, userId, email, now }) => {
    return this.repository.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(farmInvites)
        .where(
          and(
            eq(farmInvites.id, inviteId),
            eq(farmInvites.email, email),
            eq(farmInvites.status, "pending"),
            gt(farmInvites.expiresAt, now)
          )
        )
        .limit(1);
      if (!invite) return "not_found";

      const [existing] = await tx
        .select({ role: farmUsers.role })
        .from(farmUsers)
        .where(and(eq(farmUsers.farmId, invite.farmId), eq(farmUsers.userId, userId)))
        .limit(1);
      if (!existing) {
        await tx.insert(farmUsers).values({
          farmId: invite.farmId,
          userId,
          role: "member",
          preset: invite.preset,
          permissions: parsePermissions(invite.permissions),
        });
      }

      await tx
        .update(farmInvites)
        .set({ status: "accepted", respondedAt: now })
        .where(eq(farmInvites.id, invite.id));
      return { farmId: invite.farmId };
    });
  };
}
```

Create `lib/api/domains/invites/useCases/Decline.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { farmInvites } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeclineInviteUseCaseProps {
  inviteId: number;
  email: string;
  now: Date;
}

type CurrUseCase = _UseCase<DeclineInviteUseCaseProps, boolean>;

/** Refuses a convite; the owner's list then shows it as "Recusado". */
export class DeclineInviteUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeclineInviteUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ inviteId, email, now }) => {
    const rows = await this.repository
      .update(farmInvites)
      .set({ status: "declined", respondedAt: now })
      .where(
        and(
          eq(farmInvites.id, inviteId),
          eq(farmInvites.email, email),
          eq(farmInvites.status, "pending")
        )
      )
      .returning({ id: farmInvites.id });
    return rows.length > 0;
  };
}
```

- [ ] **Step 4: Run the use-case tests**

Run: `pnpm exec vitest run lib/api/domains/invites`
Expected: PASS.

- [ ] **Step 5: Create the controller and mount it**

Create `lib/api/domains/invites/invites.controller.ts`:

```ts
/**
 * The signed-in user's own convites. Session-only: these run before the user
 * belongs to a farm, and a farm-scoped route would create one for them.
 */
import { Elysia } from "elysia";

import { sessionPlugin } from "@/lib/api/plugins/session";
import { normalizeEmail } from "@/lib/domain/invites";

import { AcceptInviteUseCase } from "./useCases/Accept.useCase";
import { BrowseMyInvitesUseCase } from "./useCases/BrowseMine.useCase";
import { DeclineInviteUseCase } from "./useCases/Decline.useCase";

export const invitesController = new Elysia({ prefix: "/invites" })
  .use(sessionPlugin)
  .get(
    "/",
    ({ user }) =>
      new BrowseMyInvitesUseCase().run({
        userId: user.id,
        email: normalizeEmail(user.email),
        now: new Date(),
      }),
    { session: true }
  )
  .post(
    "/:id/accept",
    async ({ user, params, status }) => {
      const inviteId = Number(params.id);
      const result = Number.isInteger(inviteId)
        ? await new AcceptInviteUseCase().run({
            inviteId,
            userId: user.id,
            email: normalizeEmail(user.email),
            now: new Date(),
          })
        : "not_found";
      if (result === "not_found") return status(404, { error: result });
      return result;
    },
    { session: true }
  )
  .post(
    "/:id/decline",
    async ({ user, params, status }) => {
      const inviteId = Number(params.id);
      const declined =
        Number.isInteger(inviteId) &&
        (await new DeclineInviteUseCase().run({
          inviteId,
          email: normalizeEmail(user.email),
          now: new Date(),
        }));
      if (!declined) return status(404, { error: "not_found" });
      return { id: inviteId };
    },
    { session: true }
  );
```

In `lib/api/app.ts`, add below the `teamController` import:

```ts
import { invitesController } from "@/lib/api/domains/invites/invites.controller";
```

and replace:

```ts
  .use(farmController)
  .use(teamController)
```

with:

```ts
  .use(farmController)
  .use(teamController)
  .use(invitesController)
```

- [ ] **Step 6: Add the completeness tests**

At the top of `lib/api/__tests__/routeRequirements.test.ts`, replace:

```ts
import { describe, expect, it } from "vitest";
```

with:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import { herdApi } from "@/lib/api/app";
```

and change the import of the table to also bring `SESSION_ONLY_ROUTES`:

```ts
import {
  ROUTE_REQUIREMENTS,
  SESSION_ONLY_ROUTES,
  checkRequirement,
  routeKey,
} from "@/lib/api/permissions/routeRequirements";
```

Append at the end of the file:

```ts
describe("ROUTE_REQUIREMENTS against the mounted app", () => {
  const mounted = (herdApi as unknown as { routes: { method: string; path: string }[] }).routes.map(
    (route) => routeKey(route.method, route.path)
  );

  it("names a requirement for every farm-scoped route and for nothing else", () => {
    const farmScoped = mounted.filter((key) => !SESSION_ONLY_ROUTES.includes(key)).sort();
    expect(Object.keys(ROUTE_REQUIREMENTS).sort()).toEqual(farmScoped);
  });

  it("lists only session routes that exist", () => {
    for (const key of SESSION_ONLY_ROUTES) expect(mounted).toContain(key);
  });

  it("is pinned", () => {
    expect(ROUTE_REQUIREMENTS).toMatchSnapshot();
  });
});
```

- [ ] **Step 7: Add the end-to-end permission test**

Create `lib/api/__tests__/permissions.test.ts`:

```ts
/**
 * Real routes of herdApi behind the farm macro, with auth and the db mocked:
 * proves the macro's route pattern matches the table's keys at runtime, the
 * money rule on POST /manejo, and the redaction of GET /api/herd.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, HERD } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  HERD: {
    animals: [],
    treatments: [
      { id: "t-1", animalEarTag: "BR-1", type: "vaccine", name: "Aftosa", date: "2026-09-01", status: "done", withdrawalDays: 0, costBrl: 4.5 },
    ],
    lots: [],
    invernadas: [],
    lotPlacements: [],
    movements: [],
    breeds: [],
    protocols: [],
    manejoSessions: [],
    expenses: [{ id: "e-1", date: "2026-09-01", category: "labor", amountBrl: 1200 }],
    customCategories: [],
    farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "" },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => Promise.resolve(state.membership),
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/api/domains/herd/useCases/Load.useCase", () => ({
  LoadHerdUseCase: class {
    run = () => Promise.resolve(structuredClone(HERD));
  },
}));

import { herdApi } from "@/lib/api/app";

const headers = { "x-farm-id": "7", "content-type": "application/json" };
const request = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

function asMember(permissions: typeof FULL_PERMISSIONS) {
  state.membership = [{ role: "member", preset: null, permissions }];
}

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
});

describe("permissions on the mounted API", () => {
  it("lets a consultor read", async () => {
    asMember(PRESETS.consultor);
    const response = await request("GET", "/health");
    expect(response.status).toBe(200);
  });

  it("refuses a consultor a manejo write, naming the area", async () => {
    asMember(PRESETS.consultor);
    const response = await request("POST", "/manejo/abc/close");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "manejo" });
  });

  it("refuses a vaqueiro a venda, naming Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo", {
      date: "2026-09-12",
      kind: "sale",
      earTags: ["BR-1"],
      weighing: true,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
  });

  it("strips money from the herd for a member without Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.expenses).toEqual([]);
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
  });

  it("keeps money for a member who sees Financeiro", async () => {
    asMember(PRESETS.consultor);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.expenses).toHaveLength(1);
    expect(data.treatments[0].costBrl).toBe(4.5);
  });
});
```

- [ ] **Step 8: Run everything on the API and refresh snapshots**

Run: `pnpm exec vitest run lib/api/__tests__/routeTable.test.ts lib/api/__tests__/routeRequirements.test.ts -u && git diff lib/api/__tests__/__snapshots__ && pnpm exec vitest run lib/api && pnpm exec tsc --noEmit`
Expected: the route table diff adds exactly `GET /api/herd/invites`, `POST /api/herd/invites/:id/accept`, `POST /api/herd/invites/:id/decline`; a new `routeRequirements.test.ts.snap` appears; all API tests pass; no type errors. If "names a requirement for every farm-scoped route" fails, the error diff shows the missing or extra key: fix the table, never the test.

If `GET ""` does not reach the herd root (404), use `request("GET", "/")` instead; the route is registered as `/api/herd/`.

- [ ] **Step 9: No commit.**

---

### Task 11: Client store, hooks and API errors

**Files:**
- Modify: `lib/store/useHerdStore.ts` (imports, `FarmOption`, `HerdStore`, initial state, `load`, new actions, `apiFail` and its call sites)
- Modify: `lib/store/selectors.ts` (new selector)
- Create: `lib/store/usePermissions.ts`
- Modify: `lib/repository/ApiHerdRepository.ts`
- Test: `lib/store/__tests__/activePermissions.test.ts`

**Interfaces:**
- Consumes: `FarmSummary` shape (Task 7), `MyInvite` (Task 10), Task 1 types.
- Produces:
  - `FarmOption = { id; name; role: FarmRole; preset: MemberPreset | null; permissions: Permissions; joinedAt: string | null }`
  - store: `pendingInvites: MyInvite[]`, `refreshAccess(): Promise<void>`, `refreshInvites(): Promise<void>`
  - `selectActivePermissions(farms: FarmOption[], activeFarmId: number | null): Permissions`
  - hooks `useActivePermissions(): Permissions`, `useCan(area: Area, level: Level): boolean`
  - `apiFail(action, error: { status: number; value?: unknown })`: 403 `not_a_member` clears the farm and reloads; 403 `forbidden` toasts "Seu acesso a esta fazenda mudou." and calls `refreshAccess`.

- [ ] **Step 1: Write the failing selector test**

Create `lib/store/__tests__/activePermissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FLOORS, PRESETS } from "@/lib/domain/permissions";
import { selectActivePermissions } from "@/lib/store/selectors";

const farms = [
  {
    id: 1,
    name: "Sítio Boa Vista",
    role: "owner" as const,
    preset: null,
    permissions: PRESETS.gerente,
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 7,
    name: "Fazenda Maranata",
    role: "member" as const,
    preset: "vaqueiro" as const,
    permissions: PRESETS.vaqueiro,
    joinedAt: "2026-08-14T12:00:00.000Z",
  },
];

describe("selectActivePermissions", () => {
  it("reads the active farm's levels", () => {
    expect(selectActivePermissions(farms, 7)).toEqual(PRESETS.vaqueiro);
  });

  it("falls back to the floors when the active farm is unknown", () => {
    expect(selectActivePermissions(farms, 99)).toEqual(FLOORS);
    expect(selectActivePermissions([], null)).toEqual(FLOORS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/store/__tests__/activePermissions.test.ts`
Expected: FAIL, `selectActivePermissions` is not exported.

- [ ] **Step 3: Add the selector**

In `lib/store/selectors.ts`, below `import { ageInMonths, daysBetween } from "@/lib/domain/dates";` add:

```ts
import { FLOORS, type Permissions } from "@/lib/domain/permissions";
import type { FarmOption } from "@/lib/store/useHerdStore";
```

and append at the end of the file:

```ts
/**
 * The levels the user holds on the active farm. Until the farm list is known
 * (or when it failed to load) the floors apply, so the UI hides writes rather
 * than offering buttons the server will refuse.
 */
export function selectActivePermissions(
  farms: FarmOption[],
  activeFarmId: number | null
): Permissions {
  return farms.find((farm) => farm.id === activeFarmId)?.permissions ?? FLOORS;
}
```

Run: `pnpm exec vitest run lib/store/__tests__/activePermissions.test.ts`
Expected: PASS once Step 4 widens `FarmOption` (the test compiles through esbuild, so it may already pass now; `tsc` needs Step 4).

- [ ] **Step 4: Widen the store**

In `lib/store/useHerdStore.ts`:

Replace:

```ts
import { setActiveFarmId } from "@/lib/api/activeFarm";
```

with:

```ts
import { clearActiveFarmId, setActiveFarmId } from "@/lib/api/activeFarm";
import type { FarmRole, MemberPreset, Permissions } from "@/lib/domain/permissions";
import type { MyInvite } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
```

Replace:

```ts
/** A farm the user can switch to (from GET /farms). */
export interface FarmOption {
  id: number;
  name: string;
  role: "owner" | "member";
}
```

with:

```ts
/** A farm the user can switch to (from GET /farms), with what they may do in it. */
export interface FarmOption {
  id: number;
  name: string;
  role: FarmRole;
  preset: MemberPreset | null;
  /** Resolved by the server: the Dono and superusers come back with every area at edit. */
  permissions: Permissions;
  /** When the membership began; null for a superuser who is not a member. */
  joinedAt: string | null;
}
```

Replace:

```ts
  activeFarmId: number | null;
  load: () => Promise<void>;
  /** Persists the choice and rehydrates the whole store from the new farm. */
  switchFarm: (farmId: number) => Promise<void>;
```

with:

```ts
  activeFarmId: number | null;
  /** Convites waiting for the signed-in e-mail (the Painel banner, the avatar dot). */
  pendingInvites: MyInvite[];
  load: () => Promise<void>;
  /** Persists the choice and rehydrates the whole store from the new farm. */
  switchFarm: (farmId: number) => Promise<void>;
  /** Re-reads the farm list and the herd after the caller's access changed. */
  refreshAccess: () => Promise<void>;
  /** Re-reads the convites after one was accepted or declined. */
  refreshInvites: () => Promise<void>;
```

Replace:

```ts
  loaded: false,
  farms: [],
  activeFarmId: null,

  load: async () => {
    if (get().loaded) return;
    const [data, farmsRes] = await Promise.all([repository.load(), api.farms.get()]);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? [],
      activeFarmId: farmsRes.data?.activeFarmId ?? null,
      loaded: true,
    });
  },
```

with:

```ts
  loaded: false,
  farms: [],
  activeFarmId: null,
  pendingInvites: [],

  load: async () => {
    if (get().loaded) return;
    const [data, farmsRes, invitesRes] = await Promise.all([
      repository.load(),
      api.farms.get(),
      api.invites.get(),
    ]);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? [],
      activeFarmId: farmsRes.data?.activeFarmId ?? null,
      pendingInvites: invitesRes.data?.invites ?? [],
      loaded: true,
    });
  },

  refreshAccess: async () => {
    const [data, farmsRes] = await Promise.all([repository.load(), api.farms.get()]);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: farmsRes.data?.activeFarmId ?? get().activeFarmId,
    });
  },

  refreshInvites: async () => {
    const { data } = await api.invites.get();
    set({ pendingInvites: data?.invites ?? [] });
  },
```

Replace:

```ts
/**
 * Signals an unexpected API failure: shows an error toast (important actions
 * only reach here) and throws. `action` is the pt-BR verb phrase shown to the
 * user, e.g. "cadastrar o animal".
 */
function apiFail(action: string, status: number): never {
  toast.error(`Não foi possível ${action}. Tente novamente.`);
  throw new Error(`${action} failed (status ${status})`);
}
```

with:

```ts
/**
 * Signals an unexpected API failure and throws. A 403 is not a plain failure:
 * `not_a_member` means the caller was removed from the farm, so the stored
 * choice goes and the page reloads onto their default farm; `forbidden` means
 * their levels changed while the page was open, so the farm list and the herd
 * are re-read and the buttons follow. Anything else shows an error toast
 * (important actions only reach here). `action` is the pt-BR verb phrase shown
 * to the user, e.g. "cadastrar o animal".
 */
function apiFail(action: string, error: { status: number; value?: unknown }): never {
  const code = (error.value as { error?: string } | null | undefined)?.error;
  if (error.status === 403 && code === "not_a_member") {
    clearActiveFarmId();
    window.location.reload();
  } else if (error.status === 403 && code === "forbidden") {
    toast.error("Seu acesso a esta fazenda mudou.");
    void useHerdStore.getState().refreshAccess();
  } else {
    toast.error(`Não foi possível ${action}. Tente novamente.`);
  }
  throw new Error(`${action} failed (status ${error.status})`);
}
```

- [ ] **Step 5: Pass the whole error to every `apiFail`**

Run:

```bash
sed -E -i 's/apiFail\(("[^"]*"), ([A-Za-z.]+)\.status\)/apiFail(\1, \2)/g' lib/store/useHerdStore.ts
grep -n 'apiFail(' lib/store/useHerdStore.ts | grep '\.status)'
```

Expected: the `grep` prints nothing. Then run `pnpm exec tsc --noEmit`; any call the regex missed (a multi-line call or a template-literal action) shows up as "Argument of type 'number' is not assignable": change `X.status` to `X` by hand there.

- [ ] **Step 6: Create the hooks**

Create `lib/store/usePermissions.ts`:

```ts
/**
 * What the signed-in user may do on the active farm, for components: hide a
 * write they may not make, mark a page they may only read. The server enforces
 * the same levels; these hooks keep the UI from offering what it would refuse.
 */
import { can, type Area, type Level, type Permissions } from "@/lib/domain/permissions";
import { selectActivePermissions } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";

export function useActivePermissions(): Permissions {
  const farms = useHerdStore((state) => state.farms);
  const activeFarmId = useHerdStore((state) => state.activeFarmId);
  return selectActivePermissions(farms, activeFarmId);
}

export function useCan(area: Area, level: Level): boolean {
  return can(useActivePermissions(), area, level);
}
```

- [ ] **Step 7: Send a user with a pending convite to /convites**

In `lib/repository/ApiHerdRepository.ts`, replace:

```ts
 * A 401 means the session expired between the server-side gate and hydration;
 * the browser is sent back to the landing page to sign in again. A 403 means
```

with:

```ts
 * A 401 means the session expired between the server-side gate and hydration;
 * the browser is sent back to the landing page to sign in again. A 409 means
 * the user has no farm yet and a convite is waiting: /convites answers it before
 * any farm is created. A 403 means
```

and replace:

```ts
      if (error.status === 401 && typeof window !== "undefined") {
        window.location.assign("/");
      } else if (error.status === 403 && getActiveFarmId() !== null) {
```

with:

```ts
      if (error.status === 401 && typeof window !== "undefined") {
        window.location.assign("/");
      } else if (error.status === 409 && typeof window !== "undefined") {
        window.location.assign("/convites");
      } else if (error.status === 403 && getActiveFarmId() !== null) {
```

- [ ] **Step 8: Verify**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run lib/store`
Expected: no type errors; store tests pass.

- [ ] **Step 9: No commit.**

---

### Task 12: Navigation and shell

**Files:**
- Modify: `lib/nav.ts`
- Test: `lib/__tests__/nav.test.ts`
- Create: `components/layout/ReadOnlyPill.tsx`, `components/layout/NoAccess.tsx`, `components/layout/RequireAccess.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/MobileTabBar.tsx`

**Interfaces:**
- Consumes: `can`, `roleLabel`, types (Task 1); `useActivePermissions`, `useCan`, store `pendingInvites` (Task 11).
- Produces:
  - `NavItem.area?: Area`, `NavChild.area?: Area`; Configurações child `{ label: "Equipe", href: "/settings/equipe", area: "team" }`
  - `visibleNav(items: readonly NavItem[], permissions: Permissions): NavItem[]` (an item without visible children gets `children: undefined`)
  - `<ReadOnlyPill />`, `<NoAccess />`, `<RequireAccess area level>{children}</RequireAccess>`

- [ ] **Step 1: Write the failing nav test**

In `lib/__tests__/nav.test.ts`, replace:

```ts
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute } from "@/lib/nav";
```

with:

```ts
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute, visibleNav } from "@/lib/nav";
```

and append at the end:

```ts
describe("visibleNav", () => {
  it("shows every item and Equipe to the Dono", () => {
    const items = visibleNav(NAV_ITEMS, FULL_PERMISSIONS);
    expect(items.map((item) => item.href)).toEqual(NAV_ITEMS.map((item) => item.href));
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
    ]);
  });

  it("hides Financeiro and Equipe from a vaqueiro", () => {
    const items = visibleNav(NAV_ITEMS, PRESETS.vaqueiro);
    expect(items.map((item) => item.href)).not.toContain("/finance");
    expect(items.find((item) => item.href === "/settings")?.children).toBeUndefined();
  });

  it("keeps Financeiro for a consultor, who sees values", () => {
    expect(visibleNav(NAV_ITEMS, PRESETS.consultor).map((item) => item.href)).toContain("/finance");
  });

  it("leaves children of an open area alone", () => {
    expect(
      visibleNav(NAV_ITEMS, PRESETS.consultor).find((item) => item.href === "/nascimentos")?.children
    ).toEqual([{ label: "Reprodução", href: "/nascimentos/reproducao", icon: Dna }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/nav.test.ts`
Expected: FAIL, `visibleNav` is not exported.

- [ ] **Step 3: Extend the nav**

In `lib/nav.ts`:

Below the `lucide-react` import block (after `} from "lucide-react";`) add:

```ts
import { can, type Area, type Permissions } from "@/lib/domain/permissions";
```

Replace:

```ts
/** A secondary destination listed under a {@link NavItem}. */
export interface NavChild {
  label: string;
  href: string;
  /** Icon of its own; without one the child borrows its parent's. */
  icon?: LucideIcon;
}
```

with:

```ts
/** A secondary destination listed under a {@link NavItem}. */
export interface NavChild {
  label: string;
  href: string;
  /** Icon of its own; without one the child borrows its parent's. */
  icon?: LucideIcon;
  /** Hidden from a user whose level in this area is none. */
  area?: Area;
}
```

Replace:

```ts
  /** Secondary destinations shown under this item, always visible. */
  children?: readonly NavChild[];
}
```

with:

```ts
  /** Secondary destinations shown under this item, always visible. */
  children?: readonly NavChild[];
  /** Hidden from a user whose level in this area is none. */
  area?: Area;
}
```

Replace:

```ts
  { label: "Financeiro", href: "/finance", icon: CircleDollarSign },
  { label: "Configurações", href: "/settings", icon: Settings },
];
```

with:

```ts
  { label: "Financeiro", href: "/finance", icon: CircleDollarSign, area: "finance" },
  {
    label: "Configurações",
    href: "/settings",
    icon: Settings,
    children: [{ label: "Equipe", href: "/settings/equipe", area: "team" }],
  },
];

/**
 * The destinations the user may open. Only Financeiro and Equipe can be at
 * none, so in practice this drops those two; an item left with no children
 * loses the key, so the views draw no empty tree.
 */
export function visibleNav(items: readonly NavItem[], permissions: Permissions): NavItem[] {
  const open = (area?: Area) => area === undefined || can(permissions, area, "view");
  return items
    .filter((item) => open(item.area))
    .map((item) => {
      const children = item.children?.filter((child) => open(child.area));
      return { ...item, children: children && children.length > 0 ? children : undefined };
    });
}
```

- [ ] **Step 4: Run the nav test**

Run: `pnpm exec vitest run lib/__tests__/nav.test.ts`
Expected: PASS. The older "lists Reprodução under Nascimentos, with its own icon" case still passes.

- [ ] **Step 5: Create the shared states**

Create `components/layout/ReadOnlyPill.tsx`:

```tsx
import { Eye } from "lucide-react";

/** Beside a page title when the user may read the area but not change it. */
export function ReadOnlyPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink-soft">
      <Eye className="size-3.5" aria-hidden />
      Somente leitura
    </span>
  );
}
```

Create `components/layout/NoAccess.tsx`:

```tsx
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** What a page shows when opened by URL without access to its area. */
export function NoAccess() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <div className="rounded-lg border border-hairline bg-panel">
        <EmptyState
          icon={Lock}
          title="Sem acesso a esta área"
          description="Quem cuida da equipe da fazenda decide o que cada pessoa pode ver."
        />
      </div>
    </div>
  );
}
```

Create `components/layout/RequireAccess.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { Area, Level } from "@/lib/domain/permissions";
import { useCan } from "@/lib/store/usePermissions";
import { NoAccess } from "@/components/layout/NoAccess";

/** Renders the page only for a user who holds `level` in `area`. */
export function RequireAccess({
  area,
  level,
  children,
}: {
  area: Area;
  level: Level;
  children: ReactNode;
}) {
  return useCan(area, level) ? <>{children}</> : <NoAccess />;
}
```

- [ ] **Step 6: Filter the sidebar and mark pending convites**

In `components/layout/Sidebar.tsx`:

Replace:

```ts
import { NAV_ITEMS, activeChild, isActiveRoute } from "@/lib/nav";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { NAV_ITEMS, activeChild, isActiveRoute, visibleNav } from "@/lib/nav";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const switchFarm = useHerdStore((s) => s.switchFarm);
```

with:

```ts
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const pendingInvites = useHerdStore((s) => s.pendingInvites);
  const items = visibleNav(NAV_ITEMS, useActivePermissions());
```

Replace:

```tsx
        {NAV_ITEMS.map((item) => {
```

with:

```tsx
        {items.map((item) => {
```

Replace:

```tsx
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-[11px] font-semibold text-sidebar-active-ink"
          >
            {isPending ? "…" : getInitials(user?.name)}
          </span>
```

with:

```tsx
            className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-[11px] font-semibold text-sidebar-active-ink"
          >
            {isPending ? "…" : getInitials(user?.name)}
            {/* A convite is waiting: the Painel card says for which farm. */}
            {pendingInvites.length > 0 ? (
              <span className="absolute -top-px -right-px size-2.5 rounded-full bg-attention ring-2 ring-sidebar" />
            ) : null}
          </span>
```

- [ ] **Step 7: Filter the phone bar and add the farm switcher**

In `components/layout/MobileTabBar.tsx`:

Replace:

```ts
import { Ellipsis, LogOut } from "lucide-react";
```

with:

```ts
import { Ellipsis, LogOut } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { roleLabel } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
```

Replace:

```ts
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute } from "@/lib/nav";
```

with:

```ts
import { NAV_ITEMS, type NavItem, activeChild, isActiveRoute, visibleNav } from "@/lib/nav";
```

Replace:

```ts
const tabs = NAV_ITEMS.slice(0, PRIMARY_TAB_COUNT);
const moreLinks = NAV_ITEMS.slice(PRIMARY_TAB_COUNT);

```

with nothing (delete those two lines and the blank line after them).

Replace:

```ts
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreLinks.some(
```

with:

```ts
  const [moreOpen, setMoreOpen] = useState(false);
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);
  const items = visibleNav(NAV_ITEMS, useActivePermissions());
  const tabs = items.slice(0, PRIMARY_TAB_COUNT);
  const moreLinks = items.slice(PRIMARY_TAB_COUNT);
  const moreActive = moreLinks.some(
```

Replace:

```tsx
            <div className="flex flex-col gap-1">
              {/* Primary tabs already sit in the bar, so only their children are listed here. */}
              {NAV_ITEMS.map((item, index) => (
```

with:

```tsx
            {/* The sidebar's switcher, for the phone: a vaqueiro may belong to two farms. */}
            {farms.length > 1 ? (
              <div className="grid gap-1.5 border-b border-hairline pb-3">
                <Label htmlFor="mobile-farm">Fazenda</Label>
                <Select
                  value={activeFarmId === null ? undefined : String(activeFarmId)}
                  onValueChange={(value) => {
                    setMoreOpen(false);
                    void switchFarm(Number(value));
                  }}
                >
                  <SelectTrigger id="mobile-farm" className="min-h-11 w-full">
                    <SelectValue placeholder="Fazenda" />
                  </SelectTrigger>
                  <SelectContent>
                    {farms.map((farm) => (
                      <SelectItem key={farm.id} value={String(farm.id)}>
                        {farm.name.trim() || `Fazenda #${farm.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeFarm ? (
                  <p className="text-xs text-ink-soft">
                    Você é {roleLabel(activeFarm.role, activeFarm.preset)} nesta fazenda
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              {/* Primary tabs already sit in the bar, so only their children are listed here. */}
              {items.map((item, index) => (
```

- [ ] **Step 8: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run lib/__tests__/nav.test.ts`
Expected: no errors. If lint flags `ring-sidebar` as unknown, it is a Tailwind class from the `--color-sidebar` token and lint does not check classes; any real error here is a TypeScript or React-hooks one to fix.

- [ ] **Step 9: No commit.**

---

### Task 13: Equipe page

**Files:**
- Create: `components/team/helpers.ts` (+ `components/team/__tests__/helpers.test.ts`)
- Create: `components/team/RoleBadge.tsx`, `components/team/MemberAvatar.tsx`, `components/team/AccessSummaryBox.tsx`, `components/team/PermissionsGrid.tsx`, `components/team/MemberPermissionsForm.tsx`, `components/team/PermissionsDialog.tsx`, `components/team/InviteDialog.tsx`, `components/team/MembersCard.tsx`, `components/team/InvitesCard.tsx`, `components/team/TeamPage.tsx`
- Create: `app/(app)/settings/equipe/page.tsx`, `app/(app)/settings/equipe/[userId]/page.tsx`

**Interfaces:**
- Consumes: Tasks 1, 3, 9 (`TeamView`, `TeamMember`, `TeamInvite`, routes), 11 (`useActivePermissions`), 12 (`ReadOnlyPill`, `RequireAccess`).
- Produces: `/settings/equipe` and `/settings/equipe/[userId]`; `AccessSummaryBox` (reused by Task 14); `manageBlockLabel`, `ceilingNote`, `teamErrorMessage`.

- [ ] **Step 1: Read the Next.js page conventions**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and `dynamic-routes.md`. The two new pages follow the existing client pages (`app/(app)/lots/[id]/page.tsx` reads its param with `useParams`).

- [ ] **Step 2: Write the failing helpers test**

Create `components/team/__tests__/helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ceilingNote, manageBlockLabel, teamErrorMessage } from "@/components/team/helpers";

describe("manageBlockLabel", () => {
  it("explains why a row has no Permissões button", () => {
    expect(manageBlockLabel("self")).toBe("É você");
    expect(manageBlockLabel("above")).toBe("Tem mais acesso que você");
    expect(manageBlockLabel("owner")).toBeNull();
  });
});

describe("ceilingNote", () => {
  it("says how far the actor can grant an area", () => {
    expect(ceilingNote("finance", "edit")).toBeNull();
    expect(ceilingNote("finance", "view")).toBe(
      "Você tem só Ver em Financeiro, então pode dar até Ver."
    );
    expect(ceilingNote("finance", "none")).toBe(
      "Você não tem acesso a Financeiro, então não pode dar acesso."
    );
  });
});

describe("teamErrorMessage", () => {
  it("puts each refusal in words", () => {
    expect(teamErrorMessage({ status: 422, value: { error: "invalid_email" } })).toBe(
      "Informe um e-mail válido."
    );
    expect(teamErrorMessage({ status: 409, value: { error: "already_member" } })).toBe(
      "Esta pessoa já é membro da fazenda."
    );
    expect(teamErrorMessage({ status: 403, value: { error: "forbidden", area: "finance" } })).toBe(
      "Você não pode dar esse acesso em Financeiro."
    );
    expect(teamErrorMessage({ status: 403, value: { error: "blocked", reason: "above" } })).toBe(
      "Esta pessoa tem mais acesso que você."
    );
    expect(teamErrorMessage({ status: 500, value: "boom" })).toBe(
      "Não foi possível salvar. Tente novamente."
    );
  });
});
```

Run: `pnpm exec vitest run components/team`
Expected: FAIL, module missing.

- [ ] **Step 3: Create the helpers**

Create `components/team/helpers.ts`:

```ts
/** Words for the Equipe screens: why a member is out of reach, how far a grant goes, what failed. */
import { AREA_LABEL, type Area, type Level, type ManageBlock } from "@/lib/domain/permissions";

/** The line a member row shows instead of "Permissões"; nothing on the Dono's row. */
export function manageBlockLabel(reason: ManageBlock): string | null {
  if (reason === "self") return "É você";
  if (reason === "above") return "Tem mais acesso que você";
  return null;
}

/** The note under an area the actor cannot fully grant, given the actor's own level. */
export function ceilingNote(area: Area, actorLevel: Level): string | null {
  if (actorLevel === "edit") return null;
  const name = AREA_LABEL[area];
  return actorLevel === "view"
    ? `Você tem só Ver em ${name}, então pode dar até Ver.`
    : `Você não tem acesso a ${name}, então não pode dar acesso.`;
}

/** A team route's refusal, for a field error or a toast. */
export function teamErrorMessage(error: { status: number; value?: unknown }): string {
  const body =
    typeof error.value === "object" && error.value !== null
      ? (error.value as { error?: string; area?: Area | null; reason?: ManageBlock })
      : {};
  if (body.error === "invalid_email") return "Informe um e-mail válido.";
  if (body.error === "already_member") return "Esta pessoa já é membro da fazenda.";
  if (body.error === "forbidden" && body.area) {
    return `Você não pode dar esse acesso em ${AREA_LABEL[body.area]}.`;
  }
  if (body.error === "blocked" && body.reason === "above") {
    return "Esta pessoa tem mais acesso que você.";
  }
  if (body.error === "blocked") return "Você não pode alterar esta pessoa.";
  return "Não foi possível salvar. Tente novamente.";
}
```

Run: `pnpm exec vitest run components/team`
Expected: PASS.

- [ ] **Step 4: Create the small pieces**

Create `components/team/RoleBadge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { roleLabel, type FarmRole, type MemberPreset } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";

/** Dono in outline, a preset in brand-soft, Personalizado on the paper surface. */
export function RoleBadge({ role, preset }: { role: FarmRole; preset: MemberPreset | null }) {
  const custom = role === "member" && (preset === null || preset === "personalizado");
  return (
    <Badge
      variant={role === "owner" ? "outline" : "secondary"}
      className={cn(custom && "border-hairline bg-surface text-ink")}
    >
      {roleLabel(role, preset)}
    </Badge>
  );
}
```

Create `components/team/MemberAvatar.tsx`:

```tsx
import { getInitials } from "@/lib/auth/user";
import { cn } from "@/lib/utils";

export function MemberAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand",
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
```

Create `components/team/AccessSummaryBox.tsx`:

```tsx
import { AREA_LABEL, accessGroups, joinPt, type Permissions } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";

/**
 * Edita / Só vê / Sem acesso, one line each. `bare` drops the box when it sits
 * inside another surface (the convite dialog).
 */
export function AccessSummaryBox({
  permissions,
  bare = false,
}: {
  permissions: Permissions;
  bare?: boolean;
}) {
  const groups = accessGroups(permissions);
  const lines = [
    ["Edita", groups.edit],
    ["Só vê", groups.view],
    ["Sem acesso", groups.none],
  ] as const;
  return (
    <dl
      className={cn(
        "grid gap-1.5 text-[13px]",
        !bare && "rounded-lg border border-hairline bg-surface p-3"
      )}
    >
      {lines
        .filter(([, areas]) => areas.length > 0)
        .map(([label, areas]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-20 shrink-0 text-ink-soft">{label}</dt>
            <dd className="text-ink">{joinPt(areas.map((area) => AREA_LABEL[area]))}</dd>
          </div>
        ))}
    </dl>
  );
}
```

Create `components/team/PermissionsGrid.tsx`:

```tsx
"use client";

/**
 * One row per area with a Nada | Ver | Editar control in the PeriodPicker's
 * segmented shell. Levels below the floor and above the actor's own are
 * disabled; the brand dot marks an area that differs from `base`.
 */
import {
  AREAS,
  AREA_DESCRIPTION,
  AREA_LABEL,
  FLOORS,
  LEVELS,
  LEVEL_LABEL,
  atLeast,
  type Permissions,
} from "@/lib/domain/permissions";
import { ceilingNote } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

interface PermissionsGridProps {
  value: Permissions;
  onChange: (next: Permissions) => void;
  /** The actor's own levels: nothing above them can be picked. */
  ceiling: Permissions;
  /** The preset the dots compare against; null draws none. */
  base: Permissions | null;
}

export function PermissionsGrid({ value, onChange, ceiling, base }: PermissionsGridProps) {
  return (
    <div className="divide-y divide-hairline rounded-lg border border-hairline">
      {AREAS.map((area) => {
        const note = ceilingNote(area, ceiling[area]);
        return (
          <div
            key={area}
            className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {AREA_LABEL[area]}
                {base !== null && base[area] !== value[area] ? (
                  <span className="size-1.5 rounded-full bg-brand" aria-label="Diferente do papel" />
                ) : null}
              </p>
              <p className="text-xs text-ink-soft">{AREA_DESCRIPTION[area]}</p>
              {note ? <p className="mt-1 text-xs text-attention">{note}</p> : null}
            </div>
            <div
              role="radiogroup"
              aria-label={`Nível em ${AREA_LABEL[area]}`}
              className="flex w-full shrink-0 items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5 sm:w-auto"
            >
              {LEVELS.map((level) => {
                const selected = value[area] === level;
                const allowed = atLeast(level, FLOORS[area]) && atLeast(ceiling[area], level);
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!allowed}
                    onClick={() => onChange({ ...value, [area]: level })}
                    className={cn(
                      "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors sm:min-h-7 sm:min-w-14 sm:flex-none",
                      selected
                        ? "bg-panel font-medium shadow-[0_0_0_1px_var(--color-hairline)]"
                        : "text-ink-soft hover:text-ink",
                      selected && (level === "edit" ? "text-brand" : "text-ink"),
                      !allowed && !selected && "opacity-35"
                    )}
                  >
                    {LEVEL_LABEL[level]}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Create the member form and its dialog**

Create `components/team/MemberPermissionsForm.tsx`:

```tsx
"use client";

/**
 * One member's permissions: a papel select that fills every area, the per-area
 * grid, and removal. Shared by the desktop dialog and the phone page.
 */
import { useState } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import {
  PRESETS,
  PRESET_IDS,
  PRESET_LABEL,
  canGrant,
  closestPreset,
  presetFor,
  type Permissions,
  type PresetId,
} from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionsGrid } from "@/components/team/PermissionsGrid";
import { teamErrorMessage } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

interface MemberPermissionsFormProps {
  member: TeamMember;
  /** The caller's own levels: nothing above them can be granted. */
  ceiling: Permissions;
  farmName: string;
  /** After a save or a removal went through. */
  onDone: () => void;
  onCancel: () => void;
  footerClassName?: string;
}

export function MemberPermissionsForm({
  member,
  ceiling,
  farmName,
  onDone,
  onCancel,
  footerClassName,
}: MemberPermissionsFormProps) {
  const [value, setValue] = useState<Permissions>(member.permissions);
  const [base, setBase] = useState<PresetId>(() =>
    member.preset !== null && member.preset !== "personalizado"
      ? member.preset
      : closestPreset(member.permissions)
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const current = presetFor(value);
  const presets = PRESET_IDS.filter((id) => id === current || canGrant(ceiling, PRESETS[id]).ok);

  function pickPreset(id: string) {
    if (id === "personalizado") return;
    const preset = id as PresetId;
    setBase(preset);
    setValue({ ...PRESETS[preset] });
  }

  async function save() {
    setBusy(true);
    const { error } = await api.farm.members({ userId: member.userId }).patch({ permissions: value });
    setBusy(false);
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(`Permissões de ${member.name} salvas`);
    onDone();
  }

  async function remove() {
    setBusy(true);
    const { error } = await api.farm.members({ userId: member.userId }).delete();
    setBusy(false);
    setRemoving(false);
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(`${member.name} saiu da equipe`);
    onDone();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="member-preset">Papel</Label>
        <Select value={current} onValueChange={pickPreset}>
          <SelectTrigger id="member-preset" className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((id) => (
              <SelectItem key={id} value={id}>
                {PRESET_LABEL[id]}
              </SelectItem>
            ))}
            <SelectItem value="personalizado" disabled>
              Personalizado
            </SelectItem>
          </SelectContent>
        </Select>
        {current === "personalizado" ? (
          <p className="text-xs text-ink-soft">
            Parecido com {PRESET_LABEL[closestPreset(value)]}. Escolher um papel troca todas as
            áreas.
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-ink">Permissões por área</span>
        <PermissionsGrid value={value} onChange={setValue} ceiling={ceiling} base={PRESETS[base]} />
      </div>

      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between",
          footerClassName
        )}
      >
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          onClick={() => setRemoving(true)}
          disabled={busy}
        >
          <UserMinus aria-hidden />
          Remover da fazenda
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-11 flex-1 sm:flex-none" onClick={save} disabled={busy}>
            Salvar
          </Button>
        </div>
      </div>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover {member.name}?</DialogTitle>
            <DialogDescription>
              {member.name} deixa de acessar a {farmName}. Para voltar, precisa de um novo convite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRemoving(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={remove} disabled={busy}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Create `components/team/PermissionsDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { formatInstantDate } from "@/lib/domain/invites";
import type { Permissions } from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { MemberPermissionsForm } from "@/components/team/MemberPermissionsForm";

/** "Permissões" on a member row, desktop only; the phone opens /settings/equipe/[userId]. */
export function PermissionsDialog({
  member,
  ceiling,
  farmName,
  onChanged,
}: {
  member: TeamMember;
  ceiling: Permissions;
  farmName: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden shrink-0 md:inline-flex">
          <SlidersHorizontal aria-hidden />
          Permissões
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-3">
          <MemberAvatar name={member.name} className="size-10" />
          <div className="grid gap-1 text-left">
            <DialogTitle>{member.name}</DialogTitle>
            <DialogDescription>
              {member.email} · membro desde {formatInstantDate(member.joinedAt)}
            </DialogDescription>
          </div>
        </DialogHeader>
        {/* Mounted per open, so a cancelled edit never survives to the next one. */}
        {open ? (
          <MemberPermissionsForm
            member={member}
            ceiling={ceiling}
            farmName={farmName}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              onChanged();
            }}
            footerClassName="-mx-4 -mb-4 rounded-b-xl border-t border-hairline bg-muted/50 p-4"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Create the convite dialog**

Create `components/team/InviteDialog.tsx`:

```tsx
"use client";

/**
 * "Convidar membro": an e-mail and what the person may do. Nothing is sent; the
 * convite waits for whoever signs in with the e-mail.
 */
import { useState, type FormEvent } from "react";
import { ChevronDown, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { isValidEmail, normalizeEmail } from "@/lib/domain/invites";
import {
  FLOORS,
  PRESETS,
  PRESET_IDS,
  PRESET_LABEL,
  canGrant,
  presetFor,
  type Permissions,
  type PresetId,
} from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccessSummaryBox } from "@/components/team/AccessSummaryBox";
import { PermissionsGrid } from "@/components/team/PermissionsGrid";
import { teamErrorMessage } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

const PRESET_HINT: Record<PresetId, string> = {
  gerente: "Edita tudo, inclusive valores e equipe.",
  vaqueiro: "Trabalha o rebanho no dia a dia. Não vê valores em R$.",
  consultor: "Vê tudo e não altera nada. Para veterinário ou consultor.",
};

interface Levels {
  base: PresetId | null;
  value: Permissions;
}

/** Vaqueiro when the actor may grant it, else the first preset they may, else the floors. */
function startingLevels(presets: PresetId[]): Levels {
  const first = presets.includes("vaqueiro") ? "vaqueiro" : presets[0];
  return first ? { base: first, value: { ...PRESETS[first] } } : { base: null, value: { ...FLOORS } };
}

export function InviteDialog({
  ceiling,
  onCreated,
}: {
  ceiling: Permissions;
  onCreated: () => void;
}) {
  const presets = PRESET_IDS.filter((id) => canGrant(ceiling, PRESETS[id]).ok);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [levels, setLevels] = useState<Levels>(() => startingLevels(presets));
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setEmail("");
      setLevels(startingLevels(presets));
      setAdjusting(false);
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) {
      setError("Informe um e-mail válido.");
      return;
    }
    setBusy(true);
    const { error: apiError } = await api.farm.invites.post({
      email: clean,
      permissions: levels.value,
    });
    setBusy(false);
    if (apiError) {
      const code = (apiError.value as { error?: string } | null)?.error;
      if (code === "invalid_email" || code === "already_member") {
        setError(teamErrorMessage(apiError));
      } else {
        toast.error(teamErrorMessage(apiError));
      }
      return;
    }
    toast.success(`Convite criado para ${clean}`);
    setOpen(false);
    onCreated();
  }

  const current = presetFor(levels.value);
  const who = current === "personalizado" ? "esta pessoa" : `o ${PRESET_LABEL[current]}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full sm:w-auto">
          <UserPlus aria-hidden />
          Convidar membro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            Quando a pessoa entrar no MeuBov com este e-mail, verá o convite para aceitar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              className="min-h-11"
            />
            {error ? <p className="text-xs text-overdue">{error}</p> : null}
          </div>

          {presets.length > 0 ? (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-ink">Papel</span>
              <div role="radiogroup" aria-label="Papel" className="grid gap-2 sm:grid-cols-3">
                {presets.map((id) => {
                  const selected = current === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLevels({ base: id, value: { ...PRESETS[id] } })}
                      className={cn(
                        "flex min-h-11 flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-brand/45 bg-surface" : "border-hairline bg-panel hover:bg-surface"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full border",
                            selected ? "border-brand" : "border-hairline"
                          )}
                        >
                          {selected ? <span className="size-2 rounded-full bg-brand" /> : null}
                        </span>
                        {PRESET_LABEL[id]}
                      </span>
                      <span className="text-xs text-pretty text-ink-soft">{PRESET_HINT[id]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 rounded-lg border border-hairline bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                O que {who} pode fazer
              </span>
              <button
                type="button"
                aria-expanded={adjusting}
                onClick={() => setAdjusting((value) => !value)}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand md:min-h-0"
              >
                Ajustar por área
                <ChevronDown
                  className={cn("size-3.5 transition-transform", adjusting && "rotate-180")}
                  aria-hidden
                />
              </button>
            </div>
            {adjusting ? (
              <PermissionsGrid
                value={levels.value}
                onChange={(value) => setLevels((prev) => ({ ...prev, value }))}
                ceiling={ceiling}
                base={levels.base ? PRESETS[levels.base] : null}
              />
            ) : (
              <AccessSummaryBox permissions={levels.value} bare />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={busy}>
              Criar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Create the two cards and the page component**

Create `components/team/MembersCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { accessSummary, type Permissions } from "@/lib/domain/permissions";
import { SectionCard } from "@/components/ui/section-card";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { PermissionsDialog } from "@/components/team/PermissionsDialog";
import { RoleBadge } from "@/components/team/RoleBadge";
import { manageBlockLabel } from "@/components/team/helpers";

interface MembersCardProps {
  members: TeamMember[];
  /** Equipe edit: the row actions show. */
  canEdit: boolean;
  ceiling: Permissions;
  farmName: string;
  onChanged: () => void;
}

export function MembersCard({ members, canEdit, ceiling, farmName, onChanged }: MembersCardProps) {
  return (
    <SectionCard title={`Membros (${members.length})`}>
      <ul className="-m-4 divide-y divide-hairline">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
              <MemberAvatar name={member.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {member.name}
                  {member.isYou ? (
                    <span className="text-xs font-normal text-ink-soft"> · você</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-ink-soft">{member.email}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 md:flex-col md:items-start">
              <RoleBadge role={member.role} preset={member.preset} />
              <span className="text-xs text-ink-soft">
                {accessSummary(member.role, member.permissions)}
              </span>
            </div>
            {canEdit ? (
              member.manage.ok ? (
                <>
                  <PermissionsDialog
                    member={member}
                    ceiling={ceiling}
                    farmName={farmName}
                    onChanged={onChanged}
                  />
                  <Link
                    href={`/settings/equipe/${member.userId}`}
                    className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand md:hidden"
                  >
                    Permissões
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </>
              ) : manageBlockLabel(member.manage.reason) ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
                  <Lock className="size-3.5" aria-hidden />
                  {manageBlockLabel(member.manage.reason)}
                </span>
              ) : null
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
```

Create `components/team/InvitesCard.tsx`:

```tsx
"use client";

import { Info, Mail, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { TeamInvite } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { inviteDateLine, type ListedInviteState } from "@/lib/domain/invites";
import { PRESET_LABEL } from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { teamErrorMessage } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

const STATE_PILL: Record<ListedInviteState, { label: string; tone: string; dot: string }> = {
  pending: { label: "Pendente", tone: "bg-scheduled-soft text-scheduled", dot: "bg-scheduled" },
  expired: { label: "Expirado", tone: "bg-attention-soft text-attention", dot: "bg-attention" },
  declined: { label: "Recusado", tone: "bg-overdue-soft text-overdue", dot: "bg-overdue" },
};

export function InvitesCard({
  invites,
  canEdit,
  onChanged,
}: {
  invites: TeamInvite[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const now = new Date();

  async function close(invite: TeamInvite) {
    const { error } = await api.farm.invites({ id: invite.id }).delete();
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(invite.state === "declined" ? "Convite removido da lista" : "Convite cancelado");
    onChanged();
  }

  async function reinvite(invite: TeamInvite) {
    const { error } = await api.farm.invites.post({
      email: invite.email,
      permissions: invite.permissions,
    });
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(`Convite criado para ${invite.email}`);
    onChanged();
  }

  return (
    <SectionCard title={`Convites (${invites.length})`}>
      <ul className="-mx-4 -mt-4 divide-y divide-hairline">
        {invites.map((invite) => {
          const pill = STATE_PILL[invite.state];
          return (
            <li
              key={invite.id}
              className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-hairline"
                >
                  <Mail className="size-3.5 text-ink-soft" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{invite.email}</p>
                  <p className="text-xs text-ink-soft">como {PRESET_LABEL[invite.preset]}</p>
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 md:flex-col md:items-start">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                    pill.tone
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", pill.dot)} aria-hidden />
                  {pill.label}
                </span>
                <span className="text-xs text-ink-soft">{inviteDateLine(invite, now)}</span>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 flex-wrap gap-1">
                  {invite.state === "pending" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 md:min-h-7"
                      onClick={() => close(invite)}
                    >
                      Cancelar convite
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-7"
                      onClick={() => reinvite(invite)}
                    >
                      <RotateCw aria-hidden />
                      Convidar de novo
                    </Button>
                  )}
                  {invite.state === "declined" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 md:min-h-7"
                      aria-label={`Remover ${invite.email} da lista`}
                      onClick={() => close(invite)}
                    >
                      <X aria-hidden />
                      <span className="md:sr-only">Remover da lista</span>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="-mx-4 -mb-4 flex gap-1.5 border-t border-hairline bg-surface px-4 py-3 text-xs text-ink-soft">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        O convite aparece quando a pessoa entra no MeuBov com o e-mail convidado. Nada é enviado:
        avise você mesmo. Vale por 7 dias.
      </p>
    </SectionCard>
  );
}
```

Create `components/team/TeamPage.tsx`:

```tsx
"use client";

/**
 * /settings/equipe: who is in the farm, the convites waiting, and — for whoever
 * holds Equipe edit — the actions on both. The list lives in local state, not in
 * the herd store: nothing else in the app reads it.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { TeamView } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { can } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { InviteDialog } from "@/components/team/InviteDialog";
import { InvitesCard } from "@/components/team/InvitesCard";
import { MembersCard } from "@/components/team/MembersCard";

export function TeamPage() {
  const farm = useHerdStore((s) => s.farm);
  const permissions = useActivePermissions();
  const canEdit = can(permissions, "team", "edit");
  const farmName = farm.name.trim() || "fazenda";
  const [team, setTeam] = useState<TeamView | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await api.farm.team.get();
    if (error) {
      toast.error("Não foi possível carregar a equipe.");
      return;
    }
    setTeam(data);
  }, []);

  // The first load runs inline: react-hooks/set-state-in-effect refuses a
  // setState reached through a callback called from the effect.
  useEffect(() => {
    let alive = true;
    void api.farm.team.get().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        toast.error("Não foi possível carregar a equipe.");
        return;
      }
      setTeam(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Equipe"
          subtitle={`Quem acessa a ${farmName} e o que cada pessoa pode fazer`}
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={canEdit ? <InviteDialog ceiling={permissions} onCreated={reload} /> : undefined}
        />
        {team === null ? (
          <p className="text-sm text-ink-soft">Carregando equipe…</p>
        ) : (
          <>
            <MembersCard
              members={team.members}
              canEdit={canEdit}
              ceiling={permissions}
              farmName={farmName}
              onChanged={reload}
            />
            {team.invites.length > 0 ? (
              <InvitesCard invites={team.invites} canEdit={canEdit} onChanged={reload} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create the routes**

Create `app/(app)/settings/equipe/page.tsx`:

```tsx
import { RequireAccess } from "@/components/layout/RequireAccess";
import { TeamPage } from "@/components/team/TeamPage";

/** /settings/equipe: the farm's members, convites and permissions. */
export default function TeamSettingsPage() {
  return (
    <RequireAccess area="team" level="view">
      <TeamPage />
    </RequireAccess>
  );
}
```

Create `app/(app)/settings/equipe/[userId]/page.tsx`:

```tsx
"use client";

/**
 * /settings/equipe/[userId]: one member's permissions as a page, for the phone,
 * where a dialog with eight rows of controls does not fit. Desktop opens the
 * same form in a dialog from the Equipe list.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, UserX } from "lucide-react";
import { api } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { formatInstantDate } from "@/lib/domain/invites";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { MemberPermissionsForm } from "@/components/team/MemberPermissionsForm";

function BackLink() {
  return (
    <Link
      href="/settings/equipe"
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Equipe
    </Link>
  );
}

export default function MemberPermissionsPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const permissions = useActivePermissions();
  const farm = useHerdStore((s) => s.farm);
  /** undefined while loading, null when the member cannot be edited from here. */
  const [member, setMember] = useState<TeamMember | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void api.farm.team.get().then(({ data }) => {
      if (alive) setMember(data?.members.find((m) => m.userId === params.userId) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [params.userId]);

  const back = () => router.push("/settings/equipe");

  return (
    <RequireAccess area="team" level="edit">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 md:px-8">
        <BackLink />
        {member === undefined ? (
          <p className="text-sm text-ink-soft">Carregando…</p>
        ) : member === null || !member.manage.ok ? (
          <div className="rounded-lg border border-hairline bg-panel">
            <EmptyState
              icon={UserX}
              title="Não é possível alterar este membro"
              description="A pessoa não está na equipe ou tem um acesso que você não pode mudar."
            />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3">
              <MemberAvatar name={member.name} className="size-10" />
              <div className="min-w-0">
                <h1 className="truncate font-heading text-xl font-semibold text-ink">{member.name}</h1>
                <p className="truncate text-xs text-ink-soft">
                  {member.email} · membro desde {formatInstantDate(member.joinedAt)}
                </p>
              </div>
            </header>
            <MemberPermissionsForm
              member={member}
              ceiling={permissions}
              farmName={farm.name.trim() || "fazenda"}
              onDone={back}
              onCancel={back}
              footerClassName="border-t border-hairline pt-4"
            />
          </>
        )}
      </div>
    </RequireAccess>
  );
}
```

- [ ] **Step 9: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run components/team`
Expected: no errors. The effects in `TeamPage` and the `[userId]` page fetch inline with an `alive` flag on purpose: `react-hooks/set-state-in-effect` fails a `useCallback` that sets state when the effect calls it.

- [ ] **Step 10: No commit.**

---

### Task 14: Convites screen, Painel banner, Sua participação

**Files:**
- Create: `app/convites/page.tsx`
- Create: `components/invites/InvitesScreen.tsx`, `components/invites/InviteCard.tsx`, `components/invites/PendingInviteBanner.tsx`
- Create: `components/settings/MembershipCard.tsx`
- Modify: `app/(app)/settings/page.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (banner only)

**Interfaces:**
- Consumes: `MyInvite`/`MyInvites` and routes (Task 10), `POST /farms` and `POST /farm/leave` (Tasks 7, 9), store `pendingInvites`, `refreshInvites`, `refreshAccess`, `switchFarm` (Task 11), `AccessSummaryBox` (Task 13), `expiresInSentence`, `formatInstantDate` (Task 3).
- Produces: `/convites`; `<PendingInviteBanner />`; `<MembershipCard />`.

- [ ] **Step 1: Read the layout and page conventions**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (async server components, `redirect`). `/convites` copies the session check of `app/(app)/layout.tsx` and lives outside `(app)` so `AppShell` never loads a farm for it. `proxy.ts` already lets a signed-in user through to any path but `/`.

- [ ] **Step 2: Create the route**

Create `app/convites/page.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { InvitesScreen } from "@/components/invites/InvitesScreen";

/**
 * /convites: where a signed-in user answers the convites waiting for their
 * e-mail. It sits outside the (app) group on purpose: that layout hydrates the
 * herd store, and for a user with no farm yet that would create one. The
 * session check mirrors app/(app)/layout.tsx.
 */
export default async function InvitesPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  return <InvitesScreen email={session.user.email} />;
}
```

- [ ] **Step 3: Create the convite card and the screen**

Create `components/invites/InviteCard.tsx`:

```tsx
"use client";

import type { MyInvite } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import { expiresInSentence } from "@/lib/domain/invites";
import { PRESET_LABEL } from "@/lib/domain/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccessSummaryBox } from "@/components/team/AccessSummaryBox";

/** One convite on /convites: the farm, who invited, what the person may do, and the answer. */
export function InviteCard({
  invite,
  busy,
  onAccept,
  onDecline,
}: {
  invite: MyInvite;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const role = PRESET_LABEL[invite.preset];
  return (
    <section className="grid gap-3 rounded-lg border border-hairline bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {invite.farmName.trim() || `Fazenda #${invite.farmId}`}
          </h2>
          {invite.municipality ? (
            <p className="text-xs text-ink-soft">{invite.municipality}</p>
          ) : null}
        </div>
        <Badge variant="secondary">{role}</Badge>
      </div>
      <p className="text-sm text-ink">
        {invite.invitedByName ?? "O dono da fazenda"} convidou você como {role}.{" "}
        <span className="text-ink-soft">{expiresInSentence(invite.expiresAt, new Date())}.</span>
      </p>
      <AccessSummaryBox permissions={invite.permissions} />
      <div className="grid gap-2">
        <Button type="button" className="min-h-11 w-full" onClick={onAccept} disabled={busy}>
          Aceitar e entrar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={onDecline}
          disabled={busy}
        >
          Recusar
        </Button>
      </div>
    </section>
  );
}
```

Create `components/invites/InvitesScreen.tsx`:

```tsx
"use client";

/**
 * The /convites screen: answer each convite, or — with none left — create a
 * farm of one's own. Accepting stores the farm as the active one and reloads
 * into the app, so the herd store hydrates from that farm.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { MailX, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { setActiveFarmId } from "@/lib/api/activeFarm";
import type { MyInvites } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import { useSignOut } from "@/lib/auth/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NELORE_HEAD_VIEWBOX, NeloreMark } from "@/components/ui/nelore-mark";
import { InviteCard } from "@/components/invites/InviteCard";

export function InvitesScreen({ email }: { email: string }) {
  const signOut = useSignOut();
  const [mine, setMine] = useState<MyInvites | null>(null);
  const [declinedFarm, setDeclinedFarm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.invites.get().then(({ data, error }) => {
      if (error) {
        toast.error("Não foi possível carregar os convites.");
        return;
      }
      setMine(data);
    });
  }, []);

  function enter(farmId: number) {
    setActiveFarmId(farmId);
    window.location.assign("/dashboard");
  }

  async function accept(id: number) {
    setBusy(true);
    const { data, error } = await api.invites({ id }).accept.post();
    if (error || !data) {
      setBusy(false);
      toast.error("Este convite não está mais disponível.");
      setMine((current) => current && { ...current, invites: current.invites.filter((i) => i.id !== id) });
      return;
    }
    enter(data.farmId);
  }

  async function decline(id: number, farmName: string) {
    setBusy(true);
    const { error } = await api.invites({ id }).decline.post();
    setBusy(false);
    if (error) {
      toast.error("Não foi possível recusar o convite.");
      return;
    }
    setDeclinedFarm(farmName);
    setMine((current) => current && { ...current, invites: current.invites.filter((i) => i.id !== id) });
  }

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

  const count = mine?.invites.length ?? 0;

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-panel">
            <NeloreMark
              viewBox={NELORE_HEAD_VIEWBOX}
              maskId="nelore-convites"
              durationMs={2500}
              loop={false}
              className="size-[26px] shrink-0"
              style={{ display: "block", overflow: "hidden" }}
            />
          </span>
          <p className="font-heading text-lg leading-none font-semibold text-ink">MeuBov</p>
        </div>

        {mine === null ? (
          <p className="text-sm text-ink-soft">Carregando convites…</p>
        ) : count > 0 ? (
          <>
            <header>
              <h1 className="font-heading text-2xl font-semibold text-ink">
                {count === 1 ? "Você tem um convite" : `Você tem ${count} convites`}
              </h1>
              <p className="mt-0.5 text-sm text-ink-soft">
                Aceite para entrar na fazenda e começar a trabalhar.
              </p>
            </header>
            {mine.invites.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                busy={busy}
                onAccept={() => accept(invite.id)}
                onDecline={() => decline(invite.id, invite.farmName.trim() || `Fazenda #${invite.farmId}`)}
              />
            ))}
          </>
        ) : (
          <section className="flex flex-col gap-2 rounded-lg border border-hairline bg-panel p-4">
            <EmptyState
              icon={MailX}
              title="Nenhum convite pendente"
              description={
                mine.hasFarm
                  ? "Os convites que você recebeu já foram respondidos."
                  : declinedFarm
                    ? `Você recusou o convite da ${declinedFarm}. Para usar o MeuBov na sua própria fazenda, crie uma agora.`
                    : "Para usar o MeuBov na sua própria fazenda, crie uma agora."
              }
            />
            {mine.hasFarm ? (
              <Button asChild className="min-h-11 w-full">
                <Link href="/dashboard">Ir para o painel</Link>
              </Button>
            ) : (
              <Button type="button" className="min-h-11 w-full" onClick={createFarm} disabled={busy}>
                <Plus aria-hidden />
                Criar minha fazenda
              </Button>
            )}
          </section>
        )}

        <p className="text-center text-xs text-ink-soft">
          Convites para <span className="text-ink">{email}</span> ·{" "}
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-medium text-brand hover:underline"
          >
            Sair
          </button>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create the Painel banner and mount it**

Create `components/invites/PendingInviteBanner.tsx`:

```tsx
"use client";

/**
 * Convites for someone who already has a farm: one card per convite at the top
 * of the Painel. Accepting adds the farm to the switcher and offers to open it.
 */
import { MailPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { expiresInSentence } from "@/lib/domain/invites";
import { PRESET_LABEL, accessSummary } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";

export function PendingInviteBanner() {
  const invites = useHerdStore((s) => s.pendingInvites);
  const refreshInvites = useHerdStore((s) => s.refreshInvites);
  const refreshAccess = useHerdStore((s) => s.refreshAccess);
  const switchFarm = useHerdStore((s) => s.switchFarm);

  if (invites.length === 0) return null;

  async function accept(id: number, farmName: string) {
    const { data, error } = await api.invites({ id }).accept.post();
    await refreshInvites();
    if (error || !data) {
      toast.error("Este convite não está mais disponível.");
      return;
    }
    await refreshAccess();
    toast.success(`Você entrou na ${farmName}`, {
      action: { label: "Abrir", onClick: () => void switchFarm(data.farmId) },
    });
  }

  async function decline(id: number) {
    const { error } = await api.invites({ id }).decline.post();
    if (error) {
      toast.error("Não foi possível recusar o convite.");
      return;
    }
    await refreshInvites();
  }

  return (
    <div className="space-y-3">
      {invites.map((invite) => {
        const farmName = invite.farmName.trim() || `Fazenda #${invite.farmId}`;
        return (
          <section
            key={invite.id}
            className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 sm:flex-row sm:items-center"
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft"
            >
              <MailPlus className="size-[18px] text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {invite.invitedByName ?? "Alguém"} convidou você para a {farmName} como{" "}
                {PRESET_LABEL[invite.preset]}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {accessSummary("member", invite.permissions)}.{" "}
                {expiresInSentence(invite.expiresAt, new Date())}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
                onClick={() => decline(invite.id)}
              >
                Recusar
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
                onClick={() => accept(invite.id, farmName)}
              >
                Aceitar
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

In `app/(app)/dashboard/page.tsx`, add below `import { OpenManejoSessions } from "@/components/manejo/open-sessions";`:

```ts
import { PendingInviteBanner } from "@/components/invites/PendingInviteBanner";
```

and replace:

```tsx
      <PageHeader title="Painel" subtitle={`${farm.name} · ${farm.municipality}`} />
```

with:

```tsx
      <PageHeader title="Painel" subtitle={`${farm.name} · ${farm.municipality}`} />

      <PendingInviteBanner />
```

- [ ] **Step 5: Create Sua participação and mount it**

Create `components/settings/MembershipCard.tsx`:

```tsx
"use client";

/**
 * "Sua participação": for a member who is not the Dono, what they may do on
 * this farm and the way out of it.
 */
import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { clearActiveFarmId } from "@/lib/api/activeFarm";
import { formatInstantDate } from "@/lib/domain/invites";
import { roleLabel } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionCard } from "@/components/ui/section-card";
import { AccessSummaryBox } from "@/components/team/AccessSummaryBox";

export function MembershipCard() {
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const farm = farms.find((option) => option.id === activeFarmId);
  if (!farm || farm.role === "owner") return null;
  const farmName = farm.name.trim() || `Fazenda #${farm.id}`;

  async function leave() {
    setBusy(true);
    const { error } = await api.farm.leave.post();
    if (error) {
      setBusy(false);
      toast.error("Não foi possível sair da fazenda.");
      return;
    }
    clearActiveFarmId();
    window.location.assign("/dashboard");
  }

  return (
    <SectionCard title="Sua participação">
      <div className="grid gap-3">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink">
          Você é <Badge variant="secondary">{roleLabel(farm.role, farm.preset)}</Badge> na {farmName}
          {farm.joinedAt ? ` desde ${formatInstantDate(farm.joinedAt)}` : ""}.
        </p>
        <AccessSummaryBox permissions={farm.permissions} />
        <p className="text-xs text-ink-soft">
          Só o dono ou quem cuida da equipe muda o que você pode fazer.
        </p>
        <div>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={() => setConfirming(true)}
          >
            <LogOut aria-hidden />
            Sair da fazenda
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sair da {farmName}?</DialogTitle>
            <DialogDescription>
              Você deixa de ver o rebanho desta fazenda. Para voltar, alguém da equipe precisa
              convidar você de novo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={leave} disabled={busy}>
              Sair da fazenda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
```

In `app/(app)/settings/page.tsx`, replace:

```tsx
import { InvernadasSettings } from "@/components/settings/LotsPaddocks";
```

with:

```tsx
import { InvernadasSettings } from "@/components/settings/LotsPaddocks";
import { MembershipCard } from "@/components/settings/MembershipCard";
```

and replace:

```tsx
        <InvernadasSettings />
```

with:

```tsx
        <InvernadasSettings />
        <MembershipCard />
```

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 7: No commit.**

---

### Task 15: Hide writes — Rebanho, Reprodução, Fazenda

**Files:**
- Modify: `app/(app)/herd/page.tsx`
- Modify: `app/(app)/herd/cadastrar-varios/page.tsx`
- Modify: `app/(app)/herd/[id]/page.tsx`
- Modify: `components/animal/WeightEvolution.tsx`
- Modify: `components/settings/HerdCategories.tsx`
- Modify: `components/settings/RegisteredBreeds.tsx`
- Modify: `components/animal/AnimalReproduction.tsx`
- Modify: `app/(app)/nascimentos/page.tsx`
- Modify: `app/(app)/nascimentos/reproducao/page.tsx` (the Coberturas screen; it moved from `coberturas/` to `reproducao/`, and `/nascimentos/coberturas` redirects there)
- Modify: `components/breedings/breedings-list.tsx`
- Modify: `components/settings/FarmDataForm.tsx`

**Interfaces:**
- Consumes: `useCan(area, level)` (Task 11); `<ReadOnlyPill />`, `<RequireAccess area level>` (Task 12); `PageHeader`'s existing `badges` and `actions` props.
- Produces: nothing new. Write controls of the herd, reproduction and farm areas are hidden (not disabled) below `edit`, and the Rebanho, ficha do animal, Nascimentos and Coberturas pages show "Somente leitura" when the user may only read.

Every file below except `app/(app)/herd/cadastrar-varios/page.tsx` already starts with `"use client"` or is only rendered from a client page; Step 4 adds the directive to `WeightEvolution.tsx`, which had none. `cadastrar-varios/page.tsx` stays a Server Component and wraps its form in the client `RequireAccess`. `AppShell` renders pages only once the store has `loaded`, so `useCan` already sees the real levels on first paint.

- [ ] **Step 1: Rebanho list**

In `app/(app)/herd/page.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

Replace:

```ts
  const lotPlacements = useHerdStore((state) => state.lotPlacements);
```

with:

```ts
  const lotPlacements = useHerdStore((state) => state.lotPlacements);
  const canEdit = useCan("herd", "edit");
  const canEditLots = useCan("lots", "edit");
```

Replace:

```tsx
        subtitle={herdSubtitle(derived.length, filtered.length, filterActive)}
        actions={
          <div className="flex flex-wrap gap-2">
            <ImportHerdDialog />
            <AddAnimalsButton />
          </div>
        }
      />
```

with:

```tsx
        subtitle={herdSubtitle(derived.length, filtered.length, filterActive)}
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              {/* The import creates the sheet's new lots, so the server also asks for Lotes edit. */}
              {canEditLots ? <ImportHerdDialog /> : null}
              <AddAnimalsButton />
            </div>
          ) : undefined
        }
      />
```

`POST /api/herd/animals/import` requires `edit: ["herd", "lots"]` (Task 5), so a Personalizado with Rebanho edit and Lotes view would otherwise see a button that answers 403.

- [ ] **Step 2: Cadastrar vários by URL**

In `app/(app)/herd/cadastrar-varios/page.tsx` (a Server Component; `RequireAccess` is the client boundary that reads the store):

Replace:

```ts
import { BatchRegisterForm } from "@/components/herd/batch/BatchRegisterForm";
```

with:

```ts
import { RequireAccess } from "@/components/layout/RequireAccess";
import { BatchRegisterForm } from "@/components/herd/batch/BatchRegisterForm";
```

Replace:

```tsx
  return <BatchRegisterForm />;
```

with:

```tsx
  return (
    <RequireAccess area="herd" level="edit">
      <BatchRegisterForm />
    </RequireAccess>
  );
```

- [ ] **Step 3: Ficha do animal**

In `app/(app)/herd/[id]/page.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
import { EmptyState } from "@/components/ui/empty-state";
```

with:

```ts
import { EmptyState } from "@/components/ui/empty-state";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

The hook goes with the other hooks, above the `if (!animal)` return, so the hook order is the same whether or not the animal exists. Replace:

```tsx
  const lotPlacements = useHerdStore((s) => s.lotPlacements);

  const animal = animalById(animals, params.id);
```

with:

```tsx
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const canEditHerd = useCan("herd", "edit");

  const animal = animalById(animals, params.id);
```

Replace:

```tsx
        <BackLink />
        <EditAnimalDialog animal={animal} />
```

with:

```tsx
        <BackLink />
        {canEditHerd ? <EditAnimalDialog animal={animal} /> : <ReadOnlyPill />}
```

- [ ] **Step 4: Weighing form on the ficha**

In `components/animal/WeightEvolution.tsx` (no `"use client"` yet; it now calls a hook):

Replace:

```tsx
/**
 * "Weight evolution" section: line chart of the weighings, ADG summary
```

with:

```tsx
"use client";

/**
 * "Weight evolution" section: line chart of the weighings, ADG summary
```

Replace:

```ts
import { formatNumber } from "@/lib/domain/format";
```

with:

```ts
import { formatNumber } from "@/lib/domain/format";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
export function WeightEvolution({ animal, adg }: WeightEvolutionProps) {
```

with:

```tsx
export function WeightEvolution({ animal, adg }: WeightEvolutionProps) {
  const canEditHerd = useCan("herd", "edit");
```

Without the form the 260px column would stay empty, so the chart takes the card. Replace:

```tsx
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
```

with:

```tsx
      <div
        className={
          canEditHerd ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]" : "grid gap-6"
        }
      >
```

Replace:

```tsx
        <WeighingForm earTag={animal.earTag} />
```

with:

```tsx
        {canEditHerd ? <WeighingForm earTag={animal.earTag} /> : null}
```

- [ ] **Step 5: Categorias do rebanho**

In `components/settings/HerdCategories.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const removeCustomCategory = useHerdStore((s) => s.removeCustomCategory);
```

with:

```ts
  const removeCustomCategory = useHerdStore((s) => s.removeCustomCategory);
  const canEdit = useCan("herd", "edit");
```

Replace:

```tsx
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover categoria ${c.name}`}
                  className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                  onClick={() => onRemove(c.id, c.name)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
```

with:

```tsx
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover categoria ${c.name}`}
                    className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                    onClick={() => onRemove(c.id, c.name)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
```

Replace:

```tsx
        <form onSubmit={onAdd} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid min-w-40 flex-1 gap-1.5">
            <Label htmlFor="custom-category-name">Nome</Label>
            <Input
              id="custom-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Garrote"
              className="min-h-11 md:min-h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="custom-category-base">Categoria base</Label>
            <Select value={base} onValueChange={(v) => setBase(v as Category)}>
              <SelectTrigger id="custom-category-base" className="min-h-11 w-40 md:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_LIST.map((category) => (
                  <SelectItem key={category} value={category}>
                    {CATEGORY_LABEL[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="min-h-11 md:min-h-9">
            <Plus data-icon="inline-start" aria-hidden />
            Adicionar
          </Button>
        </form>
```

with:

```tsx
        {canEdit ? (
          <form onSubmit={onAdd} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="grid min-w-40 flex-1 gap-1.5">
              <Label htmlFor="custom-category-name">Nome</Label>
              <Input
                id="custom-category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Garrote"
                className="min-h-11 md:min-h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="custom-category-base">Categoria base</Label>
              <Select value={base} onValueChange={(v) => setBase(v as Category)}>
                <SelectTrigger id="custom-category-base" className="min-h-11 w-40 md:min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_LABEL[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="min-h-11 md:min-h-9">
              <Plus data-icon="inline-start" aria-hidden />
              Adicionar
            </Button>
          </form>
        ) : null}
```

- [ ] **Step 6: Raças cadastradas**

In `components/settings/RegisteredBreeds.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const removeBreed = useHerdStore((s) => s.removeBreed);
```

with:

```ts
  const removeBreed = useHerdStore((s) => s.removeBreed);
  const canEdit = useCan("herd", "edit");
```

Replace:

```tsx
            <button
              type="button"
              onClick={() => onRemove(breed)}
              aria-label={`Remover raça ${breed}`}
              className="-mr-1.5 inline-flex min-h-11 min-w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-overdue md:min-h-5 md:min-w-5"
            >
              <X className="size-3.5" aria-hidden />
            </button>
```

with:

```tsx
            {canEdit ? (
              <button
                type="button"
                onClick={() => onRemove(breed)}
                aria-label={`Remover raça ${breed}`}
                className="-mr-1.5 inline-flex min-h-11 min-w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-overdue md:min-h-5 md:min-w-5"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
```

Replace:

```tsx
      <form onSubmit={onAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova raça"
          aria-label="Nome da nova raça"
          className="sm:max-w-56"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={name.trim() === ""}
          className="min-h-11 md:min-h-0"
        >
          Adicionar
        </Button>
      </form>
```

with:

```tsx
      {canEdit ? (
        <form onSubmit={onAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova raça"
            aria-label="Nome da nova raça"
            className="sm:max-w-56"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={name.trim() === ""}
            className="min-h-11 md:min-h-0"
          >
            Adicionar
          </Button>
        </form>
      ) : null}
```

- [ ] **Step 7: Reprodução on the ficha**

In `components/animal/AnimalReproduction.tsx`:

Replace:

```tsx
 * the first breeding gets registered. Actions disappear once the animal leaves
 * the herd (sold, dead), the history stays readable.
```

with:

```tsx
 * the first breeding gets registered. Actions disappear once the animal leaves
 * the herd (sold, dead) or for a user without Reprodução edit; the history
 * stays readable.
```

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
export function AnimalReproduction({ animal }: AnimalReproductionProps) {
  const record = animal.reproduction ?? EMPTY_RECORD;
```

with:

```tsx
export function AnimalReproduction({ animal }: AnimalReproductionProps) {
  const canEdit = useCan("reproduction", "edit");
  const record = animal.reproduction ?? EMPTY_RECORD;
```

Replace:

```tsx
      action={animal.active ? <RegisterBreedingDialog earTag={animal.earTag} /> : null}
```

with:

```tsx
      action={
        animal.active && canEdit ? <RegisterBreedingDialog earTag={animal.earTag} /> : null
      }
```

Replace:

```tsx
            {animal.active && breedings.length > 0 ? (
```

with:

```tsx
            {animal.active && canEdit && breedings.length > 0 ? (
```

Replace:

```tsx
            {animal.active ? <RegisterCalvingDialog dam={animal} /> : null}
```

with:

```tsx
            {animal.active && canEdit ? <RegisterCalvingDialog dam={animal} /> : null}
```

- [ ] **Step 8: Nascimentos**

In `app/(app)/nascimentos/page.tsx` (already `"use client"`):

Replace:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

Replace:

```ts
import { RegisterBirthDialog } from "@/components/births/register-birth-dialog";
```

with:

```ts
import { RegisterBirthDialog } from "@/components/births/register-birth-dialog";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
export default function NascimentosPage() {
  return (
```

with:

```tsx
export default function NascimentosPage() {
  const canEdit = useCan("reproduction", "edit");

  return (
```

Replace:

```tsx
        subtitle="Bezerros nascidos na fazenda e o registro de novos partos"
        actions={
          <>
            <ImportBirthsDialog />
            <RegisterBirthDialog />
          </>
        }
      />
```

with:

```tsx
        subtitle="Bezerros nascidos na fazenda e o registro de novos partos"
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          canEdit ? (
            <>
              <ImportBirthsDialog />
              <RegisterBirthDialog />
            </>
          ) : undefined
        }
      />
```

- [ ] **Step 9: Coberturas screen**

In `app/(app)/nascimentos/reproducao/page.tsx` (already `"use client"`):

Replace:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

Replace:

```ts
import { RegisterBreedingDialog } from "@/components/breedings/register-breeding-dialog";
```

with:

```ts
import { RegisterBreedingDialog } from "@/components/breedings/register-breeding-dialog";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
export default function ReproducaoPage() {
  return (
```

with:

```tsx
export default function ReproducaoPage() {
  const canEdit = useCan("reproduction", "edit");

  return (
```

Replace:

```tsx
        actions={<RegisterBreedingDialog />}
```

with:

```tsx
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={canEdit ? <RegisterBreedingDialog /> : undefined}
```

- [ ] **Step 10: Diagnosis from a Coberturas row**

In `components/breedings/breedings-list.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const animals = useHerdStore((s) => s.animals);
```

with:

```ts
  const animals = useHerdStore((s) => s.animals);
  const canEdit = useCan("reproduction", "edit");
```

The desktop row. Replace:

```tsx
                      {awaitsDiagnosis(row) ? (
                        <RowDiagnosisDialog
                          dam={row.dam}
                          breeding={row.breeding}
                          variant="row"
                        />
```

with:

```tsx
                      {canEdit && awaitsDiagnosis(row) ? (
                        <RowDiagnosisDialog
                          dam={row.dam}
                          breeding={row.breeding}
                          variant="row"
                        />
```

The mobile card (the old string carries the `variant="card"` line because the shorter `{awaitsDiagnosis(row) ? (` also matches inside the desktop row). Replace:

```tsx
                {awaitsDiagnosis(row) ? (
                  <RowDiagnosisDialog dam={row.dam} breeding={row.breeding} variant="card" />
```

with:

```tsx
                {canEdit && awaitsDiagnosis(row) ? (
                  <RowDiagnosisDialog dam={row.dam} breeding={row.breeding} variant="card" />
```

- [ ] **Step 11: Dados da fazenda**

In `components/settings/FarmDataForm.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const saveFarm = useHerdStore((s) => s.saveFarm);
```

with:

```ts
  const saveFarm = useHerdStore((s) => s.saveFarm);
  const canEdit = useCan("farm", "edit");
```

Replace:

```tsx
              onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
              className={mono ? "font-mono" : undefined}
            />
          </div>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!hasChange} className="min-h-11 md:min-h-0">
            Salvar
          </Button>
        </div>
```

with:

```tsx
              onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
              readOnly={!canEdit}
              className={mono ? "font-mono" : undefined}
            />
          </div>
        ))}
        {canEdit ? (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={!hasChange} className="min-h-11 md:min-h-0">
              Salvar
            </Button>
          </div>
        ) : null}
```

With the fields read-only `hasChange` stays false, so `onSave` returns early even if the form were submitted; four text fields and no submit button also block implicit submission on Enter.

- [ ] **Step 12: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. A `react-hooks/rules-of-hooks` error on `app/(app)/herd/[id]/page.tsx` means `useCan` ended up below the `if (!animal)` return; move it back up with the other hooks.

- [ ] **Step 13: No commit.**

---

### Task 16: Hide writes — Sanitário

**Files:**
- Modify: `app/(app)/calendar/page.tsx`
- Modify: `components/calendar/OverdueSection.tsx`, `components/calendar/TreatmentRow.tsx`, `components/calendar/TreatmentGroupList.tsx`, `components/calendar/DayDialog.tsx`, `components/calendar/HealthProtocols.tsx`
- Modify: `components/animal/HealthHistory.tsx`
- Modify: `components/manejo/activity-panel.tsx`
- Modify: `components/dashboard/UpcomingTreatments.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (the `useCan` import and the treatments card only)

**Interfaces:**
- Consumes: `useCan` (Task 11), `<ReadOnlyPill />` (Task 12), `PageHeader`'s `badges` prop (existing).
- Produces:
  - `UpcomingTreatmentsProps.onComplete?: (id: string) => void`: without it the card lists the treatments with no "Concluir".
  - `ActivityRow`'s `onComplete?: () => void` (file-local): without it the row has no "Concluir".
  - `app/(app)/dashboard/page.tsx` imports `useCan`; Task 18 adds its own hook call on that import.

Write controls are hidden, not disabled, when Sanitário is below `edit`. Each leaf component that draws a button calls `useCan("sanitary", "edit")` itself, so no page threads a flag down. The two components that already take a completion handler (`UpcomingTreatments`, `ActivityRow`) hide "Concluir" when the handler is absent.

- [ ] **Step 1: Mark the Calendário Sanitário read-only**

In `app/(app)/calendar/page.tsx`:

Below `import { useHerdStore } from "@/lib/store/useHerdStore";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Below `import { PageHeader } from "@/components/layout/PageHeader";` add:

```ts
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

Replace:

```ts
  const deleteTreatment = useHerdStore((s) => s.deleteTreatment);
```

with:

```ts
  const deleteTreatment = useHerdStore((s) => s.deleteTreatment);
  const canEdit = useCan("sanitary", "edit");
```

Replace:

```tsx
      <PageHeader
        title="Calendário Sanitário"
```

with:

```tsx
      <PageHeader
        title="Calendário Sanitário"
        badges={canEdit ? undefined : <ReadOnlyPill />}
```

The month navigation in `actions` stays: it only reads.

- [ ] **Step 2: Hide the overdue writes**

In `components/calendar/OverdueSection.tsx`:

Below `import { useHerdStore } from "@/lib/store/useHerdStore";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const animals = useHerdStore((state) => state.animals);
```

with:

```ts
  const animals = useHerdStore((state) => state.animals);
  const canEdit = useCan("sanitary", "edit");
```

Replace the single-animal row's buttons:

```tsx
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-0"
                    onClick={() => onMarkDone(first.id)}
                  >
                    Marcar como feito
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir tratamento"
                    className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
                    onClick={() => onDelete(first)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
```

with:

```tsx
                  {canEdit ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 md:min-h-0"
                        onClick={() => onMarkDone(first.id)}
                      >
                        Marcar como feito
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir tratamento"
                        className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
                        onClick={() => onDelete(first)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </>
                  ) : null}
```

Replace the group header's button:

```tsx
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-ink-soft hover:text-overdue md:min-h-0"
                    onClick={() => onDeleteGroup(first)}
                  >
                    <Trash2 data-icon="inline-start" aria-hidden />
                    Excluir todos
                  </Button>
```

with:

```tsx
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 text-ink-soft hover:text-overdue md:min-h-0"
                      onClick={() => onDeleteGroup(first)}
                    >
                      <Trash2 data-icon="inline-start" aria-hidden />
                      Excluir todos
                    </Button>
                  ) : null}
```

Replace the group's per-animal buttons:

```tsx
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 md:min-h-0"
                        onClick={() => onMarkDone(t.id)}
                      >
                        Marcar como feito
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir tratamento deste animal"
                        className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
                        onClick={() => onDelete(t)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
```

with:

```tsx
                      {canEdit ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11 md:min-h-0"
                            onClick={() => onMarkDone(t.id)}
                          >
                            Marcar como feito
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Excluir tratamento deste animal"
                            className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
                            onClick={() => onDelete(t)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </>
                      ) : null}
```

The fragments add no DOM, so the rows' flex layout is the same with edit; without it the date, name and ear tag fill the row.

- [ ] **Step 3: Hide the row and group writes of the month list and the day dialog**

In `components/calendar/TreatmentRow.tsx`:

Below `import { animalByEarTag } from "@/lib/store/selectors";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const animal = useHerdStore((state) =>
    animalByEarTag(state.animals, treatment.animalEarTag)
  );
```

with:

```ts
  const animal = useHerdStore((state) =>
    animalByEarTag(state.animals, treatment.animalEarTag)
  );
  const canEdit = useCan("sanitary", "edit");
```

Replace:

```tsx
      {status !== "done" ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-0"
          onClick={() => onMarkDone(treatment.id)}
        >
          Marcar como feito
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={compact ? "Excluir tratamento deste animal" : "Excluir tratamento"}
        className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
        onClick={() => onDelete(treatment)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
```

with:

```tsx
      {canEdit && status !== "done" ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-0"
          onClick={() => onMarkDone(treatment.id)}
        >
          Marcar como feito
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={compact ? "Excluir tratamento deste animal" : "Excluir tratamento"}
          className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
          onClick={() => onDelete(treatment)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
```

In `components/calendar/TreatmentGroupList.tsx`:

Below `import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const groups = groupTreatments(treatments);
```

with:

```ts
  const canEdit = useCan("sanitary", "edit");
  const groups = groupTreatments(treatments);
```

Replace:

```tsx
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 text-ink-soft hover:text-overdue md:min-h-0"
                onClick={() => onDeleteGroup(first)}
              >
                <Trash2 data-icon="inline-start" aria-hidden />
                Excluir todos
              </Button>
```

with:

```tsx
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-ink-soft hover:text-overdue md:min-h-0"
                  onClick={() => onDeleteGroup(first)}
                >
                  <Trash2 data-icon="inline-start" aria-hidden />
                  Excluir todos
                </Button>
              ) : null}
```

- [ ] **Step 4: Hide "Agendar tratamento" in the day dialog**

In `components/calendar/DayDialog.tsx`:

Below `import { useToast } from "@/components/providers/Toasts";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const { addToast } = useToast();
```

with:

```ts
  const { addToast } = useToast();
  const canEdit = useCan("sanitary", "edit");
```

Replace:

```tsx
                <Button
                  type="button"
                  onClick={() => setScheduling(true)}
                  className="min-h-11 w-full md:min-h-8"
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  Agendar tratamento
                </Button>
```

with:

```tsx
                {canEdit ? (
                  <Button
                    type="button"
                    onClick={() => setScheduling(true)}
                    className="min-h-11 w-full md:min-h-8"
                  >
                    <Plus data-icon="inline-start" aria-hidden />
                    Agendar tratamento
                  </Button>
                ) : null}
```

The "Nenhum tratamento neste dia" empty state stays. `scheduling` can only turn true through that button, so `ScheduleTreatmentForm` never mounts without edit.

- [ ] **Step 5: Hide protocol add and remove**

In `components/calendar/HealthProtocols.tsx`:

Below `import { useHerdStore } from "@/lib/store/useHerdStore";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
/** Table of health protocols with removal and a new-protocol dialog. */
```

with:

```ts
/** Table of health protocols with removal and a new-protocol dialog (both need Sanitário edit). */
```

Replace:

```ts
  const removeProtocol = useHerdStore((s) => s.removeProtocol);
```

with:

```ts
  const removeProtocol = useHerdStore((s) => s.removeProtocol);
  const canEdit = useCan("sanitary", "edit");
```

Replace the opening of the card's action:

```tsx
      action={
        <Dialog open={open} onOpenChange={onOpenChange}>
```

with:

```tsx
      action={canEdit ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
```

and its closing:

```tsx
        </Dialog>
      }
```

with:

```tsx
        </Dialog>
      ) : undefined}
```

The dialog body between the two keeps its indentation.

Replace the actions column header:

```tsx
            <TableHead className="w-10">
              <span className="sr-only">Ações</span>
            </TableHead>
```

with:

```tsx
            {canEdit ? (
              <TableHead className="w-10">
                <span className="sr-only">Ações</span>
              </TableHead>
            ) : null}
```

Replace the remove cell:

```tsx
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeProtocol(protocol.id)}
                  aria-label={`Remover protocolo ${protocol.name}`}
                  className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                >
                  <Trash2 aria-hidden />
                </Button>
              </TableCell>
```

with:

```tsx
              {canEdit ? (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeProtocol(protocol.id)}
                    aria-label={`Remover protocolo ${protocol.name}`}
                    className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </TableCell>
              ) : null}
```

Header and cell go together, so the table keeps its columns aligned.

- [ ] **Step 6: Hide "Marcar como feito" on the ficha do animal**

In `components/animal/HealthHistory.tsx`:

Below `import { useHerdStore } from "@/lib/store/useHerdStore";` add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
```

with:

```ts
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
  const canEdit = useCan("sanitary", "edit");
```

(The hook sits above the empty-list early return, so the hook order never changes.)

Replace the desktop header:

```tsx
              <TableHead className="text-right">Ação</TableHead>
```

with:

```tsx
              {canEdit ? <TableHead className="text-right">Ação</TableHead> : null}
```

Replace the desktop cell:

```tsx
                <TableCell className="text-right">
                  {row.status !== "done" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markTreatmentDone(row.treatment.id)}
                    >
                      Marcar como feito
                    </Button>
                  ) : null}
                </TableCell>
```

with:

```tsx
                {canEdit ? (
                  <TableCell className="text-right">
                    {row.status !== "done" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markTreatmentDone(row.treatment.id)}
                      >
                        Marcar como feito
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
```

Replace the mobile card's button opening:

```tsx
            {row.status !== "done" ? (
              <Button
                variant="outline"
                className="mt-3 min-h-11 w-full"
```

with:

```tsx
            {canEdit && row.status !== "done" ? (
              <Button
                variant="outline"
                className="mt-3 min-h-11 w-full"
```

- [ ] **Step 7: Hide "Concluir" in the Painel de atividades**

In `components/manejo/activity-panel.tsx`:

Replace:

```ts
 * activities (same day/type/name), overdue first, each with a one-tap
 * "Concluir" action that marks the whole batch as done.
 */
import { ClipboardCheck } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
 * activities (same day/type/name), overdue first, each with a one-tap
 * "Concluir" action that marks the whole batch as done. Without Sanitário
 * edit the list only reads.
 */
import { ClipboardCheck } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
}: {
  activity: ManejoActivity;
  onComplete: () => void;
}) {
```

with:

```tsx
}: {
  activity: ManejoActivity;
  /** Absent when the user may not complete treatments: the row has no "Concluir". */
  onComplete?: () => void;
}) {
```

Replace:

```tsx
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0 sm:min-h-9"
        onClick={onComplete}
      >
        <ClipboardCheck aria-hidden />
        Concluir
      </Button>
```

with:

```tsx
      {onComplete ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 sm:min-h-9"
          onClick={onComplete}
        >
          <ClipboardCheck aria-hidden />
          Concluir
        </Button>
      ) : null}
```

Replace:

```ts
  const completeTreatments = useHerdStore((s) => s.completeTreatments);
```

with:

```ts
  const completeTreatments = useHerdStore((s) => s.completeTreatments);
  const canComplete = useCan("sanitary", "edit");
```

Replace:

```tsx
              onComplete={() => completeTreatments(activity.treatmentIds)}
```

with:

```tsx
              onComplete={
                canComplete ? () => completeTreatments(activity.treatmentIds) : undefined
              }
```

- [ ] **Step 8: Hide "Concluir" in the Painel's Próximos tratamentos**

In `components/dashboard/UpcomingTreatments.tsx`:

Replace:

```ts
  items: PendingTreatmentItem[];
  onComplete: (id: string) => void;
```

with:

```ts
  items: PendingTreatmentItem[];
  /** Absent when the user may not complete treatments: the rows have no "Concluir". */
  onComplete?: (id: string) => void;
```

Replace:

```tsx
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-brand md:min-h-0"
                    onClick={() => onComplete(treatment.id)}
                    aria-label={`Concluir ${treatment.name} do animal ${treatment.animalEarTag}`}
                  >
                    Concluir
                  </Button>
```

with:

```tsx
                  {onComplete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 text-brand md:min-h-0"
                      onClick={() => onComplete(treatment.id)}
                      aria-label={`Concluir ${treatment.name} do animal ${treatment.animalEarTag}`}
                    >
                      Concluir
                    </Button>
                  ) : null}
```

(`onComplete` is a parameter never reassigned, so TypeScript 5.9 keeps the narrowing inside the click handler.)

In `app/(app)/dashboard/page.tsx`:

Below `import { PendingInviteBanner } from "@/components/invites/PendingInviteBanner";` (added by Task 14) add:

```ts
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
```

with:

```ts
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
  const canCompleteTreatments = useCan("sanitary", "edit");
```

Replace:

```tsx
          <UpcomingTreatments items={pending} onComplete={onCompleteTreatment} />
```

with:

```tsx
          <UpcomingTreatments
            items={pending}
            onComplete={canCompleteTreatments ? onCompleteTreatment : undefined}
          />
```

- [ ] **Step 9: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 10: No commit.**

---

### Task 17: Hide writes — Lotes e Mapa

**Files:**
- Modify: `app/(app)/lots/page.tsx` (`AddLotDialog` only with edit, pill otherwise)
- Modify: `app/(app)/lots/[id]/page.tsx` (pill joins the header badges)
- Modify: `components/lots/lot-actions.tsx` (nothing without edit)
- Modify: `components/lots/lot-card-menu.tsx` (nothing without edit)
- Modify: `components/settings/LotsPaddocks.tsx` (`InvernadasSettings`: no edit, remove or add without edit)
- Modify: `components/map/invernada-sheet.tsx` (optional outline actions)
- Modify: `app/(app)/map/page.tsx` (no guide and no outline actions without edit)
- Modify: `components/map/map-shell.tsx` (no overflow menu without edit, pill instead)
- Create: `app/(app)/map/setup/layout.tsx` (setup pages redirect to `/map` without edit)

**Interfaces:**
- Consumes: `useCan` (Task 11), `ReadOnlyPill` (Task 12), `MAP_ROUTE` from `lib/domain/mapSetup.ts` (existing).
- Produces:
  - `InvernadaSheet` props `onRedraw?: () => void` and `onClearBoundary?: () => void`; each button renders only when its handler is passed.
  - `app/(app)/map/setup/layout.tsx`: renders its children only with `lots` edit, otherwise `router.replace("/map")` and renders nothing.

- [ ] **Step 1: Read the Next.js layout convention**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`. The new setup layout is a Client Component like `app/(app)/map/layout.tsx`: it takes only `children` (no `params`), and because it sits inside the map's layout the shared Leaflet instance stays mounted through its redirect. `app/(app)/map/setup/` has no layout today (only `page.tsx`, `done/`, `invernada/` and `sede/`); check with `ls "app/(app)/map/setup"` before creating it.

- [ ] **Step 2: Lotes page**

In `app/(app)/lots/page.tsx`, replace:

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { AddLotDialog } from "@/components/lots/add-lot-dialog";
import { LotsPaddocks } from "@/components/lots/lots-paddocks";

export default function LotsPage() {
  return (
```

with:

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { AddLotDialog } from "@/components/lots/add-lot-dialog";
import { LotsPaddocks } from "@/components/lots/lots-paddocks";
import { useCan } from "@/lib/store/usePermissions";

export default function LotsPage() {
  const canEditLots = useCan("lots", "edit");
  return (
```

and replace:

```tsx
        actions={<AddLotDialog />}
```

with:

```tsx
        badges={canEditLots ? undefined : <ReadOnlyPill />}
        actions={canEditLots ? <AddLotDialog /> : undefined}
```

- [ ] **Step 3: Ficha do lote**

In `app/(app)/lots/[id]/page.tsx`:

Replace:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

The hook goes with the other hooks, above the `if (!summary)` early return. Replace:

```tsx
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
```

with:

```tsx
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const canEditLots = useCan("lots", "edit");
```

Replace:

```tsx
        badges={
          lot.needsReview || !currentPlacement ? (
            <>
              {lot.needsReview ? <Badge variant="outline">Revisar cadastro</Badge> : null}
              {!currentPlacement ? <Badge variant="secondary">Encerrado</Badge> : null}
            </>
          ) : undefined
        }
```

with:

```tsx
        badges={
          lot.needsReview || !currentPlacement || !canEditLots ? (
            <>
              {lot.needsReview ? <Badge variant="outline">Revisar cadastro</Badge> : null}
              {!currentPlacement ? <Badge variant="secondary">Encerrado</Badge> : null}
              {canEditLots ? null : <ReadOnlyPill />}
            </>
          ) : undefined
        }
```

`<LotActions summary={summary} />` stays as it is: Step 4 makes it render nothing for a reader, and the row keeps the back link.

- [ ] **Step 4: The ficha's actions**

In `components/lots/lot-actions.tsx`:

Replace:

```tsx
 * (editar, encerrar, excluir, mover), guarded the same way. Deleting sends
 * the farmer back to the list, since the page has nothing left to show.
 */
```

with:

```tsx
 * (editar, encerrar, excluir, mover), guarded the same way. Deleting sends
 * the farmer back to the list, since the page has nothing left to show.
 * Every one of them writes, so whoever may only read Lotes e Mapa gets none.
 */
```

Replace:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
export function LotActions({ summary }: { summary: LotSummary }) {
  const router = useRouter();
  const animals = useHerdStore((state) => state.animals);
  const manejoSessions = useHerdStore((state) => state.manejoSessions);
  const { lot, heads, currentPlacement, currentInvernada } = summary;
```

with:

```tsx
export function LotActions({ summary }: { summary: LotSummary }) {
  const canEditLots = useCan("lots", "edit");
  const router = useRouter();
  const animals = useHerdStore((state) => state.animals);
  const manejoSessions = useHerdStore((state) => state.manejoSessions);
  if (!canEditLots) return null;
  const { lot, heads, currentPlacement, currentInvernada } = summary;
```

- [ ] **Step 5: The lot card's ••• menu**

In `components/lots/lot-card-menu.tsx`:

Replace:

```tsx
 * controlled mode. A refused deletion has no room for an inline line here, so
 * it goes to the toast.
 */
```

with:

```tsx
 * controlled mode. A refused deletion has no room for an inline line here, so
 * it goes to the toast. Whoever may only read Lotes e Mapa gets no menu: every
 * item but "Ver histórico" writes, and the card itself already opens the ficha.
 */
```

Replace:

```tsx
import type { LotCardRow } from "@/lib/store/selectors";
```

with:

```tsx
import type { LotCardRow } from "@/lib/store/selectors";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
  const { lot, placement, heads, canDelete } = row;
  const [dialog, setDialog] = useState<OpenDialog>(null);
```

with:

```tsx
  const { lot, placement, heads, canDelete } = row;
  const canEditLots = useCan("lots", "edit");
  const [dialog, setDialog] = useState<OpenDialog>(null);
```

The early return comes after the last hook (`useEffect`), so the hook order never changes between renders. Replace:

```tsx
  }, [error, addToast]);

  const openState = (name: Exclude<OpenDialog, null>) => ({
```

with:

```tsx
  }, [error, addToast]);

  if (!canEditLots) return null;

  const openState = (name: Exclude<OpenDialog, null>) => ({
```

- [ ] **Step 6: Invernadas in Configurações**

In `components/settings/LotsPaddocks.tsx`:

Replace:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
/** Fixed farm areas with their current logical lots, removal, and an add row. */
export function InvernadasSettings() {
```

with:

```tsx
/**
 * Fixed farm areas with their current logical lots, removal, and an add row.
 * Editing, removal and the add row belong to whoever may edit Lotes e Mapa;
 * anyone else reads the table, which then has no Ações column.
 */
export function InvernadasSettings() {
```

Replace:

```tsx
  const removeInvernada = useHerdStore((s) => s.removeInvernada);
```

with:

```tsx
  const removeInvernada = useHerdStore((s) => s.removeInvernada);
  const canEditLots = useCan("lots", "edit");
```

Replace:

```tsx
            <TableHead className="text-right">Cabeças</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">Ações</span>
            </TableHead>
```

with:

```tsx
            <TableHead className="text-right">Cabeças</TableHead>
            {canEditLots ? (
              <TableHead className="w-20">
                <span className="sr-only">Ações</span>
              </TableHead>
            ) : null}
```

Replace:

```tsx
              <TableCell className="text-right font-mono">{formatNumber(headCount)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <EditInvernadaDialog invernada={invernada} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(invernada)}
                    aria-label={`Remover invernada ${invernada.code}`}
                    className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </TableCell>
```

with:

```tsx
              <TableCell className="text-right font-mono">{formatNumber(headCount)}</TableCell>
              {canEditLots ? (
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <EditInvernadaDialog invernada={invernada} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(invernada)}
                      aria-label={`Remover invernada ${invernada.code}`}
                      className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              ) : null}
```

Replace:

```tsx
      <form
        onSubmit={onAdd}
        className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 sm:flex-row"
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código"
          aria-label="Número ou código da nova invernada"
          className="font-mono sm:max-w-28"
          autoCapitalize="characters"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (opcional)"
          aria-label="Nome opcional da nova invernada"
        />
        <Input
          value={grass}
          onChange={(e) => setGrass(e.target.value)}
          placeholder="Capim"
          aria-label="Capim da nova invernada"
        />
        <Input
          value={hectares}
          onChange={(e) => setHectares(e.target.value)}
          placeholder="Hectares"
          aria-label="Hectares da nova invernada"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          className="font-mono sm:max-w-28"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={adding}
          className="min-h-11 md:min-h-0"
        >
          {adding ? "Adicionando…" : "Adicionar"}
        </Button>
      </form>
```

with:

```tsx
      {canEditLots ? (
        <form
          onSubmit={onAdd}
          className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 sm:flex-row"
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código"
            aria-label="Número ou código da nova invernada"
            className="font-mono sm:max-w-28"
            autoCapitalize="characters"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (opcional)"
            aria-label="Nome opcional da nova invernada"
          />
          <Input
            value={grass}
            onChange={(e) => setGrass(e.target.value)}
            placeholder="Capim"
            aria-label="Capim da nova invernada"
          />
          <Input
            value={hectares}
            onChange={(e) => setHectares(e.target.value)}
            placeholder="Hectares"
            aria-label="Hectares da nova invernada"
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            className="font-mono sm:max-w-28"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={adding}
            className="min-h-11 md:min-h-0"
          >
            {adding ? "Adicionando…" : "Adicionar"}
          </Button>
        </form>
      ) : null}
```

The `removeError` and `formError` lines stay: only the hidden controls can set them.

- [ ] **Step 7: Optional outline actions on the invernada sheet**

In `components/map/invernada-sheet.tsx`:

Replace:

```tsx
 * The summary that opens when an invernada is tapped: its numbers, the lots on
 * it right now, and the two things you can do to its outline.
```

with:

```tsx
 * The summary that opens when an invernada is tapped: its numbers, the lots on
 * it right now, and the two things you can do to its outline. The page leaves
 * both out for whoever may only read Lotes e Mapa, and their buttons go with them.
```

Replace:

```tsx
  onRedraw: () => void;
  onClearBoundary: () => void;
  onClose: () => void;
```

with:

```tsx
  /** Omitted for a reader; the "Redesenhar" button renders only with it. */
  onRedraw?: () => void;
  /** Omitted for a reader; the "Apagar contorno" button renders only with it. */
  onClearBoundary?: () => void;
  onClose: () => void;
```

Replace:

```tsx
      <MapPanelActions>
        <Button
          type="button"
          variant="outline"
          onClick={onRedraw}
          disabled={busy}
          className="min-h-11"
        >
          <MapPin aria-hidden />
          Redesenhar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClearBoundary}
          disabled={busy}
          className="min-h-11 text-ink-soft hover:text-overdue"
        >
          <Trash2 aria-hidden />
          {busy ? "Apagando…" : "Apagar contorno"}
        </Button>
```

with:

```tsx
      <MapPanelActions>
        {onRedraw ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRedraw}
            disabled={busy}
            className="min-h-11"
          >
            <MapPin aria-hidden />
            Redesenhar
          </Button>
        ) : null}
        {onClearBoundary ? (
          <Button
            type="button"
            variant="outline"
            onClick={onClearBoundary}
            disabled={busy}
            className="min-h-11 text-ink-soft hover:text-overdue"
          >
            <Trash2 aria-hidden />
            {busy ? "Apagando…" : "Apagar contorno"}
          </Button>
        ) : null}
```

"Ver lotes" stays as it is, with `ml-auto`, so it still sits at the right on its own.

- [ ] **Step 8: Map page**

In `app/(app)/map/page.tsx`:

Replace:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
  const updateInvernada = useHerdStore((s) => s.updateInvernada);
```

with:

```tsx
  const updateInvernada = useHerdStore((s) => s.updateInvernada);
  const canEditLots = useCan("lots", "edit");
```

Replace:

```tsx
  const step = nextStep(farm, invernadas, skipped);
```

with:

```tsx
  // The guide only leads into the setup pages, which only write: a reader gets
  // no step, so neither GuidePanel nor GuidePill renders.
  const step = canEditLots ? nextStep(farm, invernadas, skipped) : null;
```

Replace:

```tsx
          onRedraw={() =>
            router.push(stepHref({ kind: "invernada", invernadaId: selected.invernada.id }))
          }
          onClearBoundary={onClearBoundary}
```

with:

```tsx
          onRedraw={
            canEditLots
              ? () =>
                  router.push(stepHref({ kind: "invernada", invernadaId: selected.invernada.id }))
              : undefined
          }
          onClearBoundary={canEditLots ? onClearBoundary : undefined}
```

- [ ] **Step 9: Map shell**

In `components/map/map-shell.tsx`:

Replace:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
import { useToast } from "@/components/providers/Toasts";
```

with:

```tsx
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { useToast } from "@/components/providers/Toasts";
```

Replace:

```tsx
  const saveHeadquarters = useHerdStore((s) => s.saveHeadquarters);
```

with:

```tsx
  const saveHeadquarters = useHerdStore((s) => s.saveHeadquarters);
  const canEditLots = useCan("lots", "edit");
```

The map has no page title, so the "Somente leitura" pill takes the menu's corner. Replace:

```tsx
          <div className="pointer-events-auto ml-auto">
            <MapMenu
              hasHeadquarters={farm.headquarters !== undefined}
              savingHeadquarters={savingHeadquarters}
              onSaveHeadquarters={onSaveHeadquarters}
              onTypeCoordinates={() => setTypingCoordinates(true)}
            />
          </div>
```

with:

```tsx
          {/* Both menu items write (a typed outline, the sede): a reader gets the pill. */}
          {canEditLots ? (
            <div className="pointer-events-auto ml-auto">
              <MapMenu
                hasHeadquarters={farm.headquarters !== undefined}
                savingHeadquarters={savingHeadquarters}
                onSaveHeadquarters={onSaveHeadquarters}
                onTypeCoordinates={() => setTypingCoordinates(true)}
              />
            </div>
          ) : (
            <div className="ml-auto shrink-0 self-center rounded-md shadow-md">
              <ReadOnlyPill />
            </div>
          )}
```

`CoordinatesDialog` and `SaveBoundaryDialog` stay mounted as they are: only the menu opens them, so without it they never open.

- [ ] **Step 10: Setup pages redirect a reader to the map**

Create `app/(app)/map/setup/layout.tsx`:

```tsx
"use client";

/**
 * Gate for the guided setup (/map/setup/*). Every step here writes (the sede,
 * an outline), so whoever may only read Lotes e Mapa is sent back to the map
 * instead of landing on a panel whose buttons the server would refuse.
 *
 * It renders nothing until the redirect lands, so no step page mounts and the
 * entry page never fires its own redirect first. It sits inside the map's
 * layout, so the shared Leaflet instance survives the trip. The AppShell only
 * renders once the farm list is loaded, so the levels read here are the real
 * ones, not the floors.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MAP_ROUTE } from "@/lib/domain/mapSetup";
import { useCan } from "@/lib/store/usePermissions";

export default function MapSetupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const canEditLots = useCan("lots", "edit");

  useEffect(() => {
    if (!canEditLots) router.replace(MAP_ROUTE);
  }, [canEditLots, router]);

  return canEditLots ? <>{children}</> : null;
}
```

- [ ] **Step 11: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. A "React Hook is called conditionally" error means an early `return null` landed above a hook: in `LotCardMenu` it must follow the `useEffect`, in `LotActions` the `useHerdStore` calls.

- [ ] **Step 12: No commit.**

---

### Task 18: Manejo and money in the UI

**Files:**
- Modify: `components/manejo/helpers.ts` (`movementSubtitle`)
- Test: `components/manejo/__tests__/helpers.test.ts`
- Modify: `components/manejo/register-manejo-dialog.tsx`
- Modify: `app/(app)/manejo/page.tsx`
- Modify: `components/manejo/session-runner.tsx`
- Modify: `components/manejo/detail-shell.tsx` (`DetailHeader`)
- Modify: `components/manejo/manejo-row-menu.tsx`
- Modify: `components/manejo/manejo-history.tsx`
- Modify: `components/dashboard/DashboardKpisRow.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (as Tasks 14 and 16 left it)
- Modify: `app/(app)/finance/page.tsx`
- Modify: `components/finance/ExpensesList.tsx`

**Interfaces:**
- Consumes: `can` (Task 1); `canDeleteSession`, `ManejoSession.valuesHidden` (Task 2); `useCan`, `useActivePermissions` (Task 11); `<ReadOnlyPill />`, `<RequireAccess area level>` (Task 12); the server redaction of Task 8 (a member without Financeiro gets sessions without `pricePerArroba`, `totalAmountBrl`, `amountBrl` and `treatment.costBrl`, marked `valuesHidden: true`, and no expenses).
- Produces:
  - `movementSubtitle(session, lotName)` omits the money part when `session.valuesHidden`: `Venda · {comprador}` and `Compra · entra em {lote} · {vendedor}`.
  - `DashboardKpisRow` prop `showMoney: boolean`.
  - `/finance` renders `<NoAccess />` without Financeiro `view`.

- [ ] **Step 1: Write the failing subtitle tests**

In `components/manejo/__tests__/helpers.test.ts`, replace:

```ts
import { manejoHistory, visibleSaleRows } from "@/components/manejo/helpers";
```

with:

```ts
import { manejoHistory, movementSubtitle, visibleSaleRows } from "@/components/manejo/helpers";
```

and append at the end of the file:

```ts
describe("movementSubtitle", () => {
  it("drops the price of a venda whose values the server hid", () => {
    const session = makeSession({
      pricePerArroba: undefined,
      carcassYieldPct: 52,
      counterparty: "Frigorífico Boi Bom",
      valuesHidden: true,
    });
    expect(movementSubtitle(session, undefined)).toBe("Venda · Frigorífico Boi Bom");
    expect(movementSubtitle({ ...session, counterparty: undefined }, undefined)).toBe("Venda");
  });

  it("drops the total of a compra whose values the server hid", () => {
    const session = makeSession({
      kind: "entry",
      pricePerArroba: undefined,
      counterparty: "Fazenda Santa Luzia",
      valuesHidden: true,
    });
    expect(movementSubtitle(session, "Recria 2")).toBe(
      "Compra · entra em Recria 2 · Fazenda Santa Luzia"
    );
  });

  it("still says sem preço and sem valor when nothing was hidden", () => {
    expect(movementSubtitle(makeSession({ pricePerArroba: undefined }), undefined)).toBe(
      "Venda · sem preço"
    );
    expect(
      movementSubtitle(makeSession({ kind: "entry", pricePerArroba: undefined }), "Recria 2")
    ).toBe("Compra · sem valor · entra em Recria 2");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run components/manejo/__tests__/helpers.test.ts`
Expected: FAIL in the two "values the server hid" cases, e.g. `expected 'Venda · sem preço · Frigorífico Boi Bom' to be 'Venda · Frigorífico Boi Bom'`. The "still says sem preço" case and every older case pass.

- [ ] **Step 3: Omit the money part of a redacted subtitle**

In `components/manejo/helpers.ts`, replace:

```ts
/**
 * Subtitle line of a session that moves the herd: where to, for how much.
 * Shared by the chute screen and the venda record.
 */
export function movementSubtitle(
  session: ManejoSession,
  lotName: string | undefined
): string {
  if (session.kind === "transfer") {
    return lotName ? `Destino: ${lotName}` : "Troca de lote";
  }
  const who = session.counterparty ? ` \u00b7 ${session.counterparty}` : "";
  if (session.kind === "sale") {
```

with:

```ts
/**
 * Subtitle line of a session that moves the herd: where to, for how much.
 * Shared by the chute screen and the venda record. A session the server
 * stripped of its values (a member without Financeiro) loses the money part
 * instead of printing "sem preço", which would read as a price nobody set.
 */
export function movementSubtitle(
  session: ManejoSession,
  lotName: string | undefined
): string {
  if (session.kind === "transfer") {
    return lotName ? `Destino: ${lotName}` : "Troca de lote";
  }
  const who = session.counterparty ? ` \u00b7 ${session.counterparty}` : "";
  if (session.valuesHidden) {
    return session.kind === "sale"
      ? `Venda${who}`
      : `Compra${lotName ? ` \u00b7 entra em ${lotName}` : ""}${who}`;
  }
  if (session.kind === "sale") {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run components/manejo/__tests__/helpers.test.ts`
Expected: PASS. `sale-detail.tsx`, `entry-detail.tsx`, `transfer-detail.tsx` and the runner all print this subtitle, so they follow without edits.

- [ ] **Step 5: Keep venda, entrada and the plan cost away from "Iniciar manejo"**

In `components/manejo/register-manejo-dialog.tsx`:

Replace:

```ts
import { useHerdStore, type NewManejoSession } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore, type NewManejoSession } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
```

Replace:

```ts
  const moves = isMovementAction(fields.action);
```

with:

```ts
  const moves = isMovementAction(fields.action);
  // A venda, an entrada and the plan's cost are money: without Financeiro edit
  // the dialog offers none of them, since the server would refuse the start.
  const canEditFinance = useCan("finance", "edit");
  const actionList = canEditFinance
    ? MANEJO_ACTION_LIST
    : MANEJO_ACTION_LIST.filter((action) => action !== "sale" && action !== "entry");
```

Replace:

```tsx
                <SelectContent>
                  {MANEJO_ACTION_LIST.map((action) => (
                    <SelectItem key={action} value={action}>
                      {MANEJO_ACTION_LABEL[action]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
```

with:

```tsx
                <SelectContent>
                  {actionList.map((action) => (
                    <SelectItem key={action} value={action}>
                      {MANEJO_ACTION_LABEL[action]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canEditFinance ? null : (
                <p className="text-xs text-ink-soft">
                  Venda e entrada (compra) ficam com quem cuida do financeiro.
                </p>
              )}
```

Replace:

```tsx
              <div className="grid gap-1.5">
                <Label htmlFor="manejo-responsible">Responsável (opcional)</Label>
```

with:

```tsx
              <div className={cn("grid gap-1.5", !canEditFinance && "sm:col-span-2")}>
                <Label htmlFor="manejo-responsible">Responsável (opcional)</Label>
```

Replace:

```tsx
              <div className="grid gap-1.5">
                <Label htmlFor="manejo-cost">Custo por animal (R$, opcional)</Label>
                <Input
                  id="manejo-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={fields.costBrl}
                  onChange={(e) => setFields((f) => ({ ...f, costBrl: e.target.value }))}
                  aria-invalid={errors.costBrl ? true : undefined}
                  className="min-h-11 font-mono"
                />
                <ErrorMessage message={errors.costBrl} />
              </div>
```

with:

```tsx
              {canEditFinance ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="manejo-cost">Custo por animal (R$, opcional)</Label>
                  <Input
                    id="manejo-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={fields.costBrl}
                    onChange={(e) => setFields((f) => ({ ...f, costBrl: e.target.value }))}
                    aria-invalid={errors.costBrl ? true : undefined}
                    className="min-h-11 font-mono"
                  />
                  <ErrorMessage message={errors.costBrl} />
                </div>
              ) : null}
```

`costBrl` starts as `""` and the field is never mounted without Financeiro edit, so `onSubmit` sends no `treatment.costBrl` and the server's `startNeedsFinance` check passes. The first action is `"vaccine"`, so the filtered list never starts on a hidden value.

- [ ] **Step 6: Gate "Iniciar manejo" on the Manejo page**

In `app/(app)/manejo/page.tsx`, replace:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { useCan } from "@/lib/store/usePermissions";
```

and replace:

```tsx
export default function ManejoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Manejo"
        subtitle="Vacinas, vermifugações, pesagens e atividades pendentes do curral"
        actions={<RegisterManejoDialog />}
      />
```

with:

```tsx
export default function ManejoPage() {
  const canEdit = useCan("manejo", "edit");
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Manejo"
        subtitle="Vacinas, vermifugações, pesagens e atividades pendentes do curral"
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={canEdit ? <RegisterManejoDialog /> : undefined}
      />
```

- [ ] **Step 7: Make the runner read-only without Manejo edit**

In `components/manejo/session-runner.tsx`:

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions, useCan } from "@/lib/store/usePermissions";
import { canDeleteSession } from "@/lib/domain/moneyRedaction";
```

Replace:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```

Replace (the hooks must stay above the `if (!session)` early return):

```ts
  const { addToast } = useToast();
  const router = useRouter();
```

with:

```ts
  const { addToast } = useToast();
  const router = useRouter();
  const canRun = useCan("manejo", "edit");
  const canEditFinance = useCan("finance", "edit");
  const permissions = useActivePermissions();
```

Replace:

```ts
  const open = session.status === "open";
```

with:

```ts
  const open = session.status === "open";
  // Reading a session is not running it: every chute action needs Manejo edit,
  // and the rendimento, which reprices the passes, Financeiro edit on top.
  const operable = open && canRun;
  const setsYield = operable && canEditFinance;
```

Replace:

```ts
  // A venda per arroba pays the carcass: its chute stays held until the modal
  // collects the rendimento the R$/@ applies to.
  const perArroba = isSale && session.pricePerArroba !== undefined;
  const needsYield = open && perArroba && session.carcassYieldPct === undefined;
```

with:

```ts
  // A venda per arroba pays the carcass: its chute stays held until the modal
  // collects the rendimento the R$/@ applies to. Only someone who may set it is
  // held; anyone else runs the chute on the default rendimento, and the passes
  // are repriced once it is set. A vaqueiro never receives the price at all.
  const perArroba = isSale && session.pricePerArroba !== undefined;
  const needsYield = setsYield && perArroba && session.carcassYieldPct === undefined;
```

Replace:

```tsx
      <PageHeader
        title={session.name}
        subtitle={
```

with:

```tsx
      <PageHeader
        title={session.name}
        badges={canRun ? undefined : <ReadOnlyPill />}
        subtitle={
```

Replace:

```tsx
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 text-ink-soft hover:text-overdue md:min-h-9"
              onClick={() => setDeleting(true)}
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              {open ? "Descartar manejo" : "Excluir manejo"}
            </Button>
```

with:

```tsx
          <div className="flex flex-wrap items-center gap-3">
            {canDeleteSession(permissions, session) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-ink-soft hover:text-overdue md:min-h-9"
                onClick={() => setDeleting(true)}
              >
                <Trash2 data-icon="inline-start" aria-hidden />
                {open ? "Descartar manejo" : "Excluir manejo"}
              </Button>
            ) : null}
```

Replace:

```tsx
      {perArroba && session.pricePerArroba !== undefined ? (
        <SaleYieldDialog
```

with:

```tsx
      {setsYield && perArroba && session.pricePerArroba !== undefined ? (
        <SaleYieldDialog
```

Replace:

```tsx
      {open && isEntry ? <EntryChuteForm session={session} todayIso={todayISO()} /> : null}
```

with:

```tsx
      {operable && isEntry ? <EntryChuteForm session={session} todayIso={todayISO()} /> : null}
```

The "Defina o rendimento de carcaça" card and its "Informar rendimento" button render under `needsYield`, which now implies `setsYield`, so the button only reaches someone with Manejo and Financeiro edit; that block needs no edit.

Replace:

```tsx
      {open && !isEntry && !needsYield && current ? (
```

with:

```tsx
      {operable && !isEntry && !needsYield && current ? (
```

Replace:

```tsx
      {open && !isEntry && !current && pending.length === 0 ? (
```

with:

```tsx
      {operable && !isEntry && !current && pending.length === 0 ? (
```

Replace:

```tsx
          onEditYield={
            open && perArroba ? () => setYieldDialogOpen(true) : undefined
          }
```

with:

```tsx
          onEditYield={
            setsYield && perArroba ? () => setYieldDialogOpen(true) : undefined
          }
```

Replace:

```tsx
                      disabled={!open}
```

with:

```tsx
                      disabled={!operable}
```

Replace:

```tsx
                entries={done}
                open={open}
```

with:

```tsx
                entries={done}
                open={operable}
```

Replace:

```tsx
                entries={skipped}
                open={open}
```

with:

```tsx
                entries={skipped}
                open={operable}
```

Replace:

```tsx
      {open ? (
        <div className="flex justify-end">
```

with:

```tsx
      {operable ? (
        <div className="flex justify-end">
```

The Pendentes search (`{open ? (` above `Buscar brinco na fila`) stays on `open`: searching the queue writes nothing. With Financeiro `none` the session arrives without `pricePerArroba` and without pass `amountBrl`, so the live value line, the `HandledList` values and the money rows of `SaleSummaryCard` already drop out; weights and animals stay.

- [ ] **Step 8: Gate "Excluir manejo" on the closed-manejo details pages**

A closed session opens `WeighingDetail`, `TreatmentDetail`, `TransferDetail`, `EntryDetail` or `SaleDetail` (through `components/manejo/manejo-screen.tsx`), and all of them use `DetailHeader`, which carries the other "Excluir manejo" button.

In `components/manejo/detail-shell.tsx`, replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { canDeleteSession } from "@/lib/domain/moneyRedaction";
```

Replace:

```tsx
export function DetailHeader({ title, action, subtitle, session }: DetailHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
```

with:

```tsx
export function DetailHeader({ title, action, subtitle, session }: DetailHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const permissions = useActivePermissions();
  const deletable = session !== undefined && canDeleteSession(permissions, session);
```

Replace:

```tsx
            {session ? (
              <Button
```

with:

```tsx
            {deletable ? (
              <Button
```

The details pages read money only from the session and the treatments, which the server already stripped: `entryTotals`, the treatment cost rows and `sale-detail.tsx`'s Valor and "@ carcaça" columns (`priced` and `perArroba` are false on redacted data) drop out with no edit.

- [ ] **Step 9: Hide the history row menu from whoever may not delete**

In `components/manejo/manejo-row-menu.tsx`, replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { can } from "@/lib/domain/permissions";
import { canDeleteSession } from "@/lib/domain/moneyRedaction";
```

Replace:

```ts
  const [deleting, setDeleting] = useState(false);
```

with:

```ts
  const [deleting, setDeleting] = useState(false);
  const permissions = useActivePermissions();
```

Replace:

```ts
  if (!target) return null;
```

with:

```ts
  if (!target) return null;
  // Each row deletes through the area that wrote it: a session through Manejo
  // (plus Financeiro when it has money), a group of treatments through
  // Sanitário, a day of weighings through Rebanho. A reader gets no menu.
  const allowed =
    target.kind === "session"
      ? canDeleteSession(permissions, target.session)
      : can(permissions, target.kind === "treatments" ? "sanitary" : "herd", "edit");
  if (!allowed) return null;
```

- [ ] **Step 10: Drop the Custo / Valor column from the history without Financeiro**

In `components/manejo/manejo-history.tsx`, replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const [filter, setFilter] = useState<ManejoAction | typeof ALL>(ALL);
```

with:

```ts
  const [filter, setFilter] = useState<ManejoAction | typeof ALL>(ALL);
  // Without Financeiro the server sends no values: the column would be all dashes.
  const seeMoney = useCan("finance", "view");
```

Replace:

```tsx
                  <TableHead className="text-right">Custo / Valor</TableHead>
```

with:

```tsx
                  {seeMoney ? <TableHead className="text-right">Custo / Valor</TableHead> : null}
```

Replace:

```tsx
                    <TableCell className="text-right font-mono text-ink">
                      {session.amountBrl === null ? "—" : formatCurrency(session.amountBrl)}
                    </TableCell>
```

with:

```tsx
                    {seeMoney ? (
                      <TableCell className="text-right font-mono text-ink">
                        {session.amountBrl === null ? "—" : formatCurrency(session.amountBrl)}
                      </TableCell>
                    ) : null}
```

Replace:

```tsx
                  {session.amountBrl !== null ? (
```

with:

```tsx
                  {seeMoney && session.amountBrl !== null ? (
```

- [ ] **Step 11: Let the Painel KPI row drop its money cards**

In `components/dashboard/DashboardKpisRow.tsx`:

Replace:

```ts
import { formatCompactCurrency } from "@/components/finance/format";
```

with:

```ts
import { formatCompactCurrency } from "@/components/finance/format";
import { cn } from "@/lib/utils";
```

Replace:

```ts
  /** Herd market value (R$), or null when the quote is unavailable. */
  herdValue: number | null;
}
```

with:

```ts
  /** Herd market value (R$), or null when the quote is unavailable. */
  herdValue: number | null;
  /**
   * False for a member without Financeiro: the arroba quote and the herd value
   * leave the row, and the grid closes to the three cards left.
   */
  showMoney: boolean;
}
```

Replace:

```ts
 * value. All derived from the herd except the quote (illustrative until a real
 * quote source is plugged), flagged in the note below the row.
 */
```

with:

```ts
 * value. All derived from the herd except the quote (illustrative until a real
 * quote source is plugged), flagged in the note below the row. Without
 * Financeiro only the three herd cards remain.
 */
```

Replace:

```tsx
  stockingRate,
  herdValue,
}: DashboardKpisRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
```

with:

```tsx
  stockingRate,
  herdValue,
  showMoney,
}: DashboardKpisRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-3",
        showMoney ? "lg:grid-cols-5" : "lg:grid-cols-3"
      )}
    >
```

Replace:

```tsx
      <KpiCard
        label="Cotação da arroba"
        value={
          arrobaPrice === null ? (
            "—"
          ) : (
            <>
              {formatNumber(arrobaPrice, 2)}
              <span className="text-sm text-ink-soft"> R$/@</span>
            </>
          )
        }
        delta={
          arrobaMonthlyChangePct === null
            ? undefined
            : {
                text: `${formatNumber(Math.abs(arrobaMonthlyChangePct), 1)}% no mês`,
                positive: arrobaMonthlyChangePct >= 0,
              }
        }
        sub={arrobaQuoteSub ?? "cotação indisponível"}
        icon={TrendingUp}
      />
```

with:

```tsx
      {showMoney ? (
        <KpiCard
          label="Cotação da arroba"
          value={
            arrobaPrice === null ? (
              "—"
            ) : (
              <>
                {formatNumber(arrobaPrice, 2)}
                <span className="text-sm text-ink-soft"> R$/@</span>
              </>
            )
          }
          delta={
            arrobaMonthlyChangePct === null
              ? undefined
              : {
                  text: `${formatNumber(Math.abs(arrobaMonthlyChangePct), 1)}% no mês`,
                  positive: arrobaMonthlyChangePct >= 0,
                }
          }
          sub={arrobaQuoteSub ?? "cotação indisponível"}
          icon={TrendingUp}
        />
      ) : null}
```

Replace:

```tsx
      <KpiCard
        label="Valor do rebanho"
        value={herdValue === null ? "—" : formatCompactCurrency(herdValue)}
        sub={herdValue === null ? "cotação indisponível" : formatCurrency(herdValue)}
        icon={CircleDollarSign}
      />
```

with:

```tsx
      {showMoney ? (
        <KpiCard
          label="Valor do rebanho"
          value={herdValue === null ? "—" : formatCompactCurrency(herdValue)}
          sub={herdValue === null ? "cotação indisponível" : formatCurrency(herdValue)}
          icon={CircleDollarSign}
        />
      ) : null}
```

- [ ] **Step 12: Hide the Painel's money without Financeiro**

In `app/(app)/dashboard/page.tsx` (Task 16 already imported `useCan`; do not add the import again), replace:

```ts
  const farm = useHerdStore((s) => s.farm);
```

with:

```ts
  const farm = useHerdStore((s) => s.farm);
  // Without Financeiro the server sends no values: the money cards go instead of showing zeros.
  const seeMoney = useCan("finance", "view");
```

Replace:

```tsx
          stockingRate={stockingRate}
          herdValue={herdValue}
        />
        <DashboardKpisNote quoteLive={quote.live} />
```

with:

```tsx
          stockingRate={stockingRate}
          herdValue={herdValue}
          showMoney={seeMoney}
        />
        {seeMoney ? <DashboardKpisNote quoteLive={quote.live} /> : null}
```

Replace:

```tsx
      <SectionDivider
        title="Financeiro do período"
        action={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PeriodResultCard result={financials} />
        <ExpensesCard breakdown={periodBreakdown} totalCost={financials.totalCost} />
      </div>
```

with:

```tsx
      {seeMoney ? (
        <>
          <SectionDivider
            title="Financeiro do período"
            action={<PeriodPicker value={period} onChange={setPeriod} />}
          />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PeriodResultCard result={financials} />
            <ExpensesCard breakdown={periodBreakdown} totalCost={financials.totalCost} />
          </div>
        </>
      ) : null}
```

The fragment's children sit directly in the page's `space-y-6` column, so the spacing is unchanged for whoever sees them.

- [ ] **Step 13: Close Financeiro by URL and mark it read-only**

`RequireAccess` cannot wrap the body inside the same component: the page's hooks would run before the check and the order would differ between renders. The page becomes a thin wrapper around the old body.

In `app/(app)/finance/page.tsx`, replace:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
```

with:

```ts
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { RequireAccess } from "@/components/layout/RequireAccess";
```

Replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```tsx
export default function FinancePage() {
  const animals = useHerdStore((state) => state.animals);
```

with:

```tsx
/** Opened by URL without Financeiro, the page is "Sem acesso a esta área", not a screen of zeros. */
export default function FinancePage() {
  return (
    <RequireAccess area="finance" level="view">
      <FinanceContent />
    </RequireAccess>
  );
}

function FinanceContent() {
  const canEdit = useCan("finance", "edit");
  const animals = useHerdStore((state) => state.animals);
```

Replace:

```tsx
      <PageHeader title="Financeiro" subtitle="Indicadores da pecuária de corte" />
```

with:

```tsx
      <PageHeader
        title="Financeiro"
        subtitle="Indicadores da pecuária de corte"
        badges={canEdit ? undefined : <ReadOnlyPill />}
      />
```

- [ ] **Step 14: Gate the expense writes**

In `components/finance/ExpensesList.tsx`, replace:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```ts
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

Replace:

```ts
  const removeExpense = useHerdStore((s) => s.removeExpense);
```

with:

```ts
  const removeExpense = useHerdStore((s) => s.removeExpense);
  // With Financeiro at view the values show and cannot be typed or removed.
  const canEdit = useCan("finance", "edit");
```

Replace:

```tsx
    <SectionCard title="Despesas" action={<RegisterExpenseDialog />}>
```

with:

```tsx
    <SectionCard title="Despesas" action={canEdit ? <RegisterExpenseDialog /> : undefined}>
```

Replace:

```tsx
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover despesa"
                  className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                  onClick={() => onRemove(expense.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
```

with:

```tsx
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover despesa"
                    className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                    onClick={() => onRemove(expense.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
```

- [ ] **Step 15: Confirm the files that need no edit**

- `components/manejo/delete-manejo-dialog.tsx`: `moneyLine` sums `totalAmountBrl ?? animals[].amountBrl`; on a redacted venda both are gone, the total is 0 and the function returns null, so "O valor de … sai do financeiro." never shows without Financeiro.
- `components/manejo/sale-detail.tsx`: `perArroba` (`pricePerArroba !== undefined`) and `priced` (some `amountBrl !== null`) are false on redacted data, so the "@ carcaça" and Valor columns drop out; its subtitle comes from `movementSubtitle` (Step 3).
- `components/manejo/sale-summary.tsx`: `saleSummary` yields null money figures and null carcass figures without `pricePerArroba`, so only heads and weights remain.

Run: `grep -n "sem pre\|sem valor" components/manejo/session-runner.tsx components/manejo/sale-detail.tsx components/manejo/sale-summary.tsx components/manejo/entry-detail.tsx`
Expected: no output (those words live only in `movementSubtitle`, Step 3).

- [ ] **Step 16: Verify**

Run: `pnpm exec vitest run components/manejo`
Expected: PASS.

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. A `react-hooks/rules-of-hooks` error in `session-runner.tsx` means a hook landed below `if (!session)`; move it up with the others.

- [ ] **Step 17: No commit.**

---

### Task 19: Roadmap, full verification, running app, handoff

**Files:**
- Modify: `ROADMAP.md` (items 2 and 3)
- Create (scratchpad, not committed): `smoke-equipe.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: a verified feature and the commit question for the user.

- [ ] **Step 1: Update the roadmap**

In `ROADMAP.md`, replace:

```md
`PUT /farm` trata `headquarters` como três valores — ausente mantém, objeto
substitui, null limpa — para que salvar os dados cadastrais em Ajustes não
apague a vista do mapa. Falta só um botão para limpar a sede pela UI.
```

with:

```md
A sede tem rota própria, `PUT /farm/headquarters` (objeto substitui, null
limpa), separada de `PUT /farm`: ela pertence a Lotes e Mapa e os dados
cadastrais à Fazenda, e cada área é liberada à parte. Falta só um botão para
limpar a sede pela UI.
```

and replace:

```md
## 3. Multi-fazenda — só no backend

`farm_users`, os papéis `owner`/`member` e o cabeçalho `x-farm-id` funcionam no
servidor (`lib/api/plugins/farm.ts`). Falta tudo na UI: seletor de fazenda,
criar uma segunda fazenda, convidar membro, listar membros. O papel é gravado
mas nunca usado para permissão — hoje `member` e `owner` podem o mesmo.
```

with:

```md
## 3. ~~Multi-fazenda — só no backend~~ ✅ feito em 12/09/2026

O dono convida por e-mail em Configurações > Equipe — nada é enviado; a pessoa
aceita ao entrar no MeuBov com aquele e-mail — e dá a cada membro um nível por
área (Nada, Ver ou Editar) a partir dos papéis Gerente, Vaqueiro e Consultor.
O servidor confere o nível em toda rota (`lib/api/permissions/routeRequirements.ts`)
e tira os valores em R$ de quem não tem Financeiro. Conta nova com convite
pendente cai em `/convites` sem ganhar fazenda vazia, e o celular ganhou a troca
de fazenda no "Mais".

Ficou de fora: limite de usuários por plano, envio e verificação de e-mail,
transferência de dono e histórico de quem mudou o quê.
```

- [ ] **Step 2: Run the whole suite, types, lint and build**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: every test file passes, no type or lint errors, the build completes and lists `/convites`, `/settings/equipe` and `/settings/equipe/[userId]`.

- [ ] **Step 3: Start the app against the local database**

Memory notes for this host: one `next dev` per directory (check `pgrep -af next-server`), and `127.0.0.1:5433` may answer as another project's Postgres. Use a bridge port and `next start`:

```bash
docker run --rm -d --name meubov-bridge --network meubov_default -p 127.0.0.1:5440:5440 alpine/socat TCP-LISTEN:5440,fork,reuseaddr TCP:db:5432
export DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5440/meubov
pnpm db:migrate
BETTER_AUTH_URL=http://localhost:3010 pnpm exec next start -p 3010
```

(`next start` runs in the background of its own terminal or with `run_in_background`.) Probe: `curl -s http://localhost:3010/api/auth/ok` returns `{"ok":true}`.

- [ ] **Step 4: Exercise the API and take screenshots**

Create `smoke-equipe.mjs` in the session scratchpad:

```js
import { createRequire } from "node:module";
const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");

const BASE = "http://localhost:3010";
const OUT = new URL(".", import.meta.url).pathname;
const stamp = Date.now();
const users = {
  dono: { name: "Dono Equipe", email: `teste.dono.${stamp}@meubov.local`, password: "EquipeDono2026!" },
  vaqueiro: { name: "Zeca Vaqueiro", email: `teste.vaqueiro.${stamp}@meubov.local`, password: "EquipeVaqueiro2026!" },
  consultor: { name: "Ana Consultora", email: `teste.consultor.${stamp}@meubov.local`, password: "EquipeConsultor2026!" },
};
const VAQUEIRO = { herd: "edit", manejo: "edit", reproduction: "edit", sanitary: "edit", lots: "edit", finance: "none", farm: "view", team: "none" };
const CONSULTOR = { herd: "view", manejo: "view", reproduction: "view", sanitary: "view", lots: "view", finance: "view", farm: "view", team: "none" };

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const browser = await chromium.launch({
  executablePath: "/home/luketa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  headless: true,
});

async function session(user, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, baseURL: BASE });
  await context.request.post("/api/auth/sign-up/email", { data: user });
  const signIn = await context.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
  });
  check(`sign in ${user.email}`, signIn.ok(), String(signIn.status()));
  return context;
}

const dono = await session(users.dono);
console.log("Seed the owner's farm now in another terminal, then press Enter:");
console.log(`  DATABASE_URL=$DATABASE_URL pnpm db:seed --email ${users.dono.email}`);
await new Promise((resolve) => process.stdin.once("data", resolve));

const farms = await (await dono.request.get("/api/herd/farms")).json();
const farmId = farms.activeFarmId;
const farmHeader = { "x-farm-id": String(farmId) };
check("owner holds every area", farms.farms[0].permissions.team === "edit");

for (const [user, permissions] of [[users.vaqueiro, VAQUEIRO], [users.consultor, CONSULTOR]]) {
  const res = await dono.request.post("/api/herd/farm/invites", {
    headers: farmHeader,
    data: { email: user.email, permissions },
  });
  check(`invite ${user.email}`, res.ok(), String(res.status()));
}

// The invitees sign up after the convite exists: no farm must be created for them.
const vaqueiro = await session(users.vaqueiro, { width: 390, height: 844 });
const blocked = await vaqueiro.request.get("/api/herd");
check("vaqueiro without farm gets pending_invites", blocked.status() === 409, String(blocked.status()));
const convitesPage = await vaqueiro.newPage();
await convitesPage.goto("/dashboard");
await convitesPage.waitForURL("**/convites");
await convitesPage.screenshot({ path: `${OUT}convites-390.png`, fullPage: true });
await convitesPage.getByRole("button", { name: "Aceitar e entrar" }).click();
await convitesPage.waitForURL("**/dashboard");
await convitesPage.screenshot({ path: `${OUT}vaqueiro-painel-390.png`, fullPage: true });

const herd = await (await vaqueiro.request.get("/api/herd", { headers: farmHeader })).json();
check("vaqueiro sees no expenses", Array.isArray(herd.expenses) && herd.expenses.length === 0);
check("vaqueiro sees no treatment cost", herd.treatments.every((t) => t.costBrl === undefined));
const sale = await vaqueiro.request.post("/api/herd/manejo", {
  headers: farmHeader,
  data: { date: "2026-09-12", kind: "sale", earTags: [herd.animals[0].earTag], weighing: true },
});
check("vaqueiro cannot open a venda", sale.status() === 403, String(sale.status()));

const consultor = await session(users.consultor);
const mine = await (await consultor.request.get("/api/herd/invites")).json();
const accepted = await consultor.request.post(`/api/herd/invites/${mine.invites[0].id}/accept`);
check("consultor accepts", accepted.ok());
const breed = await consultor.request.post("/api/herd/breeds", { headers: farmHeader, data: { name: "Angus" } });
check("consultor cannot add a breed", breed.status() === 403, String(breed.status()));
const herdPage = await consultor.newPage();
await herdPage.goto("/herd");
await herdPage.getByText("Somente leitura").first().waitFor();
check("consultor sees no Cadastrar", (await herdPage.getByRole("button", { name: "Cadastrar" }).count()) === 0);
await herdPage.screenshot({ path: `${OUT}consultor-rebanho.png` });

const teamPage = await dono.newPage();
await teamPage.goto("/settings/equipe");
await teamPage.getByText("Membros (3)").waitFor();
await teamPage.screenshot({ path: `${OUT}equipe-dono.png`, fullPage: true });

const team = await (await dono.request.get("/api/herd/farm/team", { headers: farmHeader })).json();
const zeca = team.members.find((m) => m.email === users.vaqueiro.email);
const removed = await dono.request.delete(`/api/herd/farm/members/${zeca.userId}`, { headers: farmHeader });
check("owner removes the vaqueiro", removed.ok());
const after = await vaqueiro.request.get("/api/herd", { headers: farmHeader });
check("removed vaqueiro is refused", after.status() === 403, String(after.status()));

await browser.close();
```

Run: `node <scratchpad>/smoke-equipe.mjs` and seed when it asks (with `DATABASE_URL` pointing at the bridge).
Expected: every line prints `PASS`, and four screenshots land next to the script. Open each screenshot and compare against the canvas artboards: Equipe list, `/convites` at 390px, Painel of the vaqueiro without Arroba/Valor/Financeiro, Rebanho of the consultor with "Somente leitura" and no write buttons. Then check by hand at 390px: the Mais dialog shows the Fazenda select for a user in two farms, and a member row opens `/settings/equipe/[userId]`.

- [ ] **Step 5: Clean up**

Stop `next start` by pid (`ss -ltnp | grep 3010`), then `docker rm -f meubov-bridge`. The `teste.*` users stay in the local database, as earlier smoke tests did.

- [ ] **Step 6: Hand off**

Show the user the screenshots and the test summary, then use superpowers:finishing-a-development-branch. Commit only when the user picks it: one commit on `main` with every changed file plus the spec and this plan, no attribution trailers:

```bash
git add -A lib app components drizzle docs/superpowers/specs/2026-09-12-equipe-permissoes-design.md docs/superpowers/plans/2026-09-12-equipe-permissoes.md ROADMAP.md
git status --short   # map-before.png must stay untracked
git commit -F- <<'EOF'
feat(team): invite members and give each area its own permission

A farm is worked by more than its owner, but nobody could add a member and the
stored role was never read, so a member could do everything. The owner now
invites by e-mail from Configurações > Equipe; nothing is sent, and the person
accepts after signing in with that address. Each member holds Nada, Ver or
Editar per area, filled from the Gerente, Vaqueiro and Consultor presets.

The farm macro checks every route against one requirements table and refuses
routes missing from it. A member without Financeiro gets the herd with every
R$ value stripped and cannot open a venda or entrada. A new account with a
pending convite lands on /convites instead of getting an empty farm, and the
phone's Mais dialog gains the farm switcher.
EOF
```
