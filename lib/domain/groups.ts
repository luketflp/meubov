/**
 * Grupos of the plano de contas: rows of the farm, each under one fixed tipo
 * (GroupKind), named, archived and deleted by the farmer. Every column that
 * holds a grupo holds its id. Pure.
 */
import type { GroupKind, PlanGroup } from "@/lib/types";

/** Every tipo, in the order the Plano de contas and the tree show them. */
export const GROUP_KINDS: readonly GroupKind[] = ["revenue", "expense", "investment", "financing", "partners"];

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  revenue: "Receitas",
  expense: "Despesas",
  investment: "Investimentos",
  financing: "Financiamentos",
  partners: "Sócios",
};

/** The eleven grupos a farm starts with. */
export const DEFAULT_GROUPS: readonly { kind: GroupKind; name: string }[] = [
  { kind: "revenue", name: "Receitas" },
  { kind: "expense", name: "Nutrição" },
  { kind: "expense", name: "Pastagem" },
  { kind: "expense", name: "Mão de obra" },
  { kind: "expense", name: "Sanidade" },
  { kind: "expense", name: "Reprodução" },
  { kind: "expense", name: "Administrativo" },
  { kind: "expense", name: "Outros" },
  { kind: "investment", name: "Investimentos" },
  { kind: "financing", name: "Financiamentos" },
  { kind: "partners", name: "Sócios" },
];

/** Max length of a grupo name. */
export const GROUP_NAME_MAX = 40;

/** Alphabetical, pt-BR. */
export const byGroupName = (a: PlanGroup, b: PlanGroup): number => a.name.localeCompare(b.name, "pt-BR");

/** The grupos of a tipo by name. Archived ones only with `archived: true`, or the one whose id is `keep` (a row already in it). */
export function groupsOf(
  groups: readonly PlanGroup[],
  kind: GroupKind,
  opts: { archived?: boolean; keep?: string } = {}
): PlanGroup[] {
  return groups
    .filter((g) => g.kind === kind && (opts.archived || g.archivedAt === undefined || g.id === opts.keep))
    .sort(byGroupName);
}

/** Name of a grupo; "Grupo removido" when the id names nothing. */
export function groupLabel(id: string, groups: readonly PlanGroup[]): string {
  return groups.find((g) => g.id === id)?.name ?? "Grupo removido";
}

/** Tipo of a grupo; null when the id names nothing. */
export function groupKind(id: string, groups: readonly PlanGroup[]): GroupKind | null {
  return groups.find((g) => g.id === id)?.kind ?? null;
}
