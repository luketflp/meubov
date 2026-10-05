import { describe, expect, it } from "vitest";
import type { Account, Expense } from "@/lib/types";
import { archiveGroupText, groupEntryCount } from "@/components/finance/plano/GroupHeader";

/** The id of the farm grupo "Máquinas e veículos". */
const MAQUINAS = "g-maquinas";
const diesel: Account = { id: "a-diesel", group: MAQUINAS, name: "Diesel" };
const sal: Account = { id: "a-sal", group: "nutrition", name: "Sal mineral" };

/** A despesa of R$ 100,00 in Nutrição on 2026-09-05; `patch` moves it. */
const despesa = (id: string, patch: Partial<Expense> = {}): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-05",
  category: "nutrition",
  amountBrl: 100,
  ...patch,
});

describe("groupEntryCount", () => {
  it("counts the lançamentos in the grupo or in one of its contas, however old", () => {
    const expenses = [
      despesa("e1", { category: MAQUINAS }),
      despesa("e2", { category: MAQUINAS, accountId: diesel.id, date: "2019-01-10" }),
      despesa("e3", { accountId: sal.id }),
      despesa("e4"),
    ];
    expect(groupEntryCount(MAQUINAS, expenses, [diesel, sal])).toBe(2);
  });

  it("counts a lançamento of one of its contas that carries another grupo", () => {
    // Before the server tied a despesa to its conta's grupo, the two could disagree.
    expect(groupEntryCount(MAQUINAS, [despesa("e1", { category: "admin", accountId: diesel.id })], [diesel])).toBe(1);
  });

  it("is zero for a grupo nothing was ever lançado in, contas or not", () => {
    const vazio: Account = { id: "a-baia", group: "g-confinamento", name: "Baias" };
    expect(groupEntryCount("g-confinamento", [despesa("e1", { accountId: sal.id })], [diesel, sal, vazio])).toBe(0);
  });
});

describe("archiveGroupText", () => {
  it("names the contas that leave the forms and the lançamentos that stay", () => {
    expect(archiveGroupText(3, 22)).toBe(
      "O grupo e as 3 contas dele saem do formulário de lançamento e do Orçamento da próxima safra. Os 22 lançamentos continuam no Painel, em Lançamentos e no custo dos meses em que foram feitos."
    );
  });

  it("says one conta and one lançamento in the singular", () => {
    expect(archiveGroupText(1, 1)).toBe(
      "O grupo e a conta dele saem do formulário de lançamento e do Orçamento da próxima safra. O lançamento continua no Painel, em Lançamentos e no custo do mês em que foi feito."
    );
  });

  it("leaves out what the grupo does not have", () => {
    expect(archiveGroupText(0, 0)).toBe("O grupo sai do formulário de lançamento e do Orçamento da próxima safra.");
  });
});
