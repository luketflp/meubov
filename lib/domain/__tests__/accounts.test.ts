import { describe, expect, it } from "vitest";
import {
  ACCOUNT_GROUP_LABEL,
  ACCOUNT_GROUPS,
  accountName,
  accountsByGroup,
  counterpartySuggestions,
  DEFAULT_ACCOUNTS,
  missingDefaults,
} from "@/lib/domain/accounts";
import type { Account, Expense } from "@/lib/types";

const account = (overrides: Partial<Account>): Account => ({
  id: "acc-1",
  group: "nutrition",
  name: "Sal mineral",
  ...overrides,
});

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-09-01",
  category: "other",
  amountBrl: 100,
  ...overrides,
});

describe("ACCOUNT_GROUPS and ACCOUNT_GROUP_LABEL", () => {
  it("lists Receitas first, then the seven grupos of custo", () => {
    expect(ACCOUNT_GROUPS).toEqual([
      "revenue",
      "nutrition",
      "pasture",
      "labor",
      "health",
      "breeding",
      "admin",
      "other",
    ]);
    expect(ACCOUNT_GROUPS.map((g) => ACCOUNT_GROUP_LABEL[g])).toEqual([
      "Receitas",
      "Nutrição",
      "Pastagem",
      "Mão de obra",
      "Sanidade",
      "Reprodução",
      "Administrativo",
      "Outros",
    ]);
  });
});

describe("DEFAULT_ACCOUNTS", () => {
  it("is the standard plano de contas", () => {
    const names = (group: string) =>
      DEFAULT_ACCOUNTS.filter((a) => a.group === group).map((a) => a.name);
    expect(names("revenue")).toEqual(["Aluguel de pasto", "Venda de esterco", "Outras receitas"]);
    expect(names("nutrition")).toEqual(["Sal mineral", "Ração e suplemento", "Silagem"]);
    expect(names("pasture")).toEqual(["Adubo", "Sementes", "Herbicida", "Roçada"]);
    expect(names("labor")).toEqual(["Salários", "Encargos", "Diárias"]);
    expect(names("health")).toEqual(["Vacinas", "Vermífugos", "Medicamentos", "Veterinário"]);
    expect(names("breeding")).toEqual(["Sêmen", "IATF e hormônios", "Touros"]);
    expect(names("admin")).toEqual([
      "Energia",
      "Combustível",
      "Manutenção",
      "Impostos e taxas",
      "Contabilidade",
    ]);
    expect(names("other")).toEqual([]);
    expect(DEFAULT_ACCOUNTS).toHaveLength(25);
  });
});

describe("accountsByGroup", () => {
  const accounts = [
    account({ id: "a-1", name: "Sal mineral" }),
    account({ id: "a-2", name: "Água" }),
    account({ id: "a-3", name: "Ração e suplemento" }),
    account({ id: "a-4", name: "Silagem", archivedAt: "2026-05-01T00:00:00.000Z" }),
    account({ id: "a-5", group: "revenue", name: "Aluguel de pasto" }),
  ];

  it("groups the active contas sorted by name the Portuguese way", () => {
    const byGroup = accountsByGroup(accounts);
    expect(byGroup.nutrition.map((a) => a.id)).toEqual(["a-2", "a-3", "a-1"]);
    expect(byGroup.revenue.map((a) => a.id)).toEqual(["a-5"]);
  });

  it("has every grupo, empty ones included", () => {
    const byGroup = accountsByGroup(accounts);
    expect(Object.keys(byGroup).sort()).toEqual([...ACCOUNT_GROUPS].sort());
    expect(byGroup.labor).toEqual([]);
  });

  it("includes archived contas when asked", () => {
    expect(accountsByGroup(accounts, true).nutrition.map((a) => a.id)).toEqual([
      "a-2",
      "a-3",
      "a-1",
      "a-4",
    ]);
  });
});

describe("missingDefaults", () => {
  it("skips names the grupo already has, ignoring case and spaces", () => {
    const missing = missingDefaults([
      account({ id: "a-1", group: "nutrition", name: "  sal MINERAL " }),
      account({ id: "a-2", group: "breeding", name: "SÊMEN", archivedAt: "2026-01-01T00:00:00.000Z" }),
      account({ id: "a-3", group: "other", name: "Adubo" }),
    ]);
    expect(missing).toHaveLength(23);
    expect(missing).not.toContainEqual({ group: "nutrition", name: "Sal mineral" });
    expect(missing).not.toContainEqual({ group: "breeding", name: "Sêmen" });
    expect(missing).toContainEqual({ group: "pasture", name: "Adubo" });
  });

  it("is the whole list for a farm with no contas", () => {
    expect(missingDefaults([])).toEqual([...DEFAULT_ACCOUNTS]);
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
