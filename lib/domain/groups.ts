/**
 * Grupos de despesa: the seven built-in ones, written as their key
 * ("nutrition"), and the farm's own, written as their ExpenseGroup id. The
 * single source of grupo order and labels, Receitas and the three outside the
 * resultado included. Pure.
 */
import type { AccountGroup, BuiltinCategory, CapitalGroup, ExpenseCategory, ExpenseGroup } from "@/lib/types";
import { BUILTIN_CATEGORY_LABEL } from "@/lib/domain/labels";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";

/** The seven built-in grupos, in screen order. */
export const BUILTIN_CATEGORIES: readonly BuiltinCategory[] = Object.keys(BUILTIN_CATEGORY_LABEL) as BuiltinCategory[];

/** Receitas and the three grupos outside the resultado. */
export const TOP_GROUP_LABEL: Record<"revenue" | CapitalGroup, string> = {
  revenue: "Receitas",
  investment: "Investimentos",
  financing: "Financiamentos",
  partners: "Sócios",
};

/** Max length of a farm grupo name. */
export const GROUP_NAME_MAX = 40;

/** Every fixed grupo's label by key. */
const FIXED_LABEL = new Map<string, string>([
  ...Object.entries(BUILTIN_CATEGORY_LABEL),
  ...Object.entries(TOP_GROUP_LABEL),
]);

/** The same labels, lowercased: no farm grupo may take one. */
const FIXED_NAMES = new Set([...FIXED_LABEL.values()].map((label) => label.toLowerCase()));

export function isBuiltinCategory(key: string): key is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(key);
}

/**
 * A grupo of Despesas: anything but "revenue", a CapitalGroup, the tree's
 * "expenses" or the ledger's "capital" (a compra de gado). A farm grupo's key
 * is a uuid, so it never clashes with these.
 */
export function isDespesaGroup(key: string): boolean {
  return (
    key !== "revenue" && key !== "expenses" && key !== "capital" && !(CAPITAL_GROUPS as readonly string[]).includes(key)
  );
}

export interface DespesaGroup {
  key: ExpenseCategory;
  label: string;
  /** The farm's own: it shows "da fazenda" on the Plano de contas and in the form's picker. */
  custom: boolean;
  archived: boolean;
}

/** The seven built-ins in screen order, then the farm's by createdAt (ties by name). Archived ones only with
 *  `archived: true`, or the one whose key is `keep` (a row already in it). */
export function despesaGroups(
  groups: readonly ExpenseGroup[],
  opts: { archived?: boolean; keep?: ExpenseCategory } = {}
): DespesaGroup[] {
  const farm = groups
    .filter((g) => opts.archived || g.archivedAt === undefined || g.id === opts.keep)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, "pt-BR"))
    .map((g) => ({ key: g.id, label: g.name, custom: true, archived: g.archivedAt !== undefined }));
  return [
    ...BUILTIN_CATEGORIES.map((key) => ({ key, label: BUILTIN_CATEGORY_LABEL[key], custom: false, archived: false })),
    ...farm,
  ];
}

/** Label of any grupo key: a built-in, Receitas/capital, a farm grupo's name; "Grupo removido" when it resolves to nothing. */
export function groupLabel(key: AccountGroup, groups: readonly ExpenseGroup[]): string {
  return FIXED_LABEL.get(key) ?? groups.find((g) => g.id === key)?.name ?? "Grupo removido";
}

/** True when `name` (trimmed, any case) equals a built-in or top grupo label: such a name is refused. */
export function clashesWithFixedGroup(name: string): boolean {
  return FIXED_NAMES.has(name.trim().toLowerCase());
}
