import { describe, expect, it } from "vitest";
import { accountName, accountsByGroup, counterpartySuggestions, DEFAULT_ACCOUNTS } from "@/lib/domain/accounts";
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import type { Account, Expense } from "@/lib/types";

const account = (overrides: Partial<Account>): Account => ({
  id: "acc-1",
  group: "grp-nutricao",
  name: "Sal mineral",
  ...overrides,
});

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-09-01",
  category: "grp-nutricao",
  amountBrl: 100,
  ...overrides,
});

describe("DEFAULT_ACCOUNTS", () => {
  it("is the standard plano de contas, by the default grupo's name", () => {
    const names = (group: string) =>
      DEFAULT_ACCOUNTS.filter((a) => a.group === group).map((a) => a.name);
    expect(names("Receitas")).toEqual(["Aluguel de pasto", "Venda de esterco", "Outras receitas"]);
    expect(names("Nutrição")).toEqual(["Sal mineral", "Ração e suplemento", "Silagem"]);
    expect(names("Pastagem")).toEqual(["Adubo", "Sementes", "Herbicida", "Roçada"]);
    expect(names("Mão de obra")).toEqual(["Salários", "Encargos", "Diárias"]);
    expect(names("Sanidade")).toEqual(["Vacinas", "Vermífugos", "Medicamentos", "Veterinário"]);
    expect(names("Reprodução")).toEqual(["Sêmen", "IATF e hormônios", "Touros"]);
    expect(names("Administrativo")).toEqual([
      "Energia",
      "Combustível",
      "Manutenção",
      "Impostos e taxas",
      "Contabilidade",
    ]);
    expect(names("Outros")).toEqual([]);
    expect(names("Investimentos")).toEqual(["Benfeitorias", "Máquinas e implementos", "Equipamentos"]);
    expect(names("Financiamentos")).toEqual([]);
    expect(names("Sócios")).toEqual(["Distribuição de lucro"]);
    expect(DEFAULT_ACCOUNTS).toHaveLength(29);
  });

  it("names only default grupos", () => {
    const defaults = new Set(DEFAULT_GROUPS.map((g) => g.name));
    expect(DEFAULT_ACCOUNTS.filter((a) => !defaults.has(a.group))).toEqual([]);
  });
});

describe("accountsByGroup", () => {
  const accounts = [
    account({ id: "a-1", name: "Sal mineral" }),
    account({ id: "a-2", name: "Água" }),
    account({ id: "a-3", name: "Ração e suplemento" }),
    account({ id: "a-4", name: "Silagem", archivedAt: "2026-05-01T00:00:00.000Z" }),
    account({ id: "a-5", group: "grp-receitas", name: "Aluguel de pasto" }),
  ];

  it("groups the active contas by grupo id, sorted by name the Portuguese way", () => {
    const byGroup = accountsByGroup(accounts);
    expect(byGroup["grp-nutricao"].map((a) => a.id)).toEqual(["a-2", "a-3", "a-1"]);
    expect(byGroup["grp-receitas"].map((a) => a.id)).toEqual(["a-5"]);
  });

  it("lists a grupo only once it has a conta to show: no pre-filled keys", () => {
    const farm = [
      ...accounts,
      account({ id: "a-6", group: "grp-maq", name: "Pneus", archivedAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(Object.keys(accountsByGroup(farm)).sort()).toEqual(["grp-nutricao", "grp-receitas"]);
    expect(accountsByGroup(farm, true)["grp-maq"].map((a) => a.id)).toEqual(["a-6"]);
    expect(accountsByGroup([])).toEqual({});
  });

  it("includes archived contas when asked", () => {
    expect(accountsByGroup(accounts, true)["grp-nutricao"].map((a) => a.id)).toEqual([
      "a-2",
      "a-3",
      "a-1",
      "a-4",
    ]);
  });
});

describe("accountName", () => {
  const accounts = [account({ id: "a-1", name: "Sal mineral" })];

  it("names the conta, or null", () => {
    expect(accountName("a-1", accounts)).toBe("Sal mineral");
    expect(accountName("gone", accounts)).toBeNull();
    expect(accountName(undefined, accounts)).toBeNull();
  });
});

describe("counterpartySuggestions", () => {
  it("lists distinct trimmed names, most recent first, without blanks", () => {
    expect(
      counterpartySuggestions([
        expense({ id: "e-1", date: "2026-07-01", counterparty: "Copel" }),
        expense({ id: "e-2", date: "2026-09-01", counterparty: " Agrovet " }),
        expense({ id: "e-3", date: "2026-08-01", counterparty: "   " }),
        expense({ id: "e-4", date: "2026-08-15" }),
        expense({ id: "e-5", date: "2026-08-20", counterparty: "Copel" }),
        expense({ id: "e-6", date: "2026-06-01", counterparty: "Agrovet" }),
      ])
    ).toEqual(["Agrovet", "Copel"]);
  });

  it("keeps at most 20", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      expense({
        id: `e-${i}`,
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        counterparty: `Fornecedor ${i + 1}`,
      })
    );
    const suggestions = counterpartySuggestions(many);
    expect(suggestions).toHaveLength(20);
    expect(suggestions[0]).toBe("Fornecedor 25");
    expect(suggestions[19]).toBe("Fornecedor 6");
  });
});
