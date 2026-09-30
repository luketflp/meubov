import { describe, expect, it } from "vitest";
import type { BankAccount, Expense, Movement, StatementLine, Transfer } from "@/lib/types";
import {
  candidatesByValue,
  candidatesFor,
  pairKey,
  suggestMatches,
  suggestionReason,
  type Candidate,
} from "@/lib/domain/statements/match";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 0,
};
const CAIXA: BankAccount = { ...SICREDI, id: "caixa", kind: "cash", name: "Caixa da fazenda", isMain: false };

const line = (id: string, date: string, description: string, amountBrl: number): StatementLine => ({
  id,
  importId: "imp",
  bankAccountId: "sicredi",
  date,
  description,
  amountBrl,
  status: "pending",
});

const expense = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  category: "nutrition",
  amountBrl: 4850,
  ...patch,
});

function candidates(expenses: Expense[], movements: Movement[] = [], transfers: Transfer[] = [], paired: string[] = []) {
  return candidatesFor("sicredi", { expenses, movements, transfers, bankAccounts: [SICREDI, CAIXA] }, new Set(paired));
}

const best = (map: Map<string, { candidate: Candidate; confidence: string }[]>, id: string) => {
  const top = map.get(id)?.[0];
  return top ? [top.candidate.target.id, top.confidence] : null;
};

describe("candidatesFor", () => {
  it("takes records of this conta or of none, leaves out paired ones and other contas", () => {
    const list = candidates(
      [
        expense("mine", { paidAt: "2026-09-18", bankAccountId: "sicredi" }),
        expense("none", {}),
        expense("other", { paidAt: "2026-09-18", bankAccountId: "caixa" }),
        expense("paired", {}),
      ],
      [{ id: "sale", type: "sale", date: "2026-09-20", origin: "Engorda", destination: "Minerva", amountBrl: 1 }],
      [
        { id: "t-out", fromId: "sicredi", toId: "caixa", date: "2026-09-24", amountBrl: 1000 },
        { id: "t-else", fromId: "caixa", toId: "card", date: "2026-09-24", amountBrl: 1000 },
      ],
      ["paired"]
    );
    expect(list.map((c) => [c.target.id, c.kind, c.name])).toEqual([
      ["mine", "expense", null],
      ["none", "expense", null],
      ["sale", "sale", "Minerva"],
      ["t-out", "transferOut", "Caixa da fazenda"],
    ]);
  });

  it("leaves a transferência out only when a line of this same conta pairs it", () => {
    const t: Transfer = { id: "t", fromId: "caixa", toId: "sicredi", date: "2026-09-24", amountBrl: 1000 };
    expect(pairKey({ bankAccountId: "caixa", transferId: "t", expenseId: null })).toBe("t:caixa");
    expect(pairKey({ bankAccountId: "sicredi", expenseId: "e" })).toBe("e");
    expect(candidates([], [], [t], ["t:caixa"]).map((c) => c.target.id)).toEqual(["t"]);
    expect(candidates([], [], [t], ["t:sicredi"])).toEqual([]);
  });

  it("leaves out a lançamento of no conta paid on or before the opening date", () => {
    const list = candidates([
      expense("inside-opening", { paidAt: "2026-08-31" }),
      expense("after", { paidAt: "2026-09-01" }),
      expense("pending", { dueDate: "2026-08-20" }),
    ]);
    expect(list.map((c) => c.target.id)).toEqual(["after", "pending"]);
  });

  it("compares a pending lançamento by vencimento and a paid one by payment day", () => {
    const [pending, paid] = candidates([
      expense("p", { date: "2026-09-01", dueDate: "2026-09-25" }),
      expense("q", { date: "2026-09-01", paidAt: "2026-09-18" }),
    ]);
    expect([pending.date, pending.pending, paid.date, paid.pending]).toEqual(["2026-09-25", true, "2026-09-18", false]);
  });
});

