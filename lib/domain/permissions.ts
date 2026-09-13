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
