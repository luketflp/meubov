import { describe, expect, it } from "vitest";
import type { BankAccount, Expense, Movement, Transfer } from "@/lib/types";
import {
  accountBalance,
  accountMovements,
  bankTotal,
  faturaOf,
  payingAccounts,
  type BankInputs,
} from "@/lib/domain/bankAccounts";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 10000,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 0,
};
const CAIXA: BankAccount = { ...SICREDI, id: "caixa", kind: "cash", name: "Caixa", openingBalanceBrl: 500, isMain: false };
const CARD: BankAccount = {
  ...SICREDI,
  id: "card",
  kind: "card",
  name: "Cartão Sicredi",
  openingBalanceBrl: 0,
  isMain: false,
  closingDay: 31,
  dueDay: 10,
  paysFromId: "sicredi",
};

const expense = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  category: "nutrition",
  amountBrl: 100,
  ...patch,
});

const EMPTY: BankInputs = { expenses: [], movements: [], transfers: [] };

describe("accountBalance", () => {
  it("adds what was paid and received by the conta after the opening date only", () => {
    const inputs: BankInputs = {
      ...EMPTY,
      expenses: [
        // On the opening day: already inside the saldo inicial.
        expense("old", { paidAt: "2026-08-31", bankAccountId: "sicredi", amountBrl: 999 }),
        expense("feed", { paidAt: "2026-09-05", bankAccountId: "sicredi", amountBrl: 1200 }),
        expense("rent", { kind: "revenue", category: "other", paidAt: "2026-09-06", bankAccountId: "sicredi", amountBrl: 300 }),
        // Pending, another conta, no conta: none of them count here.
        expense("pending", { bankAccountId: "sicredi" }),
        expense("cash", { paidAt: "2026-09-05", bankAccountId: "caixa" }),
        expense("before-contas", { paidAt: "2026-09-05" }),
      ],
    };
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(9100);
    expect(accountBalance(SICREDI, inputs, "2026-09-05")).toBe(8800);
    expect(accountBalance(SICREDI, inputs, "2026-08-31")).toBe(10000);
  });

  it("counts vendas, compras and transferências", () => {
    const movements: Movement[] = [
      { id: "m-sale", type: "sale", date: "2026-09-20", origin: "Engorda", destination: "Minerva", amountBrl: 148320, bankAccountId: "sicredi" },
      { id: "m-buy", type: "purchase", date: "2026-09-21", origin: "Leilão", destination: "Recria", amountBrl: 20000, bankAccountId: "sicredi" },
      { id: "m-move", type: "transfer", date: "2026-09-21", origin: "A", destination: "B", bankAccountId: "sicredi" },
    ];
    const transfers: Transfer[] = [{ id: "t-1", fromId: "sicredi", toId: "caixa", date: "2026-09-15", amountBrl: 2000 }];
    const inputs = { ...EMPTY, movements, transfers };
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(10000 + 148320 - 20000 - 2000);
    expect(accountBalance(CAIXA, inputs, "2026-09-30")).toBe(2500);
    // A transferência never changes the saldo em contas.
    expect(bankTotal([SICREDI, CAIXA], { ...EMPTY, transfers }, "2026-09-30")).toBe(10500);
  });

  it("keeps cartões and archived contas out of the saldo em contas", () => {
    const archived = { ...CAIXA, id: "old", archivedAt: "2026-09-01T00:00:00.000Z" };
    expect(bankTotal([SICREDI, CARD, archived], EMPTY, "2026-09-30")).toBe(10000);
  });
});

describe("accountMovements", () => {
  it("lists the window newest first with the saldo after each line", () => {
    const inputs: BankInputs = {
      ...EMPTY,
      expenses: [
        expense("a", { paidAt: "2026-09-02", bankAccountId: "sicredi", amountBrl: 100.1 }),
        expense("b", { paidAt: "2026-09-10", bankAccountId: "sicredi", amountBrl: 0.2 }),
        expense("c", { paidAt: "2026-10-02", bankAccountId: "sicredi", amountBrl: 50 }),
      ],
      transfers: [{ id: "t", fromId: "caixa", toId: "sicredi", date: "2026-09-05", amountBrl: 1000 }],
    };
    const rows = accountMovements(SICREDI, inputs, { start: "2026-09-03", end: "2026-09-30" });
    expect(rows.map((r) => [r.id, r.kind, r.amountBrl, r.balance])).toEqual([
      ["b", "expense", -0.2, 10899.7],
      ["t", "transferIn", 1000, 10899.9],
    ]);
  });
});

