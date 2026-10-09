import { describe, expect, it } from "vitest";
import { bankStatement, statementDate } from "@/lib/reports/bankStatement";
import type { PlanInputs } from "@/lib/domain/planTree";
import type { Period } from "@/lib/domain/period";
import type { BankAccount, Expense } from "@/lib/types";

const TODAY = "2026-10-07";
const SEPTEMBER: Period = { start: "2026-09-01", end: "2026-09-30" };

const bank = (id: string, overrides: Partial<BankAccount> = {}): BankAccount => ({
  id,
  kind: "checking",
  name: id,
  openingBalanceBrl: 0,
  openingDate: "2026-01-01",
  isMain: false,
  pendingLines: 0,
  ...overrides,
});

const expense = (id: string, overrides: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 100,
  ...overrides,
});

const INPUTS: PlanInputs = {
  bankAccounts: [
    bank("Cartão", { kind: "card" }),
    bank("Caixa", { kind: "cash" }),
    bank("Sicredi", { isMain: true, label: "c/c 12.345-6", openingBalanceBrl: 10000 }),
    bank("Antiga", { archivedAt: "2026-05-01T00:00:00.000Z" }),
  ],
  expenses: [
    // Before the window: inside the saldo anterior.
    expense("agosto", { paidAt: "2026-08-20", bankAccountId: "Sicredi", amountBrl: 1000 }),
    expense("cartao-agosto", { paidAt: "2026-08-25", bankAccountId: "Cartão", amountBrl: 200 }),
    // Dated in August, paid in September.
    expense("sal", {
      date: "2026-08-28",
      dueDate: "2026-09-05",
      paidAt: "2026-09-05",
      bankAccountId: "Sicredi",
      amountBrl: 500,
      accountId: "acc-sal",
      history: "Sal mineral 60 sc",
      counterparty: "Agropecuária Sertão",
      document: "NF 1.204",
    }),
    expense("sem-historico", { paidAt: "2026-09-08", bankAccountId: "Caixa", amountBrl: 40, category: "admin" }),
    expense("cartao-setembro", { paidAt: "2026-09-16", bankAccountId: "Cartão", amountBrl: 150, accountId: "acc-sal" }),
    // Pending: on no conta.
    expense("pendente", { amountBrl: 999 }),
  ],
  accounts: [{ id: "acc-sal", group: "nutrition", name: "Sal mineral" }],
  movements: [
    {
      id: "venda",
      type: "sale",
      date: "2026-09-18",
      origin: "Fazenda",
      destination: "Frigorífico Minerva",
      amountBrl: 2000,
      bankAccountId: "Sicredi",
    },
  ],
  transfers: [
    { id: "t-caixa", fromId: "Sicredi", toId: "Caixa", date: "2026-09-02", amountBrl: 300 },
    { id: "t-fatura", fromId: "Sicredi", toId: "Cartão", date: "2026-09-28", amountBrl: 200, notes: "Fatura de agosto" },
  ],
  manejoSessions: [],
  animals: [],
  lots: [],
  planGroups: [
    { id: "nutrition", kind: "expense", name: "Nutrição", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "admin", kind: "expense", name: "Administrativo", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

const all = bankStatement(INPUTS, "all", SEPTEMBER, TODAY);
const section = (id: string) => all.find((s) => s.bank.id === id)!;

describe("bankStatement", () => {
  it("lists the contas as Contas bancárias does, an archived one only when it moved in the window", () => {
    expect(all.map((s) => s.bank.id)).toEqual(["Sicredi", "Caixa", "Cartão"]);
  });

  it("opens each conta on its saldo at the end of the day before, and closes on the lines", () => {
    const sicredi = section("Sicredi");
    expect([sicredi.opening, sicredi.ins, sicredi.outs, sicredi.closing]).toEqual([9000, 2000, 1000, 10000]);
    expect(sicredi.lines.map((l) => [l.paidAt, l.amountBrl, l.balance])).toEqual([
      ["2026-09-02", -300, 8700],
      ["2026-09-05", -500, 8200],
      ["2026-09-18", 2000, 10200],
      ["2026-09-28", -200, 10000],
    ]);
  });

  it("carries the lançamento's emissão, vencimento, documento, pago para, histórico and conta do plano", () => {
    expect(section("Sicredi").lines[1]).toMatchObject({
      issuedAt: "2026-08-28",
      dueDate: "2026-09-05",
      document: "NF 1.204",
      counterparty: "Agropecuária Sertão",
      history: "Sal mineral 60 sc",
      planAccount: "Nutrição › Sal mineral",
      locked: false,
    });
    expect(section("Sicredi").lines[2]).toMatchObject({
      counterparty: "Frigorífico Minerva",
      history: "Venda de gado",
      planAccount: "Receitas › Venda de gado",
      locked: true,
    });
    // Without histórico nor conta: the grupo names it.
    expect(section("Caixa").lines[1]).toMatchObject({ history: "Administrativo", planAccount: "Administrativo" });
  });

  it("shows both sides of a transferência, named after the other conta unless it has a note", () => {
    expect(section("Sicredi").lines[0]).toMatchObject({
      history: "Transferência para Caixa",
      planAccount: "Transferência",
      issuedAt: "2026-09-02",
      dueDate: null,
      counterparty: null,
    });
    expect(section("Caixa").lines[0]).toMatchObject({ history: "Transferência de Sicredi", amountBrl: 300, balance: 300 });
    expect(section("Cartão").lines.at(-1)).toMatchObject({ history: "Fatura de agosto", amountBrl: 200 });
  });

  it("keeps a cartão's saldo negative: what is owed on it", () => {
    const card = section("Cartão");
    expect([card.opening, card.ins, card.outs, card.closing]).toEqual([-200, 200, 150, -150]);
  });

  it("takes one conta when asked, archived or not", () => {
    expect(bankStatement(INPUTS, "Caixa", SEPTEMBER, TODAY).map((s) => s.bank.id)).toEqual(["Caixa"]);
    expect(bankStatement(INPUTS, "Antiga", SEPTEMBER, TODAY)).toMatchObject([{ bank: { id: "Antiga" }, lines: [] }]);
    expect(bankStatement(INPUTS, "sumiu", SEPTEMBER, TODAY)).toEqual([]);
  });
});

describe("statementDate", () => {
  it("reads dd/mm in the window's year, dd/mm/aa off it", () => {
    expect(statementDate("2026-09-05", SEPTEMBER)).toBe("05/09");
    expect(statementDate("2025-12-30", SEPTEMBER)).toBe("30/12/25");
  });
});
