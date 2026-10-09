/**
 * Plano de contas: the farm's contas inside its grupos (lib/domain/groups.ts
 * lists the grupos). Pure.
 */
import type { Account, AccountGroup, Expense } from "@/lib/types";

/** What "Sugerir contas padrão" creates: `group` is the default grupo's NAME (lib/domain/groups.ts DEFAULT_GROUPS). */
export const DEFAULT_ACCOUNTS: readonly { group: string; name: string }[] = [
  { group: "Receitas", name: "Aluguel de pasto" },
  { group: "Receitas", name: "Venda de esterco" },
  { group: "Receitas", name: "Outras receitas" },
  { group: "Nutrição", name: "Sal mineral" },
  { group: "Nutrição", name: "Ração e suplemento" },
  { group: "Nutrição", name: "Silagem" },
  { group: "Pastagem", name: "Adubo" },
  { group: "Pastagem", name: "Sementes" },
  { group: "Pastagem", name: "Herbicida" },
  { group: "Pastagem", name: "Roçada" },
  { group: "Mão de obra", name: "Salários" },
  { group: "Mão de obra", name: "Encargos" },
  { group: "Mão de obra", name: "Diárias" },
  { group: "Sanidade", name: "Vacinas" },
  { group: "Sanidade", name: "Vermífugos" },
  { group: "Sanidade", name: "Medicamentos" },
  { group: "Sanidade", name: "Veterinário" },
  { group: "Reprodução", name: "Sêmen" },
  { group: "Reprodução", name: "IATF e hormônios" },
  { group: "Reprodução", name: "Touros" },
  { group: "Administrativo", name: "Energia" },
  { group: "Administrativo", name: "Combustível" },
  { group: "Administrativo", name: "Manutenção" },
  { group: "Administrativo", name: "Impostos e taxas" },
  { group: "Administrativo", name: "Contabilidade" },
  { group: "Investimentos", name: "Benfeitorias" },
  { group: "Investimentos", name: "Máquinas e implementos" },
  { group: "Investimentos", name: "Equipamentos" },
  { group: "Sócios", name: "Distribuição de lucro" },
];

/** Contas per grupo id, sorted by name; archived ones only when asked. No pre-filled keys: read `byGroup[id] ?? []`. */
export function accountsByGroup(
  accounts: Account[],
  includeArchived = false
): Record<AccountGroup, Account[]> {
  const byGroup: Record<AccountGroup, Account[]> = {};
  for (const a of accounts) {
    if (includeArchived || a.archivedAt === undefined) (byGroup[a.group] ??= []).push(a);
  }
  for (const list of Object.values(byGroup)) list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return byGroup;
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