describe("suggestMatches", () => {
  it("matches the exact value on the same side within ±5 days only", () => {
    const list = candidates([
      expense("exact", { dueDate: "2026-09-22", amountBrl: 12640 }),
      expense("centavo", { dueDate: "2026-09-22", amountBrl: 12640.01 }),
      expense("far", { dueDate: "2026-09-28", amountBrl: 12640 }),
      expense("receita", { kind: "revenue", category: "other", dueDate: "2026-09-22", amountBrl: 12640 }),
    ]);
    const map = suggestMatches([line("l1", "2026-09-22", "PAGTO BOLETO NUTRON", -12640)], list);
    expect(map.get("l1")?.map((s) => s.candidate.target.id)).toEqual(["exact"]);
  });

  it("is alta by name within 2 days, whatever else is near", () => {
    const list = candidates([
      expense("sertao", { paidAt: "2026-09-18", counterparty: "Agropecuária Sertão" }),
      expense("outro", { paidAt: "2026-09-19", counterparty: "Casa do Criador" }),
    ]);
    const map = suggestMatches([line("l1", "2026-09-18", "PIX ENVIADO AGROPECUARIA SERTAO", -4850)], list);
    expect(map.get("l1")?.map((s) => [s.candidate.target.id, s.confidence])).toEqual([
      ["sertao", "high"],
      ["outro", "medium"],
    ]);
  });

  it("is alta when it is the only candidate within 2 days, média beyond 2 days", () => {
    const list = candidates([
      expense("folha", { dueDate: "2026-09-10", amountBrl: 18400 }),
      expense("nutron", { dueDate: "2026-09-25", amountBrl: 12640, counterparty: "Nutron" }),
    ]);
    const map = suggestMatches(
      [line("l1", "2026-09-10", "PAGTO FOLHA SALARIOS", -18400), line("l2", "2026-09-22", "PAGTO BOLETO NUTRON", -12640)],
      list
    );
    expect(best(map, "l1")).toEqual(["folha", "high"]);
    expect(best(map, "l2")).toEqual(["nutron", "medium"]);
    expect(suggestionReason(map.get("l2")![0])).toBe("mesmo valor, pago 3 dias antes do vencimento, mesmo favorecido");
  });

  it("offers one candidate as alta to the first of two identical lines and média to the second", () => {
    const list = candidates([expense("tarifa", { paidAt: "2026-09-10", amountBrl: 12.5 })]);
    const map = suggestMatches(
      [line("b", "2026-09-10", "TARIFA DOC", -12.5), line("a", "2026-09-10", "TARIFA DOC", -12.5)],
      list
    );
    expect(best(map, "a")).toEqual(["tarifa", "high"]);
    expect(best(map, "b")).toEqual(["tarifa", "medium"]);
  });

  it("puts the closest date first, then alta before média", () => {
    const list = candidates([
      expense("two-days", { paidAt: "2026-09-12", counterparty: "Agrovet" }),
      expense("same-day", { paidAt: "2026-09-10" }),
    ]);
    const map = suggestMatches([line("l1", "2026-09-10", "PIX AGROVET", -4850)], list);
    expect(map.get("l1")?.map((s) => [s.candidate.target.id, s.confidence, s.dayDiff])).toEqual([
      ["same-day", "medium", 0],
      ["two-days", "high", -2],
    ]);
  });

  it("pairs entradas with receitas, vendas and transferências in; skips resolved lines", () => {
    const list = candidates(
      [],
      [{ id: "sale", type: "sale", date: "2026-09-20", origin: "Engorda", destination: "Frigorífico Minerva", amountBrl: 148320 }],
      [{ id: "t-in", fromId: "caixa", toId: "sicredi", date: "2026-09-21", amountBrl: 148320 }]
    );
    const resolved = { ...line("done", "2026-09-20", "X", 148320), status: "matched" as const };
    const map = suggestMatches([line("l1", "2026-09-20", "PIX RECEBIDO FRIGORIFICO MINERVA", 148320), resolved], list);
    expect(map.get("l1")?.map((s) => [s.candidate.target.id, s.confidence])).toEqual([
      ["sale", "high"],
      ["t-in", "medium"],
    ]);
    expect(map.has("done")).toBe(false);
  });
});

describe("candidatesByValue", () => {
  it("finds records of the line's side and the typed value at any date", () => {
    const list = candidates([
      expense("late", { dueDate: "2026-08-01", amountBrl: 980 }),
      expense("revenue", { kind: "revenue", category: "other", dueDate: "2026-09-01", amountBrl: 980 }),
    ]);
    expect(candidatesByValue(line("l", "2026-09-22", "BOLETO", -1000), list, 980).map((c) => c.target.id)).toEqual(["late"]);
  });
});