describe("faturaOf", () => {
  it("closes on day 31 at the end of each month, February included", () => {
    expect(faturaOf(CARD, "2026-09-15")).toEqual({ opensAfter: "2026-08-31", closing: "2026-09-30", due: "2026-10-10" });
    expect(faturaOf(CARD, "2027-02-28")).toEqual({ opensAfter: "2027-01-31", closing: "2027-02-28", due: "2027-03-10" });
    expect(faturaOf(CARD, "2028-02-29").closing).toBe("2028-02-29");
    expect(faturaOf(CARD, "2027-03-01")).toEqual({ opensAfter: "2027-02-28", closing: "2027-03-31", due: "2027-04-10" });
  });

  it("moves a purchase after the closing day to the next fatura, across the year", () => {
    const card = { closingDay: 5, dueDay: 15 };
    expect(faturaOf(card, "2026-12-05")).toEqual({ opensAfter: "2026-11-05", closing: "2026-12-05", due: "2026-12-15" });
    expect(faturaOf(card, "2026-12-06")).toEqual({ opensAfter: "2026-12-05", closing: "2027-01-05", due: "2027-01-15" });
  });

  it("falls due the month after when the due day is not after the closing day", () => {
    expect(faturaOf({ closingDay: 25, dueDay: 25 }, "2026-09-10").due).toBe("2026-10-25");
    expect(faturaOf({ closingDay: 25, dueDay: 31 }, "2027-01-26")).toMatchObject({ closing: "2027-02-25", due: "2027-02-28" });
  });
});

describe("a cartão's saldo", () => {
  it("is what is owed: saldo inicial, purchases, fatura payments and transfers out", () => {
    const card = { ...CARD, openingBalanceBrl: -400 };
    const inputs: BankInputs = {
      ...EMPTY,
      expenses: [
        expense("diesel", { paidAt: "2026-09-02", bankAccountId: "card", amountBrl: 3150 }),
        expense("vet", { paidAt: "2026-09-30", bankAccountId: "card", amountBrl: 90 }),
        expense("next", { paidAt: "2026-10-01", bankAccountId: "card", amountBrl: 45 }),
      ],
      transfers: [
        // Paying the fatura that was open on the opening date.
        { id: "pay-aug", fromId: "sicredi", toId: "card", date: "2026-09-10", amountBrl: 400 },
        // A transfer out of a card (a legacy row): it adds to what is owed.
        { id: "out", fromId: "card", toId: "caixa", date: "2026-09-12", amountBrl: 60 },
      ],
    };
    // "A pagar no cartão" = -saldo.
    expect(-accountBalance(card, inputs, "2026-09-27")).toBe(400 + 3150 - 400 + 60);
    expect(-accountBalance(card, inputs, "2026-10-01")).toBe(400 + 3150 - 400 + 60 + 90 + 45);
    expect(-accountBalance(card, inputs, "2026-08-31")).toBe(400);
    // The payment leaves the conta corrente, never the resultado.
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(9600);
  });
});

describe("payingAccounts", () => {
  it("offers the conta principal first, cartões for despesas only, no archived conta", () => {
    const archived = { ...CAIXA, id: "old", archivedAt: "2026-09-01T00:00:00.000Z" };
    const list = [CARD, CAIXA, archived, SICREDI];
    expect(payingAccounts(list, "expense").map((a) => a.id)).toEqual(["sicredi", "card", "caixa"]);
    expect(payingAccounts(list, "revenue").map((a) => a.id)).toEqual(["sicredi", "caixa"]);
  });
});
