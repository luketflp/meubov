/**
 * Plano de contas: the grupos (Receitas, the seven built-in grupos of custo,
 * the farm's own grupos de despesa and the three outside the resultado) and
 * the farm's contas inside them. Pure. Order and labels of the grupos live in
 * groups.ts.
 */
import type { Account, AccountGroup, Expense } from "@/lib/types";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";

/** What "Sugerir contas padrão" creates. */
export const DEFAULT_ACCOUNTS: readonly { group: AccountGroup; name: string }[] = [
  { group: "revenue", name: "Aluguel de pasto" },
  { group: "revenue", name: "Venda de esterco" },
  { group: "revenue", name: "Outras receitas" },
  { group: "nutrition", name: "Sal mineral" },
  { group: "nutrition", name: "Ração e suplemento" },
  { group: "nutrition", name: "Silagem" },
  { group: "pasture", name: "Adubo" },
  { group: "pasture", name: "Sementes" },
  { group: "pasture", name: "Herbicida" },
  { group: "pasture", name: "Roçada" },
  { group: "labor", name: "Salários" },
  { group: "labor", name: "Encargos" },
  { group: "labor", name: "Diárias" },
  { group: "health", name: "Vacinas" },
  { group: "health", name: "Vermífugos" },
  { group: "health", name: "Medicamentos" },
  { group: "health", name: "Veterinário" },
  { group: "breeding", name: "Sêmen" },
  { group: "breeding", name: "IATF e hormônios" },
  { group: "breeding", name: "Touros" },
  { group: "admin", name: "Energia" },
  { group: "admin", name: "Combustível" },
  { group: "admin", name: "Manutenção" },
  { group: "admin", name: "Impostos e taxas" },
  { group: "admin", name: "Contabilidade" },
  { group: "investment", name: "Benfeitorias" },
  { group: "investment", name: "Máquinas e implementos" },
  { group: "investment", name: "Equipamentos" },
  { group: "partners", name: "Distribuição de lucro" },
];

/**
 * Contas per grupo, sorted by name; archived ones only when asked. Receitas,
 * the seven built-in grupos and the three outside the resultado are always
 * there (maybe empty); a farm grupo only once it has a conta, so read
 * `byGroup[key] ?? []`.
 */
export function accountsByGroup(
  accounts: Account[],
  includeArchived = false
): Record<AccountGroup, Account[]> {
  const byGroup: Record<AccountGroup, Account[]> = Object.fromEntries(
    ["revenue", ...BUILTIN_CATEGORIES, ...CAPITAL_GROUPS].map((g): [string, Account[]] => [g, []])
  );
  for (const a of accounts) {
    if (includeArchived || a.archivedAt === undefined) (byGroup[a.group] ??= []).push(a);
  }
  for (const list of Object.values(byGroup)) list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return byGroup;
}

const nameKey = (group: AccountGroup, name: string) => `${group}:${name.trim().toLowerCase()}`;

/** The standard contas the farm does not have yet (archived ones count as had). */
export function missingDefaults(accounts: Account[]): { group: AccountGroup; name: string }[] {
  const have = new Set(accounts.map((a) => nameKey(a.group, a.name)));
  return DEFAULT_ACCOUNTS.filter((d) => !have.has(nameKey(d.group, d.name)));
}

/** Name of a conta, null when unset or gone. */
export function accountName(accountId: string | undefined, accounts: Account[]): string | null {
  if (accountId === undefined) return null;
  return accounts.find((a) => a.id === accountId)?.name ?? null;
}

/** "Pago para / recebido de" already typed, most recent first, at most 20. */
export function counterpartySuggestions(expenses: Expense[]): string[] {
  const names = new Set<string>();
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date))) {
    const name = e.counterparty?.trim();
    if (name) names.add(name);
    if (names.size === 20) break;
  }
  return [...names];
}
